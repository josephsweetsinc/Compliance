import { jsPDF } from 'jspdf';

export interface SampleReportOptions {
  type: 'compliant' | 'non_compliant';
}

export function generateSampleCpapPdf(type: 'compliant' | 'non_compliant'): File {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter'
  });

  const isCompliant = type === 'compliant';
  const patientName = isCompliant ? 'Marcus T. Vance' : 'Robert J. Chen';
  const mrn = isCompliant ? 'MRN-847291' : 'MRN-391820';
  const device = isCompliant ? 'ResMed AirSense 11 AutoSet' : 'Philips Respironics DreamStation 2 Auto';
  const serialNumber = isCompliant ? '23211894021' : 'DS2-993821-X';

  const today = new Date();
  const endDateStr = today.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const startDate = new Date();
  startDate.setDate(today.getDate() - 30);
  const startDateStr = startDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  // Draw header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 58, 138); // Blue
  doc.text(isCompliant ? 'ResMed AirView™ Clinical Compliance Report' : 'Philips Care Orchestrator™ CPAP Compliance Report', 40, 50);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('DOT / FMCSA / FAA Clinical Telemonitoring Compliance Assessment', 40, 68);

  // Line separator
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  doc.line(40, 78, 570, 78);

  // Patient Info section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('PATIENT IDENTIFICATION', 40, 100);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Patient Name: ${patientName}`, 40, 118);
  doc.text(`Medical Record Number: ${mrn}`, 40, 134);
  doc.text(`Date of Birth: 04/18/1978`, 40, 150);
  doc.text(`Device Model: ${device}`, 320, 118);
  doc.text(`Serial Number: ${serialNumber}`, 320, 134);
  doc.text(`Prescribed Pressure: 10.0 cmH2O`, 320, 150);

  // Compliance Period
  doc.line(40, 165, 570, 165);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPLIANCE EVALUATION PERIOD', 40, 185);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Compliance Period: ${startDateStr} to ${endDateStr}`, 40, 203);
  doc.text(`Total Days Evaluated: 30 days`, 40, 219);
  doc.text(`Evaluation Window: 30 consecutive days`, 320, 203);
  doc.text(`Compliance Standard: DOT / FMCSA 4+ hrs on 70% of days`, 320, 219);

  // Compliance Summary Box
  const boxY = 240;
  doc.setFillColor(isCompliant ? 240 : 255, isCompliant ? 253 : 241, isCompliant ? 244 : 242);
  doc.roundedRect(40, boxY, 530, 80, 6, 6, 'F');
  doc.setDrawColor(isCompliant ? 187 : 254, isCompliant ? 247 : 202, isCompliant ? 208 : 202);
  doc.roundedRect(40, boxY, 530, 80, 6, 6, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(isCompliant ? 22 : 159, isCompliant ? 101 : 18, isCompliant ? 52 : 57);
  doc.text(isCompliant ? 'COMPLIANCE STATUS: COMPLIANT (PASS)' : 'COMPLIANCE STATUS: NON-COMPLIANT (DID NOT MEET CRITERIA)', 55, boxY + 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  if (isCompliant) {
    doc.text('The patient demonstrated continuous adherence exceeding the standard FMCSA 70% threshold (4+ hrs/night).', 55, boxY + 44);
    doc.text('Eligible for 1-Year Commercial Driver Medical Certificate Clearance.', 55, boxY + 60);
  } else {
    doc.text('The patient failed to meet the standard 70% usage adherence criteria (only 46.7% of evaluated nights >= 4 hours).', 55, boxY + 44);
    doc.text('Recommendation: 30-day temporary certificate or adherence counseling required prior to clearance.', 55, boxY + 60);
  }

  // Key Statistics Table
  const tableY = 345;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('THERAPY USAGE STATISTICS', 40, tableY);

  const stats = isCompliant ? [
    ['Days with Usage >= 4 Hours', '25 of 30 days (83.3%)', 'Threshold: >= 70% (PASSED)'],
    ['Days with Usage', '28 of 30 days (93.3%)', 'Regularity: High'],
    ['Average Usage on Used Days', '6.8 hours/night', 'Target: >= 4.0 hrs (PASSED)'],
    ['Average Usage (All Days)', '6.3 hours/night', 'Overall therapy adherence'],
    ['Apnea-Hypopnea Index (AHI)', '2.4 events/hr', 'Normal (< 5.0 events/hr)'],
    ['95th Percentile Pressure', '11.2 cmH2O', 'Prescribed range'],
    ['95th Percentile Leak', '14.2 L/min', 'Well within acceptable seal range (< 24 L/min)'],
  ] : [
    ['Days with Usage >= 4 Hours', '14 of 30 days (46.7%)', 'Threshold: >= 70% (FAILED)'],
    ['Days with Usage', '18 of 30 days (60.0%)', 'Regularity: Suboptimal'],
    ['Average Usage on Used Days', '4.2 hours/night', 'Target: >= 4.0 hrs'],
    ['Average Usage (All Days)', '2.5 hours/night', 'Deficient adherence overall'],
    ['Apnea-Hypopnea Index (AHI)', '8.6 events/hr', 'Elevated (> 5.0 events/hr)'],
    ['95th Percentile Pressure', '13.0 cmH2O', 'Prescribed range'],
    ['95th Percentile Leak', '29.5 L/min', 'Mask leak detected (> 24 L/min)'],
  ];

  let currentY = tableY + 20;
  stats.forEach(([label, value, note], idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(40, currentY - 12, 530, 20, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(label, 50, currentY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isCompliant ? 15 : 180, isCompliant ? 23 : 30, isCompliant ? 42 : 30);
    doc.text(value, 260, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(note, 420, currentY);

    currentY += 22;
  });

  // Footer Clinician Sign-off
  const footerY = 530;
  doc.line(40, footerY, 570, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('ELECTRONIC SIGN-OFF & CERTIFICATION', 40, footerY + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Generated via Telehealth Electronic Data Interchange (EDI). Complies with 49 CFR § 391.41.', 40, footerY + 36);
  doc.text(`Report Generated: ${new Date().toLocaleString()} | Authenticated by Sleep Medicine Lab`, 40, footerY + 50);

  const blob = doc.output('blob');
  const filename = isCompliant
    ? `ResMed_AirSense11_Compliance_Marcus_Vance.pdf`
    : `Philips_DreamStation2_NonCompliant_Robert_Chen.pdf`;

  return new File([blob], filename, { type: 'application/pdf' });
}
