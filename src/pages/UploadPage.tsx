import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDropzone, FileRejection } from 'react-dropzone';
import { db, auth } from '../lib/firebase';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { UserProfile, ComplianceMetrics, ComplianceReport } from '../types';
import { extractTextFromPdf } from '../services/pdfService';
import { extractComplianceMetrics } from '../services/geminiService';
import { parseCpapMetrics } from '../services/cpapParser';
import { sendSummaryNotificationToUser } from '../services/emailService';
import { 
  FileUp, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  X, 
  User, 
  Mail, 
  Sparkles, 
  Plus, 
  Layers, 
  RefreshCw, 
  CreditCard, 
  Coins, 
  Building2, 
  ArrowRight 
} from 'lucide-react';

export default function UploadPage({ 
  profile, 
  setProfile 
}: { 
  profile: UserProfile; 
  setProfile?: (p: UserProfile) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState<number | null>(null);
  const [step, setStep] = useState<'idle' | 'extracting' | 'analyzing' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [fileResults, setFileResults] = useState<{ 
    status: 'pending' | 'success' | 'error'; 
    error?: string;
    manufacturer?: string;
    format?: string;
  }[]>([]);
  const [currentExtraction, setCurrentExtraction] = useState<{
    manufacturer: string;
    format: string;
  } | null>(null);
  const [patientDetails, setPatientDetails] = useState({
    dob: '',
    licenseNumber: '',
    licenseState: ''
  });
  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    email: profile.email || '',
  });
  const navigate = useNavigate();

  const [restoringTrial, setRestoringTrial] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);

  const isUnlimited = profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active';
  const availableCredits = profile.reportCredits ?? 0;

  const handleRestoreTrial = async () => {
    try {
      setRestoringTrial(true);
      setRestoreNotice(null);
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        const res = await fetch('/api/reports/restore-trial', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          if (setProfile) {
            setProfile({ ...profile, reportCredits: 1 });
          }
          setRestoreNotice("Complimentary trial credit restored! You can now test your CPAP compliance report.");
          setShowCreditModal(false);
          return;
        } else if (data?.error) {
          setRestoreNotice(data.error);
        }
      }
    } catch (err: any) {
      console.warn('Could not restore trial:', err);
    } finally {
      setRestoringTrial(false);
    }
  };

  const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPatientDetails(prev => ({ ...prev, [name]: value }));
  };

  const handleNotificationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setNotificationSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const addPdfFiles = useCallback((selectedFiles: File[]) => {
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0 && selectedFiles.length > 0) {
      setError('Please select or drop valid PDF files (.pdf format).');
      return;
    }

    if (files.length + pdfFiles.length > 10) {
      setError(`Maximum 10 files allowed per batch. You already have ${files.length} file(s) selected.`);
      return;
    }

    setFiles(prev => {
      const newFiles = [...prev, ...pdfFiles];
      setFileResults(prevResults => {
        return newFiles.map((_, idx) => {
          if (idx < prevResults.length) return prevResults[idx];
          return { status: 'pending' as const };
        });
      });
      return newFiles;
    });
    setError(null);
  }, [files.length]);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    if (fileRejections.length > 0) {
      const invalidFiles = fileRejections.map(r => r.file.name).join(', ');
      setError(`Some files could not be added (${invalidFiles}). Please ensure files are valid .pdf documents.`);
    }
    if (acceptedFiles.length > 0) {
      addPdfFiles(acceptedFiles);
    }
  }, [addPdfFiles]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
    open: openFileSelector
  } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: true,
    noClick: files.length > 0,
    disabled: loading
  } as any);

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      setFileResults(prevResults => prevResults.filter((_, i) => i !== index));
      return newFiles;
    });
  };

  const reset = () => {
    setFiles([]);
    setFileResults([]);
    setCurrentFileIndex(null);
    setError(null);
    setStep('idle');
    setCurrentExtraction(null);
  };

  const calculateCompliance = (metrics: ComplianceMetrics): 'Compliant' | 'Non-Compliant' => {
    const isCompliant = 
      (metrics.average_usage_hours || 0) >= 4 && 
      (metrics.usage_days_percent || 0) >= 70 && 
      (metrics.total_days || 0) >= 30;
    
    return isCompliant ? 'Compliant' : 'Non-Compliant';
  };

  const handleUpload = async (retryOnly: boolean = false) => {
    if (files.length === 0) return;

    const indicesToProcess = retryOnly
      ? files.map((_, i) => i).filter(i => fileResults[i]?.status === 'error')
      : files.map((_, i) => i);

    if (indicesToProcess.length === 0) return;

    // Verify credits are available before starting, but DO NOT deduct yet.
    // Credits will ONLY be deducted for files that successfully process and save.
    if (!isUnlimited) {
      if (availableCredits < indicesToProcess.length) {
        setShowCreditModal(true);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setStep('idle');
    setCurrentExtraction(null);

    setProcessedCount(0);
    setFileResults(prev => {
      const updated = [...prev];
      indicesToProcess.forEach(idx => {
        updated[idx] = { status: 'pending' };
      });
      return updated;
    });

    const reportIds: string[] = [];

    for (const i of indicesToProcess) {
      setCurrentFileIndex(i);
      const file = files[i];

      try {
        setStep('extracting');
        const extraction = await extractTextFromPdf(file);
        
        if (!extraction.text) {
          throw new Error('Extraction failed: No text content found in PDF. The document might be an unreadable image or protected.');
        }

        if (extraction.isLowQuality) {
          throw new Error(`Low quality text detected. Average words per page: ${Math.round(extraction.wordCount / extraction.pageCount)}. Ensure the PDF is digitally generated.`);
        }

        const manufacturer = extraction.detectedManufacturer || 'Generic CPAP';
        const format = extraction.detectedFormat || 'Standard Format';
        
        setCurrentExtraction({ manufacturer, format });

        setFileResults(prev => {
          const updated = [...prev];
          updated[i] = { 
            ...updated[i], 
            manufacturer,
            format
          };
          return updated;
        });

        setStep('analyzing');
        let metrics: ComplianceMetrics | null = null;
        try {
          metrics = await extractComplianceMetrics(extraction.text);
        } catch (extractErr: any) {
          console.warn(`Primary AI extraction notice for ${file.name}, using deterministic engine:`, extractErr.message);
          metrics = parseCpapMetrics(extraction.text);
          if (!metrics) {
            throw extractErr;
          }
        }

        const status = calculateCompliance(metrics);

        setStep('saving');
        const reportsRef = collection(db, 'reports');
        const newDocRef = doc(reportsRef);
        
        const now = new Date();

        const reportData: ComplianceReport = {
          id: newDocRef.id,
          clinicId: profile.uid,
          patientName: metrics.patient_name,
          dob: patientDetails.dob,
          licenseNumber: patientDetails.licenseNumber,
          licenseState: patientDetails.licenseState,
          metrics,
          status,
          createdAt: now.toISOString(),
        };

        await setDoc(newDocRef, reportData);
        reportIds.push(newDocRef.id);
        
        if (profile.email && profile.autoEmailEnabled !== false) {
          sendSummaryNotificationToUser(reportData, profile.email)
            .catch(err => console.warn('Automated operator email summary warning:', err?.message || err));
        }

        if (notificationSettings.enabled && notificationSettings.email && auth.currentUser) {
          const authToken = await auth.currentUser.getIdToken();
          fetch('/api/send-notification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
              type: 'summary',
              recipientEmail: notificationSettings.email,
              patientName: metrics.patient_name,
              clinicName: profile.clinicName,
              status: status,
              reportId: newDocRef.id,
              metrics: metrics
            }),
          }).catch(err => console.warn('Email notification warning:', err?.message || err));
        }

        setFileResults(prev => {
          const updated = [...prev];
          updated[i] = { 
            ...updated[i], 
            status: 'success' 
          };
          return updated;
        });

      } catch (err: any) {
        console.warn(`Notice while processing file ${file.name}:`, err.message || err);
        const rawErrMsg = err.message || 'Unable to parse CPAP compliance document';
        const cleanMsg = (rawErrMsg.toLowerCase().includes('gemini') || rawErrMsg.toLowerCase().includes('api key') || rawErrMsg.toLowerCase().includes('prepayment') || rawErrMsg.toLowerCase().includes('billing') || rawErrMsg.toLowerCase().includes('402'))
          ? 'Unable to extract compliance metrics from this document. Please ensure the CPAP report contains clear text data.'
          : rawErrMsg;

        setFileResults(prev => {
          const updated = [...prev];
          updated[i] = { 
            ...updated[i], 
            status: 'error', 
            error: cleanMsg
          };
          return updated;
        });
      } finally {
        setProcessedCount(prev => prev + 1);
      }
    }

    // FAIR BILLING: Deduct report credits ONLY for documents that were successfully
    // generated and saved. If any document failed, the customer is NEVER charged!
    const successfulReportsThisBatch = reportIds.length;
    if (!isUnlimited && successfulReportsThisBatch > 0) {
      let newCreditBalance = Math.max(0, availableCredits - successfulReportsThisBatch);
      let consumedOnServer = false;

      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          const res = await fetch('/api/reports/consume-credits', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ count: successfulReportsThisBatch }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.success) {
            if (typeof data.reportCredits === 'number') {
              newCreditBalance = data.reportCredits;
              consumedOnServer = true;
            }
          }
        }
      } catch (creditErr) {
        console.warn('Server credit consumption endpoint unavailable, using client Firestore decrement:', creditErr);
      }

      if (!consumedOnServer && profile.uid) {
        try {
          const userDocRef = doc(db, 'users', profile.uid);
          await updateDoc(userDocRef, { reportCredits: newCreditBalance });
        } catch (clientErr: any) {
          console.warn('Could not update reportCredits directly in Firestore:', clientErr);
        }
      }

      if (setProfile) {
        setProfile({ ...profile, reportCredits: newCreditBalance });
      }
    }

    setLoading(false);
    setCurrentFileIndex(null);

    const successCount = fileResults.filter(r => r.status === 'success').length + reportIds.length;
    
    if (reportIds.length === 1 && files.length === 1) {
      navigate(`/dashboard/report/${reportIds[0]}`);
    } else if (successCount > 0) {
      navigate('/dashboard/history');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header & Balance Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Process CPAP Compliance Reports</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Select or drag multiple CPAP machine PDF reports to evaluate DOT & FAA compliance in a single batch queue.
          </p>
        </div>

        {/* Plan / Credit Balance Quick Action */}
        <div className="flex items-center gap-3">
          {isUnlimited ? (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-3.5 py-2 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-bold">
              <Building2 size={16} />
              <span>Unlimited Clinic Plan</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 rounded-xl shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-bold text-xs">
                <Coins size={16} className="text-blue-600 dark:text-blue-400" />
                <span>{availableCredits} {availableCredits === 1 ? 'Credit' : 'Credits'}</span>
              </div>
              {availableCredits === 0 && (
                <button
                  type="button"
                  onClick={handleRestoreTrial}
                  disabled={restoringTrial}
                  className="ml-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Restore complimentary trial credit if it was used during a failed test run"
                >
                  <RefreshCw size={12} className={restoringTrial ? "animate-spin" : ""} />
                  <span>Restore Trial</span>
                </button>
              )}
              <Link
                to="/dashboard/billing"
                className="ml-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                + Add Credits ($9/ea)
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Restore Notice Banner */}
      {restoreNotice && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-xs font-semibold animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{restoreNotice}</span>
          </div>
          <button onClick={() => setRestoreNotice(null)} className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 cursor-pointer p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Credit Required Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] max-w-lg w-full rounded-3xl p-6 sm:p-8 border border-slate-100 dark:border-slate-800 shadow-2xl space-y-6 relative">
            <button
              onClick={() => setShowCreditModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-2">
                <CreditCard size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Report Credits Required</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You have {files.length} report{files.length > 1 ? 's' : ''} queued, but your balance is {availableCredits} credit{availableCredits === 1 ? '' : 's'}. Choose a payment option to continue processing:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: Pay-per-report */}
              <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 flex flex-col justify-between transition-all bg-slate-50/50 dark:bg-slate-900/40">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">Pay-As-You-Go</span>
                  <h4 className="font-bold text-slate-900 dark:text-white text-base mt-1">$9 / Report</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Purchase single report credits or credit packs.
                  </p>
                </div>
                <Link
                  to="/dashboard/billing"
                  className="mt-4 w-full py-2.5 px-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-bold text-center transition-colors block"
                >
                  Buy Report Credits ($9)
                </Link>
              </div>

              {/* Option B: Unlimited monthly */}
              <div className="p-5 rounded-2xl border-2 border-blue-600 dark:border-blue-500 flex flex-col justify-between transition-all bg-blue-50/30 dark:bg-blue-950/20">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">Best Value</span>
                  <h4 className="font-bold text-slate-900 dark:text-white text-base mt-1">$250 / Month</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    Unlimited reports, batch queue, and clinic branding.
                  </p>
                </div>
                <Link
                  to="/dashboard/billing"
                  className="mt-4 w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold text-center transition-colors block shadow-md shadow-blue-500/20"
                >
                  Get Unlimited Plan
                </Link>
              </div>
            </div>

            {/* Trial recovery option */}
            {availableCredits === 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Testing the application or experienced an unexpected extraction failure?
                </p>
                <button
                  type="button"
                  onClick={handleRestoreTrial}
                  disabled={restoringTrial}
                  className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 px-3.5 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={14} className={restoringTrial ? "animate-spin" : ""} />
                  <span>{restoringTrial ? "Restoring..." : "Restore 1 Trial Report Credit (Free)"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 sm:p-8 border border-slate-100 dark:border-slate-800/60 shadow-sm space-y-8">
        {/* Patient Details & Settings */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <User size={16} className="text-slate-400" />
              Patient & Notification Details
            </h2>
            <span className="text-[10px] text-slate-400 italic">Optional patient identifiers</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">Date of Birth</label>
              <input
                type="date"
                name="dob"
                value={patientDetails.dob}
                onChange={handleDetailChange}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">Driver License #</label>
              <input
                type="text"
                placeholder="e.g. D1234567"
                name="licenseNumber"
                value={patientDetails.licenseNumber}
                onChange={handleDetailChange}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500">License State</label>
              <input
                type="text"
                placeholder="e.g. CA, TX, NY"
                name="licenseState"
                value={patientDetails.licenseState}
                onChange={handleDetailChange}
                maxLength={2}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase font-sans"
              />
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-2">
                <Mail size={15} className="text-slate-400" />
                Email Alerts on Complete
              </label>
              <label className="relative inline-flex items-center cursor-pointer min-h-[36px] min-w-[48px]">
                <input 
                  type="checkbox" 
                  name="enabled"
                  checked={notificationSettings.enabled} 
                  onChange={handleNotificationChange}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            <div className={`transition-all duration-300 ${notificationSettings.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500">Recipient Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    name="email"
                    placeholder="Enter email for processed alert..."
                    value={notificationSettings.email}
                    onChange={handleNotificationChange}
                    className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Multi-File Dropzone & Batch Queue Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Layers size={16} className="text-slate-400" />
              CPAP Usage Reports Queue
            </h2>
            <div className="flex items-center gap-2">
              {files.length > 0 && !loading && (
                <button
                  onClick={reset}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer"
                >
                  Clear Queue
                </button>
              )}
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                {files.length} / 10 Files Queued
              </span>
            </div>
          </div>

          {files.length === 0 ? (
            /* Multi-File Primary Drop Zone using react-dropzone */
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-3xl p-6 sm:p-14 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 group relative overflow-hidden select-none active:scale-[0.99] ${
                isDragReject
                  ? 'border-rose-500 bg-rose-50 ring-4 ring-rose-100'
                  : isDragAccept || isDragActive
                  ? 'border-blue-500 bg-blue-50/90 ring-4 ring-blue-100 scale-[1.01] shadow-lg'
                  : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/40'
              }`}
            >
              <input {...getInputProps()} />

              <div className={`p-3.5 sm:p-4 rounded-2xl mb-3 sm:mb-4 transition-all duration-300 ${
                isDragReject
                  ? 'bg-rose-600 text-white'
                  : isDragActive 
                  ? 'bg-blue-600 text-white scale-110 shadow-lg animate-bounce' 
                  : 'bg-blue-50 text-blue-600 group-hover:bg-blue-100 group-hover:scale-105'
              }`}>
                <FileUp size={32} className="sm:w-9 sm:h-9" />
              </div>

              <p className={`text-base sm:text-lg font-bold mb-1 text-center transition-colors ${
                isDragReject ? 'text-rose-700' : isDragActive ? 'text-blue-700' : 'text-slate-800'
              }`}>
                {isDragReject
                  ? 'Invalid file type (PDF required)'
                  : isDragActive
                  ? 'Drop CPAP PDF reports to queue'
                  : 'Tap to Select or Drop CPAP Reports'}
              </p>

              <p className="text-slate-500 text-xs sm:text-sm mb-4 text-center max-w-md px-2">
                {isDragActive
                  ? 'Release to load documents into your analysis queue'
                  : 'Upload single or multiple CPAP machine PDF reports for instant automated compliance checking'}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 px-2 text-center">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-100/80 border border-blue-200 px-3 py-1.5 rounded-lg">
                  <Sparkles size={13} className="text-blue-600 shrink-0" />
                  <span>ResMed AirView, Philips Care Orchestrator & DeVilbiss</span>
                </span>
              </div>

              <p className="mt-4 sm:mt-5 text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-1.5 bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-xl font-medium select-none">
                <span className="text-slate-600">🔒 Secure browser extraction</span>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="text-slate-600">Up to 10 files per batch</span>
              </p>
            </div>
          ) : (
            /* Queue Container with Drop Target for Adding More Files */
            <div
              {...getRootProps()}
              className={`space-y-5 transition-all rounded-3xl p-4 border ${
                isDragActive ? 'border-2 border-dashed border-blue-500 bg-blue-50/80 ring-4 ring-blue-100 shadow-md' : 'border-slate-100 bg-slate-50/30'
              }`}
            >
              <input {...getInputProps()} />

              {isDragActive && (
                <div className="p-4 bg-blue-600 text-white rounded-2xl text-center font-bold text-sm flex items-center justify-center gap-2 animate-bounce shadow-md">
                  <Plus size={22} />
                  <span>Drop additional CPAP PDFs to append to queue</span>
                </div>
              )}

              {/* Ready Status Banner */}
              {!loading && !isDragActive && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl animate-in fade-in duration-300">
                  <div className="flex items-center gap-2.5 text-emerald-900 font-semibold text-xs">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                    </span>
                    <span>{files.length} CPAP {files.length === 1 ? 'file' : 'files'} in queue</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/90 px-3 py-1 rounded-lg border border-emerald-200">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    Ready for Batch Compliance Extraction
                  </span>
                </div>
              )}

              {/* Queue File List */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                {files.map((f, i) => (
                  <div key={i} className={`flex flex-col p-3.5 rounded-2xl border transition-all ${
                    currentFileIndex === i ? 'bg-blue-50/90 border-blue-300 shadow-sm ring-2 ring-blue-100' : 'bg-white border-slate-200/80'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2.5 rounded-xl ${
                          fileResults[i]?.status === 'error' ? 'bg-rose-100 text-rose-600' :
                          currentFileIndex === i ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {currentFileIndex === i && loading ? (
                            <Loader2 className="animate-spin" size={18} />
                          ) : fileResults[i]?.status === 'error' ? (
                            <X size={18} />
                          ) : (
                            <FileText size={18} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate text-sm">{f.name}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] text-slate-500 font-mono">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">Queue #{i + 1}</span>
                            {fileResults[i]?.manufacturer && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                                {fileResults[i].manufacturer} ({fileResults[i].format})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!loading && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(i);
                            }}
                            className="p-2.5 -m-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                            title="Remove file from queue"
                            aria-label="Remove file from queue"
                          >
                            <X size={18} />
                          </button>
                        )}
                        {fileResults[i]?.status === 'success' && (
                          <CheckCircle2 size={20} className="text-emerald-500" />
                        )}
                        {fileResults[i]?.status === 'error' && (
                          <AlertCircle size={20} className="text-rose-500" />
                        )}
                      </div>
                    </div>
                    {fileResults[i]?.status === 'error' && fileResults[i]?.error && (
                      <p className="mt-2 text-[11px] text-rose-600 font-medium bg-rose-50 p-2 rounded-xl border border-rose-100">
                        Error: {fileResults[i].error}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Progress and Actions */}
              {loading ? (
                <div className="space-y-4 py-3 bg-white p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 text-blue-600 font-bold text-sm">
                      <Loader2 className="animate-spin" size={18} />
                      <span>{getStepMessage(step, currentExtraction)}</span>
                    </div>
                    <span className="text-xs font-extrabold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                      Processing {processedCount + 1} of {files.length}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-500 rounded-full" 
                      style={{ width: `${((processedCount / files.length) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 italic text-center">Multi-file batch extraction handles each CPAP report sequentially.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 pt-2">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={openFileSelector}
                      disabled={files.length >= 10}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3.5 px-4 rounded-2xl min-h-[48px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
                    >
                      <Plus size={18} />
                      <span>Add More Files</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpload(false)}
                      className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-2xl min-h-[48px] transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer text-sm"
                    >
                      <CheckCircle2 size={18} />
                      <span>Process {files.length} {files.length === 1 ? 'Report' : 'Reports'} Now</span>
                    </button>
                  </div>
                  
                  {fileResults.some(r => r.status === 'error') && (
                    <button
                      type="button"
                      onClick={() => handleUpload(true)}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-3 rounded-xl transition-all border border-rose-200 flex items-center justify-center gap-2 cursor-pointer text-xs"
                    >
                      <RefreshCw size={15} />
                      <span>Retry Failed Files</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-2xl flex items-start gap-3">
            <AlertCircle size={18} className="shrink-0 text-rose-600 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
      </div>

      <section className="bg-blue-50/80 rounded-2xl p-6 border border-blue-100">
        <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2 text-sm">
          <AlertCircle size={16} />
          CPAP Compliance Extraction Standards
        </h3>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside opacity-90 mb-3">
          <li>Average usage hours ≥ 4.0 hours per night</li>
          <li>Usage days percentage ≥ 70% of days evaluated</li>
          <li>Evaluation timeframe span ≥ 30 consecutive days</li>
        </ul>
        <p className="text-[10px] text-blue-700/70 italic leading-normal">
          Disclaimer: Automated AI multi-file extraction is designed to streamline DOT & FAA compliance reviews. Always double-check metrics against original manufacturer printouts prior to signing medical certifications.
        </p>
      </section>
    </div>
  );
}

function getStepMessage(
  step: string, 
  currentExtraction: { manufacturer: string; format: string } | null
) {
  switch (step) {
    case 'extracting': return 'Extracting PDF text layer...';
    case 'analyzing': 
      return currentExtraction 
        ? `Analyzing ${currentExtraction.manufacturer} Report (${currentExtraction.format})...` 
        : 'Extracting usage metrics with AI...';
    case 'saving': return 'Saving compliance evaluation...';
    default: return 'Processing...';
  }
}
