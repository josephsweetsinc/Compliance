import React, { useState, useEffect } from 'react';
import { 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  BookOpen, 
  ShieldCheck, 
  AlertTriangle, 
  FileText, 
  Mail, 
  Info, 
  Activity, 
  Server, 
  RefreshCw, 
  Copy, 
  Check, 
  CheckCircle2, 
  Bug, 
  Trash2 
} from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ErrorLog } from '../types';
import { logErrorToFirestore } from '../services/errorLoggingService';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
  category: 'usage' | 'criteria' | 'troubleshooting';
}

const faqs: FAQItem[] = [
  {
    category: 'usage',
    question: 'How do I upload a CPAP report?',
    answer: 'Navigate to the "Upload Report" page. You can drag and drop your PDF report, upload image screenshots (.png, .jpg, .jpeg, .webp) from apps like myAir or DreamMapper, or take a live photo of your CPAP machine screen with your smartphone camera. Once uploaded, you can optionally add driver details like Date of Birth and License Number before processing.'
  },
  {
    category: 'usage',
    question: 'What file formats are accepted?',
    answer: 'ComplyZzz accepts digital PDF documents (.pdf) as well as all standard image formats (.png, .jpg, .jpeg, .webp). On mobile devices, you can also use your smartphone camera to capture a photo of your CPAP screen or physical printout directly.'
  },
  {
    category: 'usage',
    question: 'Where can I find the analyzed reports?',
    answer: 'All processed reports are stored in your "Report History". You can access this from the sidebar navigation. Each entry allows you to view the detailed analysis, download the medical examiner letter, or re-send the notification email.'
  },
  {
    category: 'criteria',
    question: 'What are the compliance criteria used for analysis?',
    answer: (
      <div className="space-y-2">
        <p>The system evaluates reports based on standard FMCSA and FAA guidelines for CPAP compliance:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Usage Rule:</strong> Minimum of 4 hours of use per night on 70% of days.</li>
          <li><strong>Period:</strong> Evaluation typically covers a 30-day or 90-day consecutive period.</li>
          <li><strong>Efficacy:</strong> Consideration of Apnea-Hypopnea Index (AHI) measurements (typically looking for values under 20).</li>
        </ul>
      </div>
    )
  },
  {
    category: 'criteria',
    question: 'What does "Indeterminate" status mean?',
    answer: 'If the AI analysis cannot confidently extract clear usage metrics (due to poor image resolution or non-standard report formats), it may flag a report as indeterminate. In these cases, we recommend taking a clearer photo or providing the digital PDF export.'
  },
  {
    category: 'troubleshooting',
    question: 'Why did my upload fail?',
    answer: 'Ensure the file is a valid PDF (.pdf) or clear image (.png, .jpg, .jpeg, .webp). If uploading a photo, ensure there is adequate lighting and that the numbers (usage hours, days, or AHI) are clearly readable without heavy glare.'
  },
  {
    category: 'troubleshooting',
    question: 'I didn\'t receive the email notification.',
    answer: 'Check your spam folder first. Ensure the recipient email was entered correctly on the upload page. Notifications are sent from "onboarding@resend.dev" during the trial period.'
  }
];

