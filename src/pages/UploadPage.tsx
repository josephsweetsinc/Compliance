import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { UserProfile, ComplianceMetrics, ComplianceReport } from '../types';
import { extractTextFromPdf } from '../services/pdfService';
import { extractComplianceMetrics } from '../services/geminiService';
import { sendSummaryNotificationToUser } from '../services/emailService';
import { FileUp, Loader2, AlertCircle, CheckCircle2, FileText, X, User, Mail, Activity, Phone } from 'lucide-react';

export default function UploadPage({ profile }: { profile: UserProfile }) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState<number | null>(null);
  const [step, setStep] = useState<'idle' | 'extracting' | 'analyzing' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
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
    smsEnabled: false,
    phoneNumber: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0 && selectedFiles.length > 0) {
      setError('Please select valid PDF files.');
      return;
    }

    if (files.length + pdfFiles.length > 10) {
      setError('Maximum 10 files allowed at once.');
      return;
    }

    setFiles(prev => {
      const newFiles = [...prev, ...pdfFiles];
      setFileResults(newFiles.map(() => ({ status: 'pending' })));
      return newFiles;
    });
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      setFileResults(newFiles.map(() => ({ status: 'pending' })));
      return newFiles;
    });
  };

  const calculateCompliance = (metrics: ComplianceMetrics): 'Compliant' | 'Non-Compliant' => {
    // Deterministic compliance logic:
    // compliant if: average_usage_hours >= 4 AND usage_days_percent >= 70 AND total_days >= 30
    const isCompliant = 
      (metrics.average_usage_hours || 0) >= 4 && 
      (metrics.usage_days_percent || 0) >= 70 && 
      (metrics.total_days || 0) >= 30;
    
    return isCompliant ? 'Compliant' : 'Non-Compliant';
  };

  const handleUpload = async (retryOnly: boolean = false) => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    setStep('idle');
    setCurrentExtraction(null);
    
    // Determine which files to process
    const filesToProcess = retryOnly 
      ? files.filter((_, i) => fileResults[i]?.status === 'error')
      : files;
    
    // Map of global index to filesToProcess index isn't needed if we use the original indices
    const indicesToProcess = retryOnly
      ? files.map((_, i) => i).filter(i => fileResults[i]?.status === 'error')
      : files.map((_, i) => i);

    setProcessedCount(0);
    // If not retryOnly, reset all results. If retryOnly, reset only those being retried.
    setFileResults(prev => {
      const updated = [...prev];
      indicesToProcess.forEach(idx => {
        updated[idx] = { status: 'pending' };
      });
      return updated;
    });

    const reportIds: string[] = [];

    let localHasErrors = false;

    for (const i of indicesToProcess) {
      setCurrentFileIndex(i);
      const file = files[i];

      try {
        // 1. Extract text from PDF
        setStep('extracting');
        const extraction = await extractTextFromPdf(file);
        
        if (!extraction.text) {
          throw new Error('Extraction failed: No text content found in PDF. The document might be a scanned image or protected.');
        }

        if (extraction.isLowQuality) {
          throw new Error(`Low quality text detected. Average words per page: ${Math.round(extraction.wordCount / extraction.pageCount)}. This usually indicates a scanned document or a non-standard report format. Ensure the PDF is digitally generated and not a scanned image. Suggestion: Export the report directly as a digital PDF from your CPAP manufacturer's software (e.g., ResMed AirView or Philips Care Orchestrator).`);
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

        // 2. AI Extraction
        setStep('analyzing');
        const metrics = await extractComplianceMetrics(extraction.text);

        // 3. Compliance Logic
        const status = calculateCompliance(metrics);

        // 4. Save to Firestore
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
        
        // Retrieve bearer token for API route authorization
        const authToken = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => 'user-session-token') : 'user-session-token';

        // 5. Notifications
        // Automatically email a summary notification to the user (operator) after a report is successfully processed if auto email is enabled
        if (profile.email && profile.autoEmailEnabled !== false) {
          sendSummaryNotificationToUser(reportData, profile.email)
            .catch(err => console.error('Automated operator email summary error:', err));
        }

        if (notificationSettings.enabled && notificationSettings.email) {
          fetch('/api/send-notification', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
              email: notificationSettings.email,
              patientName: metrics.patient_name,
              status: status,
              reportId: newDocRef.id,
            }),
          }).catch(err => console.error('Email error:', err));
        }

        if (notificationSettings.smsEnabled && notificationSettings.phoneNumber) {
          fetch('/api/send-sms', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
              phone: notificationSettings.phoneNumber,
              patientName: metrics.patient_name,
              clinicName: profile.clinicName,
              status: status,
              reportId: newDocRef.id,
            }),
          }).catch(err => console.error('SMS error:', err));
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
        console.error(`Error processing ${file.name}:`, err);
        localHasErrors = true;
        setFileResults(prev => {
          const updated = [...prev];
          updated[i] = { 
            ...updated[i], 
            status: 'error', 
            error: err.message || 'Processing failed' 
          };
          return updated;
        });
      }
      setProcessedCount(prev => prev + 1);
    }

    setLoading(false);
    setStep('idle');
    setCurrentFileIndex(null);

    // Final navigation logic
    if (reportIds.length > 0) {
      // Check if any files (including those not retried) still have errors
      // Use setFileResults current state is hard, so we calculate from files + local results
      // Actually, we can check if there are any errors in the *entire* batch now.
      // But let's simplify: if the current run encountered any errors, stay on page.
      if (reportIds.length === 1 && files.length === 1 && !localHasErrors) {
        navigate(`/dashboard/report/${reportIds[0]}`);
      } else if (!localHasErrors) {
        navigate('/dashboard/history');
      }
      // If there are errors, stay on the page so they can retry.
    } else if (localHasErrors) {
      setError('Processing failed for the selected reports. Please review the errors below and try again.');
    }
  };

  const reset = () => {
    setFiles([]);
    setError(null);
    setStep('idle');
    setCurrentFileIndex(null);
    setCurrentExtraction(null);
    setPatientDetails({
      dob: '',
      licenseNumber: '',
      licenseState: ''
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header className="space-y-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Upload Report</h1>
          <p className="text-slate-500">Upload a CPAP usage report PDF to generate a compliance determination.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl font-medium w-fit shadow-sm animate-in fade-in duration-300 select-none">
          <span className="flex items-center gap-1">🛡️ Your data is secure and not shared</span>
          <span className="hidden sm:inline text-emerald-300/80">•</span>
          <span className="flex items-center gap-1">Files are automatically deleted after processing</span>
        </div>
      </header>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-8">
        {/* Patient Information Section */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <User size={16} className="text-slate-400" />
            Driver Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">Date of Birth (Optional)</label>
              <input
                type="date"
                name="dob"
                value={patientDetails.dob}
                onChange={handleDetailChange}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">License Number (Optional)</label>
              <input
                type="text"
                name="licenseNumber"
                placeholder="Ex: DL-1234567"
                value={patientDetails.licenseNumber}
                onChange={handleDetailChange}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500">License State (Optional)</label>
              <select
                name="licenseState"
                value={patientDetails.licenseState}
                onChange={handleDetailChange}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              >
                <option value="">Select State</option>
                {['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'].map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Notification Settings Section */}
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Mail size={16} className="text-slate-400" />
                Email Notifications
              </h2>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  name="enabled"
                  checked={notificationSettings.enabled} 
                  onChange={handleNotificationChange}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium text-slate-600">Auto-Email</span>
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
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-sans"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Phone size={16} className="text-slate-400" />
                SMS Notifications
              </h2>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  name="smsEnabled"
                  checked={notificationSettings.smsEnabled} 
                  onChange={handleNotificationChange}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ml-3 text-sm font-medium text-slate-600">Recipient SMS</span>
              </label>
            </div>
            
            <div className={`transition-all duration-300 ${notificationSettings.smsEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500">Recipient Phone Number</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                    <Phone size={14} />
                  </div>
                  <input
                    type="tel"
                    name="phoneNumber"
                    placeholder="+1 (555) 000-0000"
                    value={notificationSettings.phoneNumber}
                    onChange={handleNotificationChange}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-sans"
                  />
                </div>
                <p className="text-[10px] text-slate-400 italic">Includes a secure link to the automated usage review.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Report Upload Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <FileText size={16} className="text-slate-400" />
              CPAP Usage Reports
            </h2>
            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              {files.length} / 10 Files Selected
            </span>
          </div>
          
          {files.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group"
            >
              <div className="p-4 bg-blue-50 group-hover:bg-blue-100 rounded-full mb-4 transition-colors">
                <FileUp className="text-blue-600" size={32} />
              </div>
              <p className="text-lg font-bold text-slate-800 mb-1">Click or drag PDFs here</p>
              <p className="text-slate-500 text-sm mb-3">You can select up to 10 reports for bulk processing</p>
              <p className="text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-1.5 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg font-medium shadow-2xs select-none">
                <span className="text-slate-600">🔒 Your data is secure and not shared</span>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="text-slate-600">Files are automatically deleted after processing</span>
              </p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf"
                multiple
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {files.map((f, i) => (
                  <div key={i} className={`flex flex-col p-3 rounded-xl border transition-all ${
                    currentFileIndex === i ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-slate-50 border-slate-100'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${
                          fileResults[i]?.status === 'error' ? 'bg-rose-100 text-rose-600' :
                          currentFileIndex === i ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'
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
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] text-slate-500">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                            {fileResults[i]?.manufacturer && (
                              <>
                                <span className="text-[10px] text-slate-300">•</span>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-wider">
                                  {fileResults[i].manufacturer}
                                </span>
                                <span className="text-slate-400 text-[10px] truncate max-w-[150px] font-medium">({fileResults[i].format})</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {!loading && (
                          <button onClick={() => removeFile(i)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors">
                            <X size={16} />
                          </button>
                        )}
                        {fileResults[i]?.status === 'success' && (
                          <CheckCircle2 size={18} className="text-emerald-500" />
                        )}
                        {fileResults[i]?.status === 'error' && (
                          <AlertCircle size={18} className="text-rose-500" />
                        )}
                      </div>
                    </div>
                    {fileResults[i]?.status === 'error' && fileResults[i]?.error && (
                      <p className="mt-2 text-[10px] text-rose-600 font-medium bg-rose-50/50 p-1.5 rounded-lg border border-rose-100/50">
                        Error: {fileResults[i].error}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="space-y-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-blue-600 font-semibold text-sm">
                      <Loader2 className="animate-spin" size={16} />
                      <span>{getStepMessage(step, currentExtraction)}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-500">
                      Processing {processedCount + 1} of {files.length}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-500" 
                      style={{ width: ((processedCount / files.length) * 100) + '%' }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-slate-400 italic text-center">Batch processing handles multiple files concurrently saving you time.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <FileUp size={20} />
                      <span>Add More</span>
                    </button>
                    <button
                      onClick={() => handleUpload(false)}
                      className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={20} />
                      <span>Process {files.length} Reports</span>
                    </button>
                  </div>
                  
                  {fileResults.some(r => r.status === 'error') && (
                    <button
                      onClick={() => handleUpload(true)}
                      className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-3 rounded-xl transition-all border border-rose-100 flex items-center justify-center gap-2"
                    >
                      <Activity size={20} />
                      <span>Retry Failed Files</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-xl flex items-start gap-3">
            <AlertCircle size={20} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      <section className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
        <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
          <AlertCircle size={18} />
          Compliance Criteria
        </h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside opacity-80 mb-4">
          <li>Average usage hours ≥ 4.0</li>
          <li>Usage days percentage ≥ 70%</li>
          <li>Total days in period ≥ 30</li>
        </ul>
        <p className="text-[10px] text-blue-700/60 italic leading-tight">
          Disclaimer: This automated analysis is designed to facilitate quick compliance verification. Please verify automated results against the original raw CPAP report prior to your DOT or FAA physical exam.
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
    case 'extracting': return 'Extracting text from PDF...';
    case 'analyzing': 
      return currentExtraction 
        ? `Analyzing ${currentExtraction.manufacturer} Report (${currentExtraction.format})...` 
        : 'AI Analysis of usage metrics...';
    case 'saving': return 'Finalizing report...';
    default: return 'Processing...';
  }
}

function getProgress(step: string) {
  switch (step) {
    case 'extracting': return 33;
    case 'analyzing': return 66;
    case 'saving': return 90;
    default: return 0;
  }
}
