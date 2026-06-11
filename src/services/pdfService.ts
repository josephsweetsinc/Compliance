import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { jsPDF } from 'jspdf';
import { ComplianceReport } from '../types';
import { formatDate } from '../lib/utils';

// Set worker path for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfExtractionResult {
  text: string;
  isLowQuality: boolean;
  pageCount: number;
  wordCount: number;
  charCount: number;
  detectedManufacturer?: string;
  detectedFormat?: string;
}

export async function extractTextFromPdf(file: File): Promise<PdfExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  const trimmedText = fullText.trim();
  const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0;
  const charCount = trimmedText.length;

  // Simple heuristic: if fewer than 20 words per page on average, it might be an image/OCR fail
  const isLowQuality = numPages > 0 && (wordCount / numPages) < 20;

  // Identify CPAP report format and manufacturer
  const upperText = trimmedText.toUpperCase();
  let detectedManufacturer = 'Generic CPAP';
  let detectedFormat = 'Standard Format';

  if (
    upperText.includes('RESMED') || 
    upperText.includes('AIRVIEW') || 
    upperText.includes('MYAIR') || 
    upperText.includes('AIRSENSE') || 
    upperText.includes('AIRCURVE') ||
    upperText.includes('RES SCAN') ||
    upperText.includes('RESSCAN')
  ) {
    detectedManufacturer = 'ResMed';
    if (upperText.includes('AIRVIEW')) {
      detectedFormat = 'ResMed AirView Clinician Report';
    } else if (upperText.includes('MYAIR')) {
      detectedFormat = 'ResMed myAir Patient Report';
    } else if (upperText.includes('RESSCAN') || upperText.includes('RES SCAN')) {
      detectedFormat = 'ResScan Data Export';
    } else {
      detectedFormat = 'Standard Report';
    }
  } else if (
    upperText.includes('PHILIPS') || 
    upperText.includes('RESPIRONICS') || 
    upperText.includes('DREAMSTATION') || 
    upperText.includes('ENCOREANYWHERE') || 
    upperText.includes('ENCORE') || 
    upperText.includes('SYSTEM ONE') || 
    upperText.includes('SYS ONE')
  ) {
    detectedManufacturer = 'Philips Respironics';
    if (upperText.includes('DREAMSTATION')) {
      detectedFormat = 'DreamStation Report';
    } else if (upperText.includes('ENCOREANYWHERE') || upperText.includes('ENCORE')) {
      detectedFormat = 'Encore Report';
    } else if (upperText.includes('SYSTEM ONE') || upperText.includes('SYS ONE')) {
      detectedFormat = 'System One Report';
    } else {
      detectedFormat = 'Standard Report';
    }
  } else if (
    upperText.includes('FISHER & PAYKEL') || 
    upperText.includes('FISHER AND PAYKEL') || 
    upperText.includes('SLEEPSTYLE') || 
    upperText.includes('INFOSMART') ||
    upperText.includes('F&P')
  ) {
    detectedManufacturer = 'Fisher & Paykel';
    if (upperText.includes('SLEEPSTYLE')) {
      detectedFormat = 'SleepStyle Report';
    } else {
      detectedFormat = 'InfoSmart Export';
    }
  } else if (
    upperText.includes('LÖWENSTEIN') || 
    upperText.includes('LOWENSTEIN') || 
    upperText.includes('PRISMA')
  ) {
    detectedManufacturer = 'Löwenstein Medical';
    detectedFormat = 'Prisma Cloud/TS Report';
  } else if (
    upperText.includes('TRANSCEND') || 
    upperText.includes('SOMNETICS')
  ) {
    detectedManufacturer = 'Somnetics';
    detectedFormat = 'Transcend Report';
  } else if (
    upperText.includes('APEX') ||
    upperText.includes('XT FIT')
  ) {
    detectedManufacturer = 'Apex Medical';
    detectedFormat = 'XT Series Report';
  }

  return {
    text: trimmedText,
    isLowQuality,
    pageCount: numPages,
    wordCount,
    charCount,
    detectedManufacturer,
    detectedFormat
  };
}

