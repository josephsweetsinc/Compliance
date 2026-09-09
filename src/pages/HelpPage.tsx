import React from 'react';
import { HelpCircle, ChevronDown, ChevronUp, BookOpen, ShieldCheck, AlertTriangle, FileText, Mail, Info } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: React.ReactNode;
  category: 'usage' | 'criteria' | 'troubleshooting';
}

const faqs: FAQItem[] = [
  {
    category: 'usage',
    question: 'How do I upload a CPAP report?',
    answer: 'Navigate to the "Upload Report" page. You can drag and drop your PDF report directly into the upload zone or click to browse your files. Once uploaded, you can optionally add driver details like Date of Birth and License Number before processing.'
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
    answer: 'If the AI analysis cannot confidently extract clear usage metrics (due to poor PDF quality or non-standard report formats), it may flag a report as indeterminate. In these cases, we recommend manual review of the original PDF.'
  },
  {
    category: 'troubleshooting',
    question: 'Why did my upload fail?',
    answer: 'Ensure the file is a valid PDF and not password protected. The system specifically targets reports exported from CPAP compliance software (like ResScan, EncoreAnywhere, or AirView). Scanned copies of paper reports may have lower extraction accuracy.'
  },
  {
    category: 'troubleshooting',
    question: 'I didn\'t receive the email notification.',
    answer: 'Check your spam folder first. Ensure the recipient email was entered correctly on the upload page. Notifications are sent from "onboarding@resend.dev" during the trial period.'
  }
];

export default function HelpPage() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <header>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Help & Documentation</h1>
        <p className="text-slate-500">Guidelines, compliance criteria, and common questions.</p>
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
          <p className="text-sm text-slate-500 leading-relaxed">Understand the 70/4 rule and other FMCSA criteria used in our automated assessment.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 mb-4">
            <AlertTriangle size={20} />
          </div>
          <h3 className="font-bold text-slate-800 mb-2">Troubleshooting</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Fix issues with PDF parsing, OCR resolution, or email delivery failures.</p>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <HelpCircle className="text-blue-600" />
            Frequently Asked Questions
          </h2>
        </div>
        <div className="divide-y divide-slate-50">
          {faqs.map((faq, index) => (
            <div key={index} className="group">
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full text-left p-4 sm:p-6 flex items-start sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer min-h-[48px]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 flex-1">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 sm:py-1 rounded-md self-start ${
                    faq.category === 'usage' ? 'bg-blue-100 text-blue-700' :
                    faq.category === 'criteria' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {faq.category}
                  </span>
                  <span className="font-bold text-slate-800 text-sm sm:text-base group-hover:text-blue-600 transition-colors">
                    {faq.question}
                  </span>
                </div>
                <div className="shrink-0 pt-0.5 sm:pt-0">
                  {openIndex === index ? (
                    <ChevronUp className="text-slate-400" size={20} />
                  ) : (
                    <ChevronDown className="text-slate-400" size={20} />
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
