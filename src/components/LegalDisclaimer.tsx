import React from 'react';
import { ShieldAlert, Scale, FileCheck2, Info } from 'lucide-react';

export interface LegalDisclaimerProps {
  variant?: 'report' | 'letter' | 'compact';
  showAttestation?: boolean;
  className?: string;
  id?: string;
}

export function LegalDisclaimer({
  variant = 'report',
  showAttestation = false,
  className = '',
  id = 'complyzzz-legal-disclaimer',
}: LegalDisclaimerProps) {
  // Primary compliance text explicitly requested by user
  const primaryStatement =
    'ComplyZzz provides automated data extraction, auditing, and report formatting. It does not provide medical treatment or replace the clinical judgment of a certified NRCME Medical Examiner or FAA AME.';

  if (variant === 'compact') {
    return (
      <aside
        id={id}
        aria-label="Compliance & Legal Disclaimer"
        className={`p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs leading-relaxed ${className}`}
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              Administrative Compliance & Clinical Disclaimer
            </p>
            <p>{primaryStatement}</p>
          </div>
        </div>
      </aside>
    );
  }

  if (variant === 'letter') {
    return (
      <aside
        id={id}
        aria-label="Regulatory Compliance & Medical Disclaimer"
        className={`border-t border-b border-slate-300 py-4 my-6 text-[11px] font-sans leading-relaxed text-slate-600 ${className}`}
      >
        <div className="flex items-center gap-2 mb-2 font-bold uppercase tracking-wider text-slate-800 text-[10px]">
          <Scale className="w-3.5 h-3.5 text-slate-600" />
          <span>Regulatory Compliance & Clinical Non-Intervention Statement</span>
        </div>
        
        <p className="font-semibold text-slate-800 mb-1.5">
          {primaryStatement}
        </p>

        <p className="text-slate-600 mb-2">
          This document represents an algorithmic compliance analysis compiled from telemetry data supplied by the patient's positive airway pressure (PAP) device. It is intended solely as an administrative reference tool to assist qualified practitioners in assessing commercial driver (FMCSA/DOT) or aviation personnel (FAA) compliance. All calculated percentages, daily usage durations, and apnea-hypopnea index (AHI) metrics must be verified against original device telemetry and clinical history by the credentialed examiner prior to signing official medical certificates (FMCSA MCSA-5875/5876 or FAA Form 8500-8).
        </p>

        <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-2">
          <span>• Administrative Decision Support Only</span>
          <span>• Non-Diagnostic Software (FDA 21 U.S.C. § 360hi)</span>
          <span>• Final Certification Authority Remains with Credentialed Examiner</span>
        </div>

        {showAttestation && (
          <div className="mt-4 pt-3 border-t border-dashed border-slate-300 space-y-3">
            <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
              Examiner Review Attestation & Verification:
            </p>
            <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded border border-slate-200">
              <input
                type="checkbox"
                id="examiner-attestation-chk"
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                defaultChecked
                readOnly
              />
              <label htmlFor="examiner-attestation-chk" className="text-[10px] text-slate-700 leading-tight">
                I attest that I have reviewed the underlying compliance telemetry data, verified its authenticity against the patient record, and exercised my independent professional judgment in interpreting these results.
              </label>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-[10px] text-slate-700">
              <div>
                <span className="block text-slate-400 font-bold uppercase text-[9px]">Examiner Name & Title</span>
                <div className="border-b border-slate-400 mt-4 pb-0.5">___________________________</div>
              </div>
              <div>
                <span className="block text-slate-400 font-bold uppercase text-[9px]">NRCME / FAA AME #</span>
                <div className="border-b border-slate-400 mt-4 pb-0.5">___________________________</div>
              </div>
              <div>
                <span className="block text-slate-400 font-bold uppercase text-[9px]">Examiner Signature & Date</span>
                <div className="border-b border-slate-400 mt-4 pb-0.5">___________________________</div>
              </div>
            </div>
          </div>
        )}
      </aside>
    );
  }

  // Default 'report' variant (modern card for interactive report view)
  return (
    <section
      id={id}
      aria-label="Clinical Decision Support and Legal Disclaimer"
      className={`p-6 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 transition-all ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/60 rounded-xl text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 dark:border-amber-800/40 pb-2">
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Clinical Decision Support & Regulatory Disclaimer</span>
            </h4>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/60 dark:bg-amber-900/80 text-amber-900 dark:text-amber-300">
              <Scale className="w-3 h-3" />
              Administrative Audit Only
            </span>
          </div>

          <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-normal">
            {primaryStatement}
          </p>

          <p>
            ComplyZzz functions strictly as an administrative data extraction, auditing, and report formatting platform. It does not provide medical consultations, diagnoses, prescription advice, or direct patient treatment. This audit report is an assistive calculation based on user-submitted telemetry documents.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-amber-200/40 dark:border-amber-900/40">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-[11px] mb-1">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Examiner Verification Mandate</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                All extracted metrics (total days, days used $\ge$ 4 hours, percentage of compliance, and AHI) must be independently reviewed, cross-referenced, and corroborated by the credentialed Medical Examiner prior to signing official examination records (FMCSA MCSA-5875/5876 or FAA Form 8500-8).
              </p>
            </div>

            <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-xl border border-amber-200/40 dark:border-amber-900/40">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-[11px] mb-1">
                <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Limitation of Clinical Liability</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                The examining clinician retains exclusive statutory and professional responsibility for all certification outcomes. ComplyZzz disclaims all liability for certification actions, regulatory penalties, or medical sequelae arising from clinical reliance on automated extractions.
              </p>
            </div>
          </div>

          {showAttestation && (
            <div className="mt-4 pt-3 border-t border-amber-200/60 dark:border-amber-800/40">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="dashboard-examiner-check"
                  defaultChecked
                  readOnly
                  className="mt-1 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-not-allowed"
                />
                <label htmlFor="dashboard-examiner-check" className="text-[11px] text-slate-700 dark:text-slate-300">
                  <strong>Examiner Confirmation:</strong> I confirm that this audit report has been evaluated in conjunction with the patient's full medical history and clinical presentation.
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default LegalDisclaimer;
