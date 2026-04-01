import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { UserProfile, ComplianceMetrics, ComplianceReport } from '../types';
import { extractTextFromPdf } from '../services/pdfService';
import { extractComplianceMetrics } from '../services/geminiService';
import { FileUp, Loader2, AlertCircle, CheckCircle2, FileText, X } from 'lucide-react';

export default function UploadPage({ profile }: { profile: UserProfile }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'idle' | 'extracting' | 'analyzing' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [patientDetails, setPatientDetails] = useState({
    dob: '',
    licenseNumber: '',
    licenseState: ''
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPatientDetails(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please select a valid PDF file.');
    }
  };

  const calculateCompliance = (metrics: ComplianceMetrics): 'Compliant' | 'Non-Compliant' => {
    // Deterministic compliance logic:
    // compliant if: average_usage_hours >= 4 AND compliance_percentage >= 70 AND total_nights >= 30
    const isCompliant = 
      metrics.average_usage_hours >= 4 && 
      metrics.compliance_percentage >= 70 && 
      metrics.total_nights >= 30;
    
    return isCompliant ? 'Compliant' : 'Non-Compliant';
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Extract text from PDF
      setStep('extracting');
      const text = await extractTextFromPdf(file);
      
      if (!text.trim()) {
        throw new Error('Could not extract text from PDF. Please ensure it is not an image-only scan.');
      }

      // 2. AI Extraction
      setStep('analyzing');
      const metrics = await extractComplianceMetrics(text);

      // 3. Compliance Logic
      const status = calculateCompliance(metrics);

      // 4. Save to Firestore
      setStep('saving');
      const reportsRef = collection(db, 'reports');
      const newDocRef = doc(reportsRef);
      
      const reportData: ComplianceReport = {
        id: newDocRef.id,
        clinicId: profile.uid,
        patientName: metrics.patient_name,
        dob: patientDetails.dob,
        licenseNumber: patientDetails.licenseNumber,
        licenseState: patientDetails.licenseState,
        metrics,
        status,
        createdAt: new Date().toISOString(),
      };

      try {
        await setDoc(newDocRef, reportData);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `reports/${newDocRef.id}`);
      }
      
      // 5. Send Email Notification
      try {
        await fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: profile.email,
            patientName: metrics.patient_name,
            status: status,
            reportId: newDocRef.id,
          }),
        });
      } catch (emailErr) {
        console.error('Failed to send email notification:', emailErr);
      }

      // 6. Redirect to results
      navigate(`/report/${newDocRef.id}`);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'An error occurred during processing.');
      setLoading(false);
      setStep('idle');
    }
  };

  const reset = () => {
    setFile(null);
    setError(null);
    setStep('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Upload Report</h1>
        <p className="text-slate-500">Upload a CPAP usage report PDF to generate a compliance determination.</p>
      </header>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group"
          >
            <div className="p-4 bg-blue-50 group-hover:bg-blue-100 rounded-full mb-4 transition-colors">
              <FileUp className="text-blue-600" size={32} />
            </div>
            <p className="text-lg font-bold text-slate-800 mb-1">Click or drag PDF here</p>
            <p className="text-slate-500 text-sm">Standard CPAP usage report (PDF)</p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date of Birth</label>
                <input
                  type="date"
                  name="dob"
                  value={patientDetails.dob}
                  onChange={handleDetailChange}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">License Number</label>
                <input
                  type="text"
                  name="licenseNumber"
                  placeholder="DL-123456"
                  value={patientDetails.licenseNumber}
                  onChange={handleDetailChange}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">License State</label>
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

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <FileText size={24} />
                </div>
                <div>
                  <p className="font-bold text-slate-800 truncate max-w-[200px]">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              {!loading && (
                <button onClick={reset} className="p-2 text-slate-400 hover:text-rose-600 transition-colors">
                  <X size={20} />
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 text-blue-600 font-semibold">
                  <Loader2 className="animate-spin" size={20} />
                  <span>{getStepMessage(step)}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-500" 
                    style={{ width: getProgress(step) + '%' }}
                  ></div>
                </div>
                <p className="text-sm text-slate-500 italic">This may take a few moments as our AI analyzes the clinical data...</p>
              </div>
            ) : (
              <button
                onClick={handleUpload}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={20} />
                <span>Process Report</span>
              </button>
            )}
          </div>
        )}

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
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside opacity-80">
          <li>Average usage hours ≥ 4.0</li>
          <li>Compliance percentage ≥ 70%</li>
          <li>Total nights in period ≥ 30</li>
        </ul>
      </section>
    </div>
  );
}

function getStepMessage(step: string) {
  switch (step) {
    case 'extracting': return 'Extracting text from PDF...';
    case 'analyzing': return 'AI Analysis of usage metrics...';
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