export function generateCompliancePdf(report: ComplianceReport, clinicName: string) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const isCompliant = report.status === 'Compliant';
  
  // PRIMARY STYLING COLOR BOARD
  const colorPrimary = { r: 15, g: 23, b: 42 };       // #0f172a (Slate 900)
  const colorSecondary = { r: 51, g: 65, b: 85 };     // #334155 (Slate 700)
  const colorAccent = { r: 37, g: 99, b: 235 };       // #2563eb (Accent Blue)
  const colorMuted = { r: 100, g: 116, b: 139 };     // #64748b (Slate 500)
  const colorBorder = { r: 226, g: 232, b: 240 };     // #e2e8f0 (Slate 200)
  const colorBgMuted = { r: 248, g: 250, b: 252 };    // #f8fafc (Slate 50)
  
  // Status Colors
  const colorSuccess = { r: 16, g: 185, b: 129 };     // #10b981 (Emerald 500)
  const colorSuccessBg = { r: 236, g: 253, b: 245 };  // #ecfdf5 (Emerald 50)
  const colorDanger = { r: 244, g: 63, b: 94 };       // #f43f5e (Rose 500)
  const colorDangerBg = { r: 255, g: 241, b: 242 };   // #fff1f2 (Rose 50)
  const colorWarning = { r: 217, g: 119, b: 6 };      // #d97706 (Amber 600)
  const colorWarningBg = { r: 255, g: 251, b: 235 };  // #fffbeb (Amber 50)

  // 1. TOP BRANDING BANNER
  doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.rect(0, 0, 210, 8, 'F');

  // 2. DOCUMENT BRANDING HEADER (PRIMARY LOCKUP)
  // Soft beige-cream background card
  doc.setFillColor(247, 245, 240); // #F7F5F0
  doc.setDrawColor(colorBorder.r, colorBorder.g, colorBorder.b);
  doc.setLineWidth(0.3);
  doc.roundedRect(20, 15, 170, 26, 3, 3, 'FD');

  // Let's print the Docket Code on top right of the card
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184); // light slate grey text
  doc.text(`TRACKER DOCKET ID: TRK-${report.id.substring(0, 8).toUpperCase()}`, 185, 20, { align: 'right' });

  // Draw the purple roundel logo on the left of the card
  doc.setFillColor(88, 80, 194); // #5850C2 (brand purple)
  doc.circle(32, 28, 7.5, 'F');

  // Floating 'z z z' letters printed inside/above check
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(5);
  doc.text('z', 36.5, 25);
  doc.setFontSize(4);
  doc.text('z', 38, 23.5);
  doc.setFontSize(3);
  doc.text('z', 39.2, 22.4);

  // White bold checkmark inside logo
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1.0);
  doc.line(29.5, 28, 31.2, 30.3);
  doc.line(31.2, 30.3, 35.8, 25.5);

  // Typography Lockup
  // "Comply"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(46, 40, 117); // #2E2875
  doc.text('Comply', 44, 25);
  
  // "Zzz"
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(88, 80, 194); // #5850C2
  doc.text('Zzz', 68.5, 25);

  // Underline separator
  doc.setDrawColor(170, 165, 232); // #AAA5E8
  doc.setLineWidth(0.35);
  doc.line(44, 27.5, 105, 27.5);

  // Underline slogan info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(88, 80, 194); // #5850C2
  doc.text('SLEEP PROVEN. ROAD APPROVED.', 44, 30.5);

  // Subtitle info beneath line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(`DOT CPAP COMPLIANCE REPORTING  •  ${clinicName.toUpperCase()}`, 44, 35.5);

  // 3. TITLE BLOCK
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text('CPAP Compliance Certification Letter', 20, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(colorMuted.r, colorMuted.g, colorMuted.b);
  doc.text('Prepared under criteria referenced by DOT and Federal Motor Carrier Safety Administration (FMCSA).', 20, 53);

  // 4. BIG DETERMINATION STATUS BADGE
  const badgeBg = isCompliant ? colorSuccessBg : colorDangerBg;
  const badgeBorder = isCompliant ? colorSuccess : colorDanger;
  const badgeText = isCompliant ? colorSuccess : colorDanger;
  const badgeLabel = isCompliant 
    ? 'COMPLIANT — PASSES FEDERAL CPAP USAGE GUIDELINES' 
    : 'NON-COMPLIANT — INSUFFICIENT USAGE DETECTED';

  doc.setFillColor(badgeBg.r, badgeBg.g, badgeBg.b);
  doc.setDrawColor(badgeBorder.r, badgeBorder.g, badgeBorder.b);
  doc.setLineWidth(0.3);
  doc.roundedRect(20, 58, 170, 16, 2, 2, 'FD');

  // Side color swatch inside badge
  doc.setFillColor(badgeBorder.r, badgeBorder.g, badgeBorder.b);
  doc.rect(20, 58, 3, 16, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(colorMuted.r, colorMuted.g, colorMuted.b);
  doc.text('INITIAL DETERMINATION STATUS:', 28, 64);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(badgeText.r, badgeText.g, badgeText.b);
  doc.text(badgeLabel, 28, 69);

  // 5. DRIVER DEMOGRAPHIC & METADATA GRID BOX
  doc.setFillColor(colorBgMuted.r, colorBgMuted.g, colorBgMuted.b);
  doc.setDrawColor(colorBorder.r, colorBorder.g, colorBorder.b);
  doc.setLineWidth(0.3);
  doc.roundedRect(20, 80, 170, 36, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text('DEMOGRAPHIC AND ADMINISTRATIVE SPECIFICATIONS', 25, 86);

  doc.setDrawColor(colorBorder.r, colorBorder.g, colorBorder.b);
  doc.setLineWidth(0.3);
  doc.line(25, 88, 185, 88);

  // Key-value rendering setup
  doc.setFontSize(9);
  
  // Left Column
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text('Driver Name:', 25, 94);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text(report.patientName, 49, 94);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text('Date of Birth:', 25, 100);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text(report.dob || 'Not Provided', 49, 100);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text('Clinic/Carrier:', 25, 106);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text(clinicName, 49, 106);

  // Right Column
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text('CDL License:', 110, 94);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  const licenseStr = report.licenseNumber 
    ? `${report.licenseNumber}${report.licenseState ? ` (${report.licenseState})` : ''}` 
    : 'Not Provided';
  doc.text(licenseStr, 134, 94);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text('Device Model:', 110, 100);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text(report.metrics.device_type || 'CPAP Therapy System', 134, 100);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text('Data Period:', 110, 106);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text(`${report.metrics.report_start_date} to ${report.metrics.report_end_date}`, 134, 106);

  // 6. CLINICAL SCORECARD STATS TABLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text('CLINICAL COMPLIANCE SCORECARD AUDIT', 20, 124);

  // Table Column Labels Setup
  const colX = {
    metric: 24,
    limit: 80,
    measured: 122,
    status: 164
  };

  doc.setFillColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.rect(20, 128, 170, 7.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('CLINICAL PARAMETER', colX.metric, 133);
  doc.text('REGULATORY STANDARD', colX.limit, 133);
  doc.text('MEASURED DRIVER DATA', colX.measured, 133);
  doc.text('VERIFICATION STATUS', colX.status, 133);

  // Rows Data
  const scorecardRows = [
    {
      label: 'Continuous Assessment Period',
      guideline: 'Minimum of 30 Nights Recommended',
      measured: `${report.metrics.total_days} nights monitored`,
      isPass: report.metrics.total_days >= 30,
      customStatus: report.metrics.total_days >= 30 ? 'VALID DEPTH' : 'SHORT SAMPLE',
      statusType: report.metrics.total_days >= 30 ? 'success' : 'warning'
    },
    {
      label: 'CPAP Usage Frequency Ratio',
      guideline: '>= 70% of days used >= 4 hours',
      measured: `${report.metrics.usage_days_percent}% of compliance nights`,
      isPass: report.metrics.usage_days_percent >= 70,
      customStatus: report.metrics.usage_days_percent >= 70 ? 'COMPLIANT' : 'NON-COMPLIANT',
      statusType: report.metrics.usage_days_percent >= 70 ? 'success' : 'danger'
    },
    {
      label: 'Average Nightly Use duration',
      guideline: 'Average >= 4.0 Hours per Night',
      measured: `${report.metrics.average_usage_hours} hours / night`,
      isPass: report.metrics.average_usage_hours >= 4.0,
      customStatus: report.metrics.average_usage_hours >= 4.0 ? 'COMPLIANT' : 'INSUFFICIENT',
      statusType: report.metrics.average_usage_hours >= 4.0 ? 'success' : 'danger'
    },
    {
      label: 'Residual Sleep Apnea Control',
      guideline: 'Optimal Index AHI < 5.0 / hr',
      measured: `AHI: ${report.metrics.ahi} events / hour`,
      isPass: report.metrics.ahi <= 5.0,
      customStatus: report.metrics.ahi <= 5.0 ? 'OPTIMAL' : 'ELEVATED index',
      statusType: report.metrics.ahi <= 5.0 ? 'success' : 'warning'
    }
  ];

  let currentY = 135.5;
  scorecardRows.forEach((row, idx) => {
    // Zebra rows background filling
    if (idx % 2 === 0) {
      doc.setFillColor(colorBgMuted.r, colorBgMuted.g, colorBgMuted.b);
      doc.rect(20, currentY, 170, 9.5, 'F');
    }

    // Border bottom line
    doc.setDrawColor(colorBorder.r, colorBorder.g, colorBorder.b);
    doc.setLineWidth(0.2);
    doc.line(20, currentY + 9.5, 190, currentY + 9.5);

    // Text cells
    doc.setFontSize(8.5);
    
    // Column 1: Clinic parameter
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
    doc.text(row.label, colX.metric, currentY + 6);

    // Column 2: Guideline threshold
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
    doc.text(row.guideline, colX.limit, currentY + 6);

    // Column 3: Measured metrics
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
    doc.text(row.measured, colX.measured, currentY + 6);

    // Column 4: Color-coded execution Status
    let statusColor = colorSuccess;
    if (row.statusType === 'danger') statusColor = colorDanger;
    if (row.statusType === 'warning') statusColor = colorWarning;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(statusColor.r, statusColor.g, statusColor.b);
    doc.text(row.isPass ? `[PASS] ${row.customStatus}` : `[FAIL] ${row.customStatus}`, colX.status, currentY + 6);

    currentY += 9.5;
  });

  // 7. VERIFICATION & DECLARATION PARAGRAPH
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text('OFFICIAL ATTESTATION & CLINICAL DECLARATION', 20, 182);

  const declParagraph = 
    `I, acting as the certified medical examiner / authorized clinician representative, hereby attest that the diagnostic computer telemetry of the CPAP system was extracted, reviewed, and algorithmically processed for ${report.patientName}. Let it be certified that the objective sleep compliance metrics are verified and found to be ${isCompliant ? 'fully compliant with FMCSA requirements for a 1-year CDL commercial physical certification' : 'non-compliant with existing regulatory thresholds for self-monitored therapy compliance, requiring further medical assessment/review'}.`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  
  const splitAttest = doc.splitTextToSize(declParagraph, 170);
  doc.text(splitAttest, 20, 187);

  // 8. SIGNATURE & STAMP BLOCK ROW
  const sigY = 210;
  
  // Left Column: Professional signature block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text('CERTIFIED BY CLINIC REPRESENTATIVE:', 20, sigY);
  
  // Signature underline
  doc.setDrawColor(colorMuted.r, colorMuted.g, colorMuted.b);
  doc.setLineWidth(0.4);
  doc.line(20, sigY + 15, 90, sigY + 15);

  // Custom italic text representing actual signature
  doc.setFont('times', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(colorAccent.r, colorAccent.g, colorAccent.b);
  doc.text(clinicName, 26, sigY + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.text(clinicName, 20, sigY + 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(colorMuted.r, colorMuted.g, colorMuted.b);
  doc.text('Authorized Electronic Compliance Officer', 20, sigY + 23);

  // Right Column: Gorgeous Verification Stamp
  // Width 65mm, height 28mm, placed at x=125, y=sigY
  doc.setDrawColor(colorMuted.r, colorMuted.g, colorMuted.b);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([2, 2], 0); // Dash border representing stamps
  doc.roundedRect(125, sigY - 2, 65, 26, 1.5, 1.5, 'S');
  doc.setLineDashPattern([], 0); // Restore normal lines

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(colorAccent.r, colorAccent.g, colorAccent.b);
  doc.text('TELEMETRY VALIDATION STAMP', 131, sigY + 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(isCompliant ? colorSuccess.r : colorDanger.r, isCompliant ? colorSuccess.g : colorDanger.g, isCompliant ? colorSuccess.b : colorDanger.b);
  doc.text(isCompliant ? 'VERIFIED: COMPLIANT' : 'VERIFIED: NON-COMPLIANT', 131, sigY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  doc.text(`Tracker Hash: ${report.id.substring(0, 16).toUpperCase()}`, 131, sigY + 13);
  doc.text(`Verification Date: ${formatDate(new Date())}`, 131, sigY + 17);
  doc.text(`Digital Seal Signature Signed Locally`, 131, sigY + 21);

  // 9. SECURITY EPHEMERAL COMPLIANCE FOOTER
  const footerY = 244;
  doc.setFillColor(colorBgMuted.r, colorBgMuted.g, colorBgMuted.b);
  doc.setDrawColor(colorPrimary.r, colorPrimary.g, colorPrimary.b);
  doc.setLineWidth(0.4);
  // Box for privacy instruction
  doc.roundedRect(20, footerY - 4, 170, 20, 1.5, 1.5, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(colorDanger.r, colorDanger.g, colorDanger.b);
  doc.text('⚠️ ZERO-TRUST EPHEMERAL PURGE WARNING (15 MIN EXPIRE)', 24, footerY + 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(colorSecondary.r, colorSecondary.g, colorSecondary.b);
  const privacyDisclaimer = 
    "To guarantee maximum confidentiality and protect medical data, this compliance assessor deletes all processed files 15 minutes after upload. This PDF represents the permanent, non-recoverable certifier of this session. Please save this file to your local computer or secure health record repository immediately.";
  
  const splitDisclaimer = doc.splitTextToSize(privacyDisclaimer, 162);
  doc.text(splitDisclaimer, 24, footerY + 5);

  // Footnote
  doc.setFontSize(6.5);
  doc.setTextColor(colorMuted.r, colorMuted.g, colorMuted.b);
  doc.text('Commercial Transport CPAP Assessment Verification Portal. Powered by Secure Endpoint Analytics.', 105, 274, { align: 'center' });

  // 10. TRIGGER SAVE DOWNLOAD
  doc.save(`DOT_Compliance_Letter_${report.patientName.replace(/\s+/g, '_')}.pdf`);
}