export default function HelpPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [simulatedRenderCrash, setSimulatedRenderCrash] = useState(false);

  // Subscribe to recent diagnostic error logs for this authenticated user
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLogsLoading(false);
      return;
    }

    try {
      const logsQuery = query(
        collection(db, 'error_logs'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(15)
      );

      const unsubscribe = onSnapshot(
        logsQuery,
        (snapshot) => {
          const fetchedLogs: ErrorLog[] = [];
          snapshot.forEach((doc) => {
            fetchedLogs.push(doc.data() as ErrorLog);
          });
          setErrorLogs(fetchedLogs);
          setLogsLoading(false);
        },
        (err) => {
          console.warn('[HelpPage] Notice querying error_logs:', err);
          setLogsLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (e) {
      console.warn('[HelpPage] error_logs listener setup notice:', e);
      setLogsLoading(false);
    }
  }, []);

  const handleCopyId = (id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedLogId(id);
      setTimeout(() => setCopiedLogId(null), 2000);
    }
  };

  const handleSimulateApiFailure = async () => {
    setTestStatus('Sending simulated API failure to /api/extract-metrics...');
    try {
      const res = await fetch('/api/extract-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'INVALID_EMPTY_TEST_DATA' }),
      });
      const data = await res.json().catch(() => ({}));
      
      const logId = await logErrorToFirestore({
        errorType: 'API_FAILURE',
        message: data.error || 'Diagnostic test API error',
        apiEndpoint: '/api/extract-metrics',
        status: res.status,
        context: {
          testMode: true,
          triggeredBy: 'help_page_diagnostics',
        },
      });

      setTestStatus(`Simulated API failure logged to Firestore successfully (Ref: ${logId})`);
      setTimeout(() => setTestStatus(null), 5000);
    } catch (err: any) {
      setTestStatus(`Test completed: ${err.message}`);
      setTimeout(() => setTestStatus(null), 5000);
    }
  };

  if (simulatedRenderCrash) {
    throw new Error('This is a simulated React rendering crash triggered from Help & Diagnostics to test the Global Error Boundary.');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <header>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Help & Documentation</h1>
        <p className="text-slate-500">Guidelines, compliance criteria, diagnostics, and common questions.</p>
      </header>

      {/* Quick Start Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
            <BookOpen size={20} />
          </div>
          <h3 className="font-bold text-slate-800 mb-2">Usage Guide</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Learn the workflow from uploading a raw PDF to generating a signed compliance letter.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 mb-4">
            <ShieldCheck size={20} />
          </div>
          <h3 className="font-bold text-slate-800 mb-2">DOT Standards</h3>
          <p className="text-sm text-slate-500 leading-relaxed">FMCSA 49 CFR §391.41 compliance criteria: 4+ hours per night on 70% of days.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4">
            <Activity size={20} />
          </div>
          <h3 className="font-bold text-slate-800 mb-2">Diagnostic Logs</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Automatic logging of API failures and rendering boundary catches in Firestore.</p>
        </div>
      </div>

      {/* System Diagnostics & Error Logs Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Diagnostics & Error Logs</h2>
              <p className="text-xs text-slate-500">Live records from the dedicated Firestore <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">error_logs</code> collection.</p>
            </div>
          </div>

          {/* Test Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSimulateApiFailure}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-xl border border-amber-200 transition-colors cursor-pointer"
            >
              <Server size={14} />
              <span>Simulate API Error</span>
            </button>
            <button
              type="button"
              onClick={() => setSimulatedRenderCrash(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold rounded-xl border border-rose-200 transition-colors cursor-pointer"
            >
              <Bug size={14} />
              <span>Test Error Boundary</span>
            </button>
          </div>
        </div>

        {testStatus && (
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
            <span>{testStatus}</span>
          </div>
        )}

        {/* Logs Table / List */}
        {logsLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading diagnostic logs from Firestore...</div>
        ) : errorLogs.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
            <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No Error Logs Recorded</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Your session has experienced 0 unhandled failures. When an API or render failure occurs, it will be automatically captured here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {errorLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const dateStr = new Date(log.createdAt).toLocaleString();
              
              let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
              if (log.errorType === 'API_FAILURE') badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
              if (log.errorType === 'RENDER_ERROR') badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
              if (log.errorType === 'NETWORK_ERROR') badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';

              return (
                <div key={log.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white text-xs">
                  <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeColor}`}>
                        {log.errorType}
                      </span>
                      {log.status && (
                        <span className="px-2 py-0.5 rounded bg-slate-200 font-mono font-semibold text-slate-700">
                          HTTP {log.status}
                        </span>
                      )}
                      <span className="font-semibold text-slate-900 truncate">
                        {log.apiEndpoint || log.errorName || 'Error'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-slate-400 font-mono">{dateStr}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyId(log.id)}
                        title="Copy Log ID"
                        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 font-mono cursor-pointer py-1 px-1.5 rounded hover:bg-slate-200"
                      >
                        <span>{log.id.substring(0, 12)}...</span>
                        {copiedLogId === log.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="text-slate-500 hover:text-slate-800 cursor-pointer p-1"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Preview message */}
                  <div className="px-4 py-2.5 text-slate-600 border-t border-slate-100 font-mono text-[11px] bg-white">
                    {log.message}
                  </div>

                  {/* Expanded Diagnostics */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-950 text-slate-300 font-mono text-[11px] border-t border-slate-200 space-y-2 overflow-x-auto">
                      <div><span className="text-slate-500">Log ID:</span> {log.id}</div>
                      <div><span className="text-slate-500">Timestamp:</span> {log.createdAt}</div>
                      {log.apiEndpoint && <div><span className="text-slate-500">Endpoint:</span> {log.apiEndpoint}</div>}
                      {log.status && <div><span className="text-slate-500">Status:</span> {log.status}</div>}
                      {log.url && <div><span className="text-slate-500">Route URL:</span> {log.url}</div>}
                      {log.userAgent && <div><span className="text-slate-500">User Agent:</span> {log.userAgent}</div>}
                      {log.context && (
                        <div>
                          <span className="text-slate-500">Context:</span>
                          <pre className="mt-1 text-slate-400 whitespace-pre-wrap">{JSON.stringify(log.context, null, 2)}</pre>
                        </div>
                      )}
                      {log.stack && (
                        <div>
                          <span className="text-slate-500">Stack Trace:</span>
                          <pre className="mt-1 text-rose-400 whitespace-pre-wrap leading-tight">{log.stack}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Frequently Asked Questions */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-slate-800">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all duration-200"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full p-4 sm:p-6 text-left flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                    <HelpCircle size={18} />
                  </div>
                  <span className="font-bold text-slate-800 text-sm sm:text-base leading-snug">{faq.question}</span>
                </div>
                <div className="text-slate-400 shrink-0">
                  {openIndex === index ? (
                    <ChevronUp size={20} className="text-blue-600" />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </div>
              </button>
              {openIndex === index && (
                <div
                  className="overflow-hidden bg-slate-50/50 transition-all duration-300"
                >
                  <div className="p-4 sm:p-6 pt-0 sm:ml-16 text-slate-600 leading-relaxed text-xs sm:text-sm">
                    {faq.answer}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Support Footer */}
      <div className="bg-slate-900 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
        <div className="relative z-10">
          <h2 className="text-xl font-bold mb-2">Still have questions?</h2>
          <p className="text-slate-400 text-sm">Our team of compliance experts is available to help with any questions.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 relative z-10 w-full md:w-auto">
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl transition-all min-h-[44px] cursor-pointer text-sm">
            <Mail size={18} />
            <span>Contact Support</span>
          </button>
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3.5 px-6 rounded-xl transition-all min-h-[44px] cursor-pointer text-sm">
            <Info size={18} />
            <span>Knowledge Base</span>
          </button>
        </div>
        {/* Abstract background element */}
        <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl"></div>
      </div>
    </div>
  );
}
