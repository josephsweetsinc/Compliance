import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, ComplianceReport } from '../types';
import { generateCompliancePdf } from '../services/pdfService';
import { formatDate } from '../lib/utils';
import { CheckCircle, XCircle, Download, Trash2, ChevronLeft, Calendar, User, Clock, Activity, FileText, Mail, Loader2 } from 'lucide-react';

export default function ResultPage({ profile }: { profile: UserProfile }) {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLetterPreview, setShowLetterPreview] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const navigate = useNavigate();

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

  const handleDownload = () => {
    if (report) {
      generateCompliancePdf(report, profile.clinicName);
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
    
    try {
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: profile.email,
          patientName: report.patientName,
          status: report.status,
          reportId: report.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      setEmailStatus('success');
      setTimeout(() => setEmailStatus('idle'), 3000);
    } catch (err) {
      console.error('Email error:', err);
      setEmailStatus('error');
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
    return (
      <div className="p-12 text-center">
        <div className="mb-4 flex justify-center">
          <div className="p-4 bg-rose-50 rounded-full">
            <XCircle className="text-rose-600" size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Error</h2>
        <p className="text-slate-500 mb-6">{error || 'Something went wrong.'}</p>
        <Link to="/history" className="text-blue-600 hover:underline font-semibold">
          Back to History
        </Link>
      </div>
    );
  }

  const isCompliant = report.status === 'Compliant';

  if (showLetterPreview) {
    return (
      <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
        <header className="flex justify-between items-center">
          <button 
            onClick={() => setShowLetterPreview(false)} 
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium transition-colors"
          >
            <ChevronLeft size={20} />
            <span>Back to Analysis</span>
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSendEmail}
              disabled={sendingEmail}
              className={`flex items-center gap-2 font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg ${
                emailStatus === 'success' 
                  ? 'bg-emerald-600 text-white shadow-emerald-200' 
                  : emailStatus === 'error'
                  ? 'bg-rose-600 text-white shadow-rose-200'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-slate-100'
              }`}
            >
              {sendingEmail ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20} />}
              <span>{emailStatus === 'success' ? 'Email Sent!' : emailStatus === 'error' ? 'Error' : 'Email Report'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-200"
            >
              <Download size={20} />
              <span>Download PDF Letter</span>
            </button>
          </div>
        </header>

        <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-sm border border-slate-200 p-12 md:p-16 font-serif text-slate-800 min-h-[800px]">
          {/* Letter Header */}
          <div className="mb-12">
            <p className="font-sans font-bold text-slate-400 text-xs tracking-widest mb-1">{profile.clinicName.toUpperCase()}</p>
            <p className="font-sans text-slate-400 text-[10px] tracking-widest">OCCUPATIONAL HEALTH & DOT COMPLIANCE</p>
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
              This letter serves to certify the CPAP compliance status for the driver identified below. 
              Our clinical analysis of the provided usage data for the period of <strong>{report.metrics.start_date}</strong> to <strong>{report.metrics.end_date}</strong> has been completed.
            </p>
          </div>

          <div className="mb-8">
            <p className="font-bold mb-2 underline">DRIVER INFORMATION:</p>
            <div className="pl-4 space-y-1">
              <p>Name: {report.patientName}</p>
              {report.dob && <p>Date of Birth: {report.dob}</p>}
              {report.licenseNumber && <p>License: {report.licenseNumber} ({report.licenseState || 'N/A'})</p>}
            </div>
          </div>

          <div className="mb-8">
            <p className="font-bold mb-2 underline">COMPLIANCE SUMMARY:</p>
            <div className="pl-4 space-y-1">
              <p>Total Nights Monitored: {report.metrics.total_nights}</p>
              <p>Nights Used &gt; 4 Hours: {report.metrics.nights_over_4_hours}</p>
              <p>Compliance Percentage: {report.metrics.compliance_percentage}% (Threshold: 70%)</p>
              <p>Average Usage: {report.metrics.average_usage_hours} hours/night (Threshold: 4.0 hrs)</p>
              <p>AHI (Apnea-Hypopnea Index): {report.metrics.ahi}</p>
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

          <div className="mt-20">
            <p>Certified by:</p>
            <div className="mt-8 border-t border-slate-300 w-64 pt-2">
              <p className="font-bold text-sm">{profile.clinicName}</p>
              <p className="text-xs text-slate-500">Authorized Clinical Representative</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-center">
        <Link to="/history" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium transition-colors">
          <ChevronLeft size={20} />
          <span>Back to History</span>
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            title="Delete Report"
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={handleSendEmail}
            disabled={sendingEmail}
            className={`flex items-center gap-2 font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg ${
              emailStatus === 'success' 
                ? 'bg-emerald-600 text-white shadow-emerald-200' 
                : emailStatus === 'error'
                ? 'bg-rose-600 text-white shadow-rose-200'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-slate-100'
            }`}
          >
            {sendingEmail ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20} />}
            <span>{emailStatus === 'success' ? 'Email Sent!' : emailStatus === 'error' ? 'Error' : 'Email Report'}</span>
          </button>
          <button
            onClick={() => setShowLetterPreview(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-200"
          >
            <FileText size={20} />
            <span>Generate DOT Letter</span>
          </button>
        </div>
      </header>

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
                {isCompliant ? 'Patient meets DOT compliance standards' : 'Patient does not meet DOT compliance standards'}
              </p>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Patient Details</h3>
                <div className="space-y-4">
                  <DetailItem icon={<User size={18} />} label="Patient Name" value={report.patientName} />
                  {report.dob && <DetailItem icon={<Calendar size={18} />} label="Date of Birth" value={report.dob} />}
                  {report.licenseNumber && (
                    <DetailItem 
                      icon={<Activity size={18} />} 
                      label="Driver License" 
                      value={`${report.licenseNumber} (${report.licenseState || 'N/A'})`} 
                    />
                  )}
                  <DetailItem icon={<Calendar size={18} />} label="Reporting Period" value={`${report.metrics.start_date} - ${report.metrics.end_date}`} />
                  <DetailItem icon={<Clock size={18} />} label="Processed On" value={formatDate(report.createdAt)} />
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Compliance Metrics</h3>
                <div className="space-y-4">
                  <MetricItem label="Compliance %" value={`${report.metrics.compliance_percentage}%`} threshold="≥ 70%" pass={report.metrics.compliance_percentage >= 70} />
                  <MetricItem label="Avg Usage" value={`${report.metrics.average_usage_hours} hrs`} threshold="≥ 4.0 hrs" pass={report.metrics.average_usage_hours >= 4} />
                  <MetricItem label="Total Nights" value={report.metrics.total_nights.toString()} threshold="≥ 30" pass={report.metrics.total_nights >= 30} />
                  <MetricItem label="AHI" value={report.metrics.ahi.toString()} threshold="N/A" pass={true} />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity size={18} className="text-blue-600" />
              Medical Examiner Disclaimer
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed italic">
              This report summarizes CPAP usage data extracted from clinical reports using artificial intelligence. This summary is intended for review by a licensed medical examiner as part of a DOT physical examination. The final determination of fitness for duty rests solely with the medical examiner.
            </p>
          </section>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Clinic Information</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Clinic Name</p>
                <p className="text-slate-700 font-medium">{profile.clinicName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Staff Member</p>
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
