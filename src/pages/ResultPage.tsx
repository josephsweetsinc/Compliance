import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, ComplianceReport } from '../types';
import { generateCompliancePdf } from '../services/pdfService';
import { formatDate } from '../lib/utils';
import { LegalDisclaimer } from '../components/LegalDisclaimer';
import { CheckCircle, XCircle, AlertCircle, Download, Trash2, ChevronLeft, Calendar, User, Clock, Activity, FileText, Mail, Loader2, Check, Users, Shield, ShieldAlert, FileX, History, FileUp, HelpCircle } from 'lucide-react';

export default function ResultPage({ profile }: { profile: UserProfile }) {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLetterPreview, setShowLetterPreview] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(profile.email || '');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [emailErrorDetails, setEmailErrorDetails] = useState<string | null>(null);
  const navigate = useNavigate();

  // Multi-Stakeholder Email Dispatch States
  const [driverEmail, setDriverEmail] = useState('');
  const [examinerEmail, setExaminerEmail] = useState('');
  const [employerEmail, setEmployerEmail] = useState('');
  const [customStakeholderName, setCustomStakeholderName] = useState('');
  const [customStakeholderEmail, setCustomStakeholderEmail] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  const [emailStatuses, setEmailStatuses] = useState<{
    driver: { status: 'idle' | 'sending' | 'success' | 'error'; error?: string };
    examiner: { status: 'idle' | 'sending' | 'success' | 'error'; error?: string };
    employer: { status: 'idle' | 'sending' | 'success' | 'error'; error?: string };
    custom: { status: 'idle' | 'sending' | 'success' | 'error'; error?: string };
  }>({
    driver: { status: 'idle' },
    examiner: { status: 'idle' },
    employer: { status: 'idle' },
    custom: { status: 'idle' },
  });

  // Expiration countdown removed for accurate HIPAA compliance record retention

  useEffect(() => {
    const fetchReport = async () => {
      if (!id) return;
      const reportPath = `reports/${id}`;
      try {
        const docRef = doc(db, 'reports', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as ComplianceReport;
          if (data.clinicId !== profile.uid) {
            setError('Unauthorized access to this report.');
          } else {
            setReport({ id: docSnap.id, ...data });
          }
        } else {
          setError('Report not found.');
        }
      } catch (err: any) {
        handleFirestoreError(err, OperationType.GET, reportPath);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [id, profile.uid]);

  // Load remembered stakeholder emails on report change
  useEffect(() => {
    if (report) {
      const storedDriver = localStorage.getItem(`email_driver_${report.patientName}`);
      if (storedDriver) setDriverEmail(storedDriver);
      
      const storedExaminer = localStorage.getItem(`email_examiner_${report.patientName}`);
      if (storedExaminer) setExaminerEmail(storedExaminer);

      const storedEmployer = localStorage.getItem(`email_employer_${report.patientName}`);
      if (storedEmployer) setEmployerEmail(storedEmployer);
    }
  }, [report]);

  const sendStakeholderEmail = async (recipientType: 'driver' | 'examiner' | 'employer' | 'custom') => {
    if (!report) return;

    let targetEmail = '';
    
    if (recipientType === 'driver') {
      targetEmail = driverEmail;
    } else if (recipientType === 'examiner') {
      targetEmail = examinerEmail;
    } else if (recipientType === 'employer') {
      targetEmail = employerEmail;
    } else if (recipientType === 'custom') {
      targetEmail = customStakeholderEmail;
    }

    if (!targetEmail || !targetEmail.trim()) {
      setEmailStatuses(prev => ({
        ...prev,
        [recipientType]: { status: 'error', error: 'Email address is required.' }
      }));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail.trim())) {
      setEmailStatuses(prev => ({
        ...prev,
        [recipientType]: { status: 'error', error: 'Invalid email format.' }
      }));
      return;
    }

    // Set sending status
    setEmailStatuses(prev => ({
      ...prev,
      [recipientType]: { status: 'sending' }
    }));

    try {
      // Generate compliance report PDF in-memory as base64
      const pdfDoc = generateCompliancePdf(report, profile.clinicName, false);
      const pdfBase64 = pdfDoc.output('datauristring');

      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => 'user-session-token') : 'user-session-token';

      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: targetEmail.trim(),
          patientName: report.patientName,
          status: report.status,
          reportId: report.id,
          pdfBase64: pdfBase64,
          recipientRole: recipientType,
          customMessage: customMessage,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.details || data.error || data.message || `Server responded with status code ${response.status}`);
      }

      setEmailStatuses(prev => ({
        ...prev,
        [recipientType]: { status: 'success' }
      }));

      // Keep success status visible for some time
      setTimeout(() => {
        setEmailStatuses(prev => ({
          ...prev,
          [recipientType]: { status: 'idle' }
        }));
      }, 4000);
    } catch (err: any) {
      console.error(`Email dispatch exception for ${recipientType}:`, err);
      setEmailStatuses(prev => ({
        ...prev,
        [recipientType]: { status: 'error', error: err.message || 'Dispatch Error' }
      }));
    }
  };

  const handleDownload = async () => {
    if (report) {
      setDownloadingPdf(true);
      // Small delay to allow UI to show loading state before blocking CPU with PDF generation
      setTimeout(() => {
        try {
          generateCompliancePdf(report, profile.clinicName);
        } finally {
          setDownloadingPdf(false);
        }
      }, 600);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Are you sure you want to delete this report?')) return;
    const reportPath = `reports/${id}`;
    try {
      await deleteDoc(doc(db, 'reports', id));
      navigate('/history');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, reportPath);
    }
  };

  const handleSendEmail = async () => {
    if (!report || sendingEmail) return;
    
    setSendingEmail(true);
    setEmailStatus('idle');
    setEmailErrorDetails(null);
    
    try {
      // Generate compliance report PDF in-memory as base64
      const pdfDoc = generateCompliancePdf(report, profile.clinicName, false);
      const pdfBase64 = pdfDoc.output('datauristring');

      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recipientEmail,
          patientName: report.patientName,
          status: report.status,
          reportId: report.id,
          pdfBase64: pdfBase64,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.details || data.error || data.message || `Server responded with status code ${response.status}`);
      }

      setEmailStatus('success');
      setTimeout(() => setEmailStatus('idle'), 4000);
    } catch (err: any) {
      console.error('Email error:', err);
      setEmailStatus('error');
      setEmailErrorDetails(err.message || 'Verification Error');
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !report) {
    const isUnauthorized = error?.toLowerCase().includes('unauthorized');
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center py-12 px-4 animate-in fade-in duration-300">
        <div className="max-w-lg w-full bg-white dark:bg-[#0f172a] rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 shadow-xl text-center space-y-6 relative overflow-hidden">
          {/* Accent top stripe */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500" />

          {/* Icon Badge */}
          <div className="flex justify-center">
            <div className={`p-4 rounded-2xl ${isUnauthorized ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'}`}>
              {isUnauthorized ? <ShieldAlert size={42} /> : <FileX size={42} />}
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wider uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {isUnauthorized ? '403 Access Denied' : '404 Report Not Found'}
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {isUnauthorized ? 'Unauthorized Access' : 'Report Unavailable or Expired'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {error || 'The requested CPAP compliance report could not be found. The link may be expired, invalid, or deleted by the operator.'}
            </p>
          </div>

          {/* Guidance Card */}
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800 text-left space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <HelpCircle size={14} className="text-blue-500" />
              <span>Recommended Next Steps:</span>
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-400">
              <li>Browse your <strong>Report History</strong> to access all saved compliance evaluations.</li>
              <li>Verify that you are signed into the correct operator or clinic profile.</li>
              <li>If you need a new compliance evaluation, re-upload the CPAP report PDF.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              to="/dashboard/history"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <History size={16} />
              <span>View Report History</span>
            </Link>
            <Link
              to="/dashboard/upload"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-sm transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <FileUp size={16} />
              <span>Upload New Report</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCompliant = report.status === 'Compliant';

  if (showLetterPreview) {
    return (
      <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button 
            onClick={() => setShowLetterPreview(false)} 
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition-colors cursor-pointer min-h-[44px]"
          >
            <ChevronLeft size={20} />
            <span>Back to Analysis</span>
          </button>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                <Mail size={16} />
              </div>
              <input
                type="email"
                placeholder="Recipient Email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="pl-9 pr-4 py-2.5 text-base sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-56 transition-all min-h-[44px]"
              />
            </div>
            <button
              onClick={handleSendEmail}
              disabled={sendingEmail || downloadingPdf}
              className={`flex items-center justify-center gap-2 font-bold py-2.5 px-4 sm:px-6 rounded-xl transition-all shadow-md min-h-[44px] cursor-pointer text-xs sm:text-sm ${
                emailStatus === 'success' 
                  ? 'bg-emerald-600 text-white shadow-emerald-200' 
                  : emailStatus === 'error'
                  ? 'bg-rose-600 text-white shadow-rose-200'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-slate-100 disabled:opacity-50'
              }`}
            >
              {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              <span>{sendingEmail ? 'Sending...' : emailStatus === 'success' ? 'Sent!' : emailStatus === 'error' ? 'Error' : 'Email Report'}</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={downloadingPdf || sendingEmail}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-2.5 px-4 sm:px-6 rounded-xl transition-all shadow-md shadow-blue-200 disabled:shadow-none min-h-[44px] cursor-pointer text-xs sm:text-sm"
            >
              {downloadingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span>{downloadingPdf ? 'Processing...' : 'Download PDF Letter'}</span>
            </button>
          </div>
        </header>

        {emailStatus === 'error' && emailErrorDetails && (
          <div className="max-w-4xl mx-auto bg-rose-50 border border-rose-200 rounded-2xl p-5 text-sm text-rose-800 animate-in fade-in duration-300 shadow-sm font-sans">
            <div className="flex gap-3">
              <AlertCircle className="text-rose-600 shrink-0 w-5 h-5 mt-0.5" />
              <div className="space-y-2">
                <p className="font-bold text-rose-900">Email Dispatch Exception</p>
                <p className="opacity-95 text-rose-800 font-medium">{emailErrorDetails}</p>
                {emailErrorDetails.toLowerCase().includes('sandbox') ||
                 emailErrorDetails.toLowerCase().includes('onboarding') ||
                 emailErrorDetails.toLowerCase().includes('restrict') ||
                 emailErrorDetails.toLowerCase().includes('validation') ||
                 (recipientEmail.toLowerCase() !== 'josephsweetsinc@gmail.com' && !emailErrorDetails.toLowerCase().includes('api key') && !emailErrorDetails.toLowerCase().includes('invalid')) ? (
                  <div className="mt-3 p-4 rounded-xl bg-white/80 border border-rose-100 text-xs text-rose-700 leading-relaxed font-sans shadow-sm">
                    <span className="font-bold block text-sm mb-1 text-rose-800">Developer Note (Resend Sandbox Restriction):</span>
                    <p className="mt-1">
                      Your backend is integrated with a free development/sandbox tier of <strong>Resend</strong>. In sandbox mode, Resend prevents sending emails to external check-in domains (like Yahoo or Outlook) until you register a custom verified domain inside your Resend account.
                    </p>
                    <p className="mt-2 font-bold text-rose-800">
                      How to test successfully:
                    </p>
                    <ul className="list-disc list-inside mt-1 pl-1 space-y-1">
                      <li>Change the recipient email to your registered developer email address: <strong className="font-bold underline">josephsweetsinc@gmail.com</strong></li>
                      <li>Or log in to your Resend dashboard, add <strong className="font-semibold">{recipientEmail}</strong> as an authorized Single Recipient, or verify your custom domain.</li>
                    </ul>
                  </div>
                ) : null}

                {emailErrorDetails.toLowerCase().includes('api key') || 
                 emailErrorDetails.toLowerCase().includes('invalid') ||
                 emailErrorDetails.toLowerCase().includes('unauthorized') ||
                 emailErrorDetails.toLowerCase().includes('missing') ? (
                  <div className="mt-3 p-4 rounded-xl bg-white/80 border border-rose-100 text-xs text-rose-700 leading-relaxed font-sans shadow-sm">
                    <span className="font-bold block text-sm mb-1 text-rose-800">🔑 Resend API Key Configuration Guide:</span>
                    <p className="mt-1">
                      The application server is receiving an invalid, missing, or unauthorized Resend API key. To configure your keys and send emails successfully:
                    </p>
                    <ol className="list-decimal list-inside mt-2 pl-1 space-y-1.5 font-medium text-rose-800">
                      <li>Log into your <strong>Resend Dashboard</strong> (at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-rose-950">resend.com</a>) and copy your API Key (starts with <code className="bg-rose-100 px-1 rounded font-mono">re_</code>).</li>
                      <li>In Google AI Studio, open the <strong>Settings / Environment Variables</strong> panel.</li>
                      <li>Add or update the secret variable with the Name <strong className="font-mono">RESEND_API_KEY</strong> and paste your key as the Value.</li>
                      <li>Save, wait a few seconds, and click "Email Report" to try again!</li>
                    </ol>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-sm border border-slate-200 p-12 md:p-16 font-serif text-slate-800 min-h-[800px]">
          {/* Brand/Letter Header card - PRIMARY LOCKUP */}
          <div className="mb-10 p-6 rounded-2xl bg-[#F7F5F0] border border-slate-200/60 font-sans flex flex-col md:flex-row items-center md:items-start gap-6 select-none shadow-sm">
            {/* Logo Mark: Pin with Checkmark and "z z z" */}
            <div className="relative w-16 h-16 bg-[#5850C2] rounded-full flex items-center justify-center shrink-0 shadow-md">
              {/* Floating zzz */}
              <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5 leading-none font-bold text-white/50 text-[8px] italic">
                <span>z</span>
                <span className="text-[6px] translate-x-0.5">z</span>
                <span className="text-[5px] translate-x-1">z</span>
              </div>
              {/* Bold White Checkmark */}
              <svg className="w-8 h-8 text-white stroke-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Typography Lockup */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-1.5 justify-center md:justify-start">
                <h1 className="text-3xl font-extrabold text-[#2E2875] tracking-tight">Comply</h1>
                <span className="text-3xl font-semibold text-[#5850C2] tracking-tight">Zzz</span>
              </div>

              <div className="mt-1 text-[#5850C2] font-bold text-[10px] tracking-wider border-b border-[#AAA5E8]/60 pb-1.5 inline-block w-full sm:w-auto">
                SLEEP PROVEN. ROAD APPROVED.
              </div>

              <div className="mt-2 text-slate-500 text-[10px] font-bold tracking-widest uppercase flex flex-col sm:flex-row sm:items-center gap-x-2 justify-center md:justify-start">
                <span>DOT CPAP COMPLIANCE REPORTING</span>
                <span className="hidden sm:inline text-slate-300 font-normal">•</span>
                <span className="text-[#2E2875] font-extrabold">{profile.clinicName.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <p>Date: {formatDate(new Date())}</p>
          </div>

          <div className="mb-8 font-bold">
            <p>SUBJECT: DOT CPAP COMPLIANCE CERTIFICATION</p>
          </div>

          <div className="mb-8">
            <p>To: Medical Examiner / DOT Certification Department</p>
          </div>

          <div className="mb-8 leading-relaxed">
            <p>
              This letter serves to certify the CPAP compliance status for the individual identified below. 
              Our automated analysis of the provided usage data for the period of <strong>{report.metrics?.report_start_date ?? 'N/A'}</strong> to <strong>{report.metrics?.report_end_date ?? 'N/A'}</strong> has been completed.
            </p>
          </div>

          <div className="mb-8">
            <p className="font-bold mb-2 underline">DRIVER INFORMATION:</p>
            <div className="pl-4 space-y-1">
              <p>Name: {report.patientName}</p>
              {report.dob && <p>Date of Birth: {report.dob}</p>}
              {report.licenseNumber && <p>License: {report.licenseNumber} ({report.licenseState || 'N/A'})</p>}
              {report.metrics?.device_type && <p>Device: {report.metrics.device_type}</p>}
            </div>
          </div>

          <div className="mb-8">
            <p className="font-bold mb-2 underline">COMPLIANCE SUMMARY:</p>
            <div className="pl-4 space-y-1">
              <p>Total Days Monitored: {report.metrics?.total_days ?? 0}</p>
              <p>Days Used &gt; 4 Hours: {report.metrics?.days_used_4_plus_hours ?? 0}</p>
              <p>Usage Days Percentage: {report.metrics?.usage_days_percent ?? 0}% (Threshold: 70%)</p>
              <p>Average Usage: {report.metrics?.average_usage_hours ?? 0} hours/night (Threshold: 4.0 hrs)</p>
              <p>AHI (Apnea-Hypopnea Index): {report.metrics?.ahi ?? 'N/A'}</p>
            </div>
          </div>

          <div className="mb-12">
            <p className="font-bold mb-2 underline">DETERMINATION:</p>
            <div className="pl-4">
              <p className={`text-xl font-black mb-2 ${isCompliant ? 'text-emerald-600' : 'text-rose-600'}`}>
                {report.status.toUpperCase()}
              </p>
              <p className="text-sm italic">
                {isCompliant 
                  ? "The driver meets the FMCSA requirement of using the CPAP machine for at least 4 hours per night on 70% of the nights monitored."
                  : "The driver DOES NOT meet the FMCSA requirement of using the CPAP machine for at least 4 hours per night on 70% of the nights monitored."
                }
              </p>
            </div>
          </div>

          <div className="mt-14 flex flex-col sm:flex-row sm:items-end justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-slate-500">Record Compiled By:</p>
              <div className="mt-4 border-t border-slate-300 w-64 pt-2">
                <p className="font-bold text-sm">{profile.clinicName}</p>
                <p className="text-xs text-slate-500">Authorized Electronic Compliance Officer</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400">Tracker ID: {report.id.substring(0, 16).toUpperCase()}</p>
              <p className="text-[10px] text-slate-400">Generated: {formatDate(new Date())}</p>
            </div>
          </div>

          {/* Legal Compliance & Clinical Non-Intervention Disclaimer in Letter */}
          <LegalDisclaimer variant="letter" showAttestation={true} id="certified-letter-legal-disclaimer" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* HIPAA Privacy and Data Security Banner */}
      <div className="p-5 rounded-2xl border bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4 z-10">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200/80 dark:border-slate-700 shrink-0">
            <Shield className="w-6 h-6 stroke-[2.2] text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold tracking-tight">HIPAA & Data Privacy Guard</h4>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                Encrypted & Verified
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
              To protect sensitive healthcare and physical examination data, this compliance report is stored with <strong>AES-256 encryption</strong> in your secure clinic database. Access is strictly audited and restricted to authorized operators.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 z-10 self-end md:self-auto">
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Permanently Delete Report"
          >
            <Trash2 size={14} />
            <span>Delete Record</span>
          </button>
        </div>
      </div>

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link 
          to="/dashboard/history" 
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold transition-colors min-h-[40px]"
        >
          <ChevronLeft size={20} />
          <span>Back to History</span>
        </Link>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            onClick={handleDelete}
            className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            title="Delete Report"
            aria-label="Delete Report"
          >
            <Trash2 size={18} />
          </button>
          
          <div className="relative hidden md:block">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Mail size={16} />
            </div>
            <input
              type="email"
              placeholder="Recipient Email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 lg:w-64 transition-all min-h-[44px]"
            />
          </div>

          <button
            onClick={handleSendEmail}
            disabled={sendingEmail || downloadingPdf}
            className={`flex items-center justify-center gap-2 font-bold py-2.5 px-4 sm:px-6 rounded-xl transition-all shadow-md min-h-[44px] cursor-pointer text-xs sm:text-sm ${
              emailStatus === 'success' 
                ? 'bg-emerald-600 text-white shadow-emerald-200' 
                : emailStatus === 'error'
                ? 'bg-rose-600 text-white shadow-rose-200'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-slate-100 disabled:opacity-50'
            }`}
          >
            {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            <span>{sendingEmail ? 'Sending...' : emailStatus === 'success' ? 'Sent!' : emailStatus === 'error' ? 'Error' : 'Email Report'}</span>
          </button>
          <button
            onClick={() => setShowLetterPreview(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 sm:px-6 rounded-xl transition-all shadow-md shadow-blue-200 min-h-[44px] cursor-pointer text-xs sm:text-sm"
          >
            <FileText size={18} />
            <span>Generate Letter</span>
          </button>
        </div>
      </header>

      {emailStatus === 'error' && emailErrorDetails && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-sm text-rose-800 animate-in fade-in duration-300 shadow-sm font-sans">
          <div className="flex gap-3">
            <AlertCircle className="text-rose-600 shrink-0 w-5 h-5 mt-0.5" />
            <div className="space-y-2">
              <p className="font-bold text-rose-900">Email Dispatch Exception</p>
              <p className="opacity-95 text-rose-800 font-medium">{emailErrorDetails}</p>
               {emailErrorDetails.toLowerCase().includes('sandbox') ||
                emailErrorDetails.toLowerCase().includes('onboarding') ||
                emailErrorDetails.toLowerCase().includes('restrict') ||
                emailErrorDetails.toLowerCase().includes('validation') ||
                (recipientEmail.toLowerCase() !== 'josephsweetsinc@gmail.com' && !emailErrorDetails.toLowerCase().includes('api key') && !emailErrorDetails.toLowerCase().includes('invalid')) ? (
                 <div className="mt-3 p-4 rounded-xl bg-white/80 border border-rose-100 text-xs text-rose-700 leading-relaxed font-sans shadow-sm">
                   <span className="font-bold block text-sm mb-1 text-rose-800">Developer Note (Resend Sandbox Restriction):</span>
                   <p className="mt-1">
                     Your backend is integrated with a free development/sandbox tier of <strong>Resend</strong>. In sandbox mode, Resend prevents sending emails to external check-in domains (like Yahoo or Outlook) until you register a custom verified domain inside your Resend account.
                   </p>
                   <p className="mt-2 font-bold text-rose-800">
                     How to test successfully:
                   </p>
                   <ul className="list-disc list-inside mt-1 pl-1 space-y-1">
                     <li>Change the recipient email to your registered developer email address: <strong className="font-bold underline">josephsweetsinc@gmail.com</strong></li>
                     <li>Or log in to your Resend dashboard, add <strong className="font-semibold">{recipientEmail}</strong> as an authorized Single Recipient, or verify your custom domain.</li>
                   </ul>
                 </div>
               ) : null}

               {emailErrorDetails.toLowerCase().includes('api key') || 
                emailErrorDetails.toLowerCase().includes('invalid') ||
                emailErrorDetails.toLowerCase().includes('unauthorized') ||
                emailErrorDetails.toLowerCase().includes('missing') ? (
                 <div className="mt-3 p-4 rounded-xl bg-white/80 border border-rose-100 text-xs text-rose-700 leading-relaxed font-sans shadow-sm">
                   <span className="font-bold block text-sm mb-1 text-rose-800">🔑 Resend API Key Configuration Guide:</span>
                   <p className="mt-1">
                     The application server is receiving an invalid, missing, or unauthorized Resend API key. To configure your keys and send emails successfully:
                   </p>
                   <ol className="list-decimal list-inside mt-2 pl-1 space-y-1.5 font-medium text-rose-800">
                     <li>Log into your <strong>Resend Dashboard</strong> (at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-rose-950">resend.com</a>) and copy your API Key (starts with <code className="bg-rose-100 px-1 rounded font-mono">re_</code>).</li>
                     <li>In Google AI Studio, open the <strong>Settings / Environment Variables</strong> panel.</li>
                     <li>Add or update the secret variable with the Name <strong className="font-mono">RESEND_API_KEY</strong> and paste your key as the Value.</li>
                     <li>Save, wait a few seconds, and click "Email Report" to try again!</li>
                   </ol>
                 </div>
               ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Result Card */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className={`p-8 flex flex-col items-center text-center ${isCompliant ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <div className={`p-4 rounded-full mb-4 ${isCompliant ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                {isCompliant ? <CheckCircle size={48} /> : <XCircle size={48} />}
              </div>
              <h2 className={`text-4xl font-black uppercase tracking-tight ${isCompliant ? 'text-emerald-700' : 'text-rose-700'}`}>
                {report.status}
              </h2>
              <p className={`mt-2 font-semibold ${isCompliant ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isCompliant ? 'Meets DOT/FAA CPAP compliance standards' : 'Does not meet DOT/FAA CPAP compliance standards'}
              </p>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Driver / Pilot Details</h3>
                <div className="space-y-4">
                  <DetailItem icon={<User size={18} />} label="Full Name" value={report.patientName} />
                  {report.dob && <DetailItem icon={<Calendar size={18} />} label="Date of Birth" value={report.dob} />}
                  {report.licenseNumber && (
                    <DetailItem 
                      icon={<Activity size={18} />} 
                      label="Driver License" 
                      value={`${report.licenseNumber} (${report.licenseState || 'N/A'})`} 
                    />
                  )}
                  <DetailItem icon={<Calendar size={18} />} label="Reporting Period" value={`${report.metrics?.report_start_date ?? 'N/A'} - ${report.metrics?.report_end_date ?? 'N/A'}`} />
                  <DetailItem icon={<Clock size={18} />} label="Processed On" value={formatDate(report.createdAt)} />
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Compliance Metrics</h3>
                <div className="space-y-4">
                  {report.metrics?.device_type && <MetricItem label="Device Type" value={report.metrics.device_type} threshold="N/A" pass={true} />}
                  <MetricItem label="Usage %" value={`${report.metrics?.usage_days_percent ?? 0}%`} threshold="≥ 70%" pass={(report.metrics?.usage_days_percent ?? 0) >= 70} />
                  <MetricItem label="Avg Usage" value={`${report.metrics?.average_usage_hours ?? 0} hrs`} threshold="≥ 4.0 hrs" pass={(report.metrics?.average_usage_hours ?? 0) >= 4} />
                  <MetricItem label="Total Days" value={(report.metrics?.total_days ?? 0).toString()} threshold="≥ 30" pass={(report.metrics?.total_days ?? 0) >= 30} />
                  <MetricItem label="AHI" value={(report.metrics?.ahi ?? 'N/A').toString()} threshold="N/A" pass={true} />
                </div>
              </div>
            </div>

            {/* Primary Action */}
            <div className="p-8 pt-0">
              <button
                onClick={() => setShowLetterPreview(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 text-lg group"
              >
                <div className="p-2 bg-white/20 rounded-lg group-hover:scale-110 transition-transform">
                  <FileText size={24} />
                </div>
                <span>Generate Official Certified Letter</span>
              </button>
            </div>
          </section>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {/* Stakeholder Email Dispatch Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Mail size={18} className="text-blue-600" />
                <span>Stakeholder Dispatch</span>
              </h3>
              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
                Resend API
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Dispatch this certified DOT compliance report directly to the driver, medical examiner, or fleet manager via Resend.
            </p>

            <div className="space-y-4">
              {/* Driver Section */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={12} className="text-blue-500" />
                    Driver / Patient
                  </span>
                  {emailStatuses.driver.status === 'success' && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <Check size={10} /> Dispatched!
                    </span>
                  )}
                  {emailStatuses.driver.status === 'error' && (
                    <span className="text-[10px] text-rose-600 font-bold" title={emailStatuses.driver.error}>
                      Error
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="driver@example.com"
                    value={driverEmail}
                    onChange={(e) => {
                      setDriverEmail(e.target.value);
                      localStorage.setItem(`email_driver_${report.patientName}`, e.target.value);
                    }}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                  />
                  <button
                    onClick={() => sendStakeholderEmail('driver')}
                    disabled={emailStatuses.driver.status === 'sending'}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl text-xs transition-colors shrink-0"
                  >
                    {emailStatuses.driver.status === 'sending' ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                  </button>
                </div>
                {emailStatuses.driver.error && (
                  <p className="text-[10px] text-rose-500 leading-tight mt-1">{emailStatuses.driver.error}</p>
                )}
              </div>

              {/* Medical Examiner Section */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={12} className="text-emerald-500" />
                    DOT Medical Examiner
                  </span>
                  {emailStatuses.examiner.status === 'success' && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <Check size={10} /> Dispatched!
                    </span>
                  )}
                  {emailStatuses.examiner.status === 'error' && (
                    <span className="text-[10px] text-rose-600 font-bold" title={emailStatuses.examiner.error}>
                      Error
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="examiner@example.com"
                    value={examinerEmail}
                    onChange={(e) => {
                      setExaminerEmail(e.target.value);
                      localStorage.setItem(`email_examiner_${report.patientName}`, e.target.value);
                    }}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                  />
                  <button
                    onClick={() => sendStakeholderEmail('examiner')}
                    disabled={emailStatuses.examiner.status === 'sending'}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl text-xs transition-colors shrink-0"
                  >
                    {emailStatuses.examiner.status === 'sending' ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                  </button>
                </div>
                {emailStatuses.examiner.error && (
                  <p className="text-[10px] text-rose-500 leading-tight mt-1">{emailStatuses.examiner.error}</p>
                )}
              </div>

              {/* Employer Section */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={12} className="text-purple-500" />
                    Employer / Fleet Safety
                  </span>
                  {emailStatuses.employer.status === 'success' && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <Check size={10} /> Dispatched!
                    </span>
                  )}
                  {emailStatuses.employer.status === 'error' && (
                    <span className="text-[10px] text-rose-600 font-bold" title={emailStatuses.employer.error}>
                      Error
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="safety@company.com"
                    value={employerEmail}
                    onChange={(e) => {
                      setEmployerEmail(e.target.value);
                      localStorage.setItem(`email_employer_${report.patientName}`, e.target.value);
                    }}
                    className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                  />
                  <button
                    onClick={() => sendStakeholderEmail('employer')}
                    disabled={emailStatuses.employer.status === 'sending'}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-bold rounded-xl text-xs transition-colors shrink-0"
                  >
                    {emailStatuses.employer.status === 'sending' ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                  </button>
                </div>
                {emailStatuses.employer.error && (
                  <p className="text-[10px] text-rose-500 leading-tight mt-1">{emailStatuses.employer.error}</p>
                )}
              </div>

              {/* Custom Stakeholder Section */}
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield size={12} className="text-amber-500" />
                    Custom Stakeholder
                  </span>
                  {emailStatuses.custom.status === 'success' && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                      <Check size={10} /> Dispatched!
                    </span>
                  )}
                  {emailStatuses.custom.status === 'error' && (
                    <span className="text-[10px] text-rose-600 font-bold" title={emailStatuses.custom.error}>
                      Error
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    type="email"
                    placeholder="stakeholder@example.com"
                    value={customStakeholderEmail}
                    onChange={(e) => setCustomStakeholderEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300"
                  />
                  <button
                    onClick={() => sendStakeholderEmail('custom')}
                    disabled={emailStatuses.custom.status === 'sending'}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold rounded-xl text-xs transition-colors shrink-0"
                  >
                    {emailStatuses.custom.status === 'sending' ? <Loader2 size={14} className="animate-spin" /> : 'Send'}
                  </button>
                </div>
                {emailStatuses.custom.error && (
                  <p className="text-[10px] text-rose-500 leading-tight mt-1">{emailStatuses.custom.error}</p>
                )}
              </div>

              {/* Optional custom message */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
                  Custom Accompanying Message (Optional)
                </label>
                <textarea
                  placeholder="Add a personalized greeting or specific instructions to attach in the email body..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full h-20 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none placeholder:text-slate-300 text-slate-800"
                />
              </div>

              {/* Send All Active Button */}
              <button
                onClick={async () => {
                  const sendOps = [];
                  if (driverEmail) sendOps.push(sendStakeholderEmail('driver'));
                  if (examinerEmail) sendOps.push(sendStakeholderEmail('examiner'));
                  if (employerEmail) sendOps.push(sendStakeholderEmail('employer'));
                  if (customStakeholderEmail) sendOps.push(sendStakeholderEmail('custom'));
                  
                  await Promise.all(sendOps);
                }}
                disabled={!driverEmail && !examinerEmail && !employerEmail && !customStakeholderEmail}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-2xl text-sm transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
              >
                <Mail size={16} />
                <span>Dispatch to All Configured</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Operator Information</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Operator / Company Name</p>
                <p className="text-slate-700 font-medium">{profile.clinicName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Authorized User</p>
                <p className="text-slate-700 font-medium">{profile.displayName || profile.email}</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-200">
            <h3 className="font-bold mb-2">Need Help?</h3>
            <p className="text-sm text-blue-100 mb-4">If the metrics extracted seem incorrect, you can re-upload the original PDF for another analysis.</p>
            <Link to="/upload" className="block text-center bg-white text-blue-600 font-bold py-2 rounded-xl text-sm transition-transform hover:scale-105 active:scale-95">
              Re-upload Report
            </Link>
          </div>
        </div>
      </div>

      {/* Reusable Legal & Compliance Disclaimer placed at the bottom of the result view */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800">
        <LegalDisclaimer variant="report" showAttestation={true} id="result-page-legal-disclaimer" />
      </div>
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-slate-400 mt-0.5">{icon}</div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{label}</p>
        <p className="text-slate-800 font-semibold">{value}</p>
      </div>
    </div>
  );
}

function MetricItem({ label, value, threshold, pass }: { label: string; value: string; threshold: string; pass: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{label}</p>
        <p className={`text-lg font-black ${pass ? 'text-emerald-600' : 'text-rose-600'}`}>{value}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Threshold</p>
        <p className="text-xs font-bold text-slate-500">{threshold}</p>
      </div>
    </div>
  );
}
