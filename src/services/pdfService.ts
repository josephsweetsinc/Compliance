import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { jsPDF } from 'jspdf';
import { ComplianceReport } from '../types';
import { formatDate } from '../lib/utils';

// Set worker path for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

export function generateCompliancePdf(report: ComplianceReport, clinicName: string) {
  const doc = new jsPDF();
  const margin = 25;
  let y = margin;

  // Clinic Header
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(clinicName.toUpperCase(), margin, y);
  y += 5;
  doc.text('OCCUPATIONAL HEALTH & DOT COMPLIANCE', margin, y);
  y += 15;

  // Date
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(`Date: ${formatDate(new Date())}`, margin, y);
  y += 15;

  // Subject
  doc.setFont('helvetica', 'bold');
  doc.text('SUBJECT: DOT CPAP COMPLIANCE CERTIFICATION', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 15;

  // Recipient
  doc.text('To: Medical Examiner / DOT Certification Department', margin, y);
  y += 10;

  // Body
  const isCompliant = report.status === 'Compliant';
  const bodyText = `This letter serves to certify the CPAP compliance status for the driver identified below. Our clinical analysis of the provided usage data for the period of ${report.metrics.start_date} to ${report.metrics.end_date} has been completed.`;
  
  const splitBody = doc.splitTextToSize(bodyText, 160);
  doc.text(splitBody, margin, y);
  y += (splitBody.length * 6) + 10;

  // Driver Details
  doc.setFont('helvetica', 'bold');
  doc.text('DRIVER INFORMATION:', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 8;
  doc.text(`Name: ${report.patientName}`, margin + 5, y);
  y += 6;
  if (report.dob) {
    doc.text(`Date of Birth: ${report.dob}`, margin + 5, y);
    y += 6;
  }
  if (report.licenseNumber) {
    doc.text(`License: ${report.licenseNumber} (${report.licenseState || 'N/A'})`, margin + 5, y);
    y += 6;
  }
  y += 10;

  // Compliance Summary
  doc.setFont('helvetica', 'bold');
  doc.text('COMPLIANCE SUMMARY:', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 8;
  doc.text(`Total Nights Monitored: ${report.metrics.total_nights}`, margin + 5, y);
  y += 6;
  doc.text(`Nights Used > 4 Hours: ${report.metrics.nights_over_4_hours}`, margin + 5, y);
  y += 6;
  doc.text(`Compliance Percentage: ${report.metrics.compliance_percentage}% (Threshold: 70%)`, margin + 5, y);
  y += 6;
  doc.text(`Average Usage: ${report.metrics.average_usage_hours} hours/night (Threshold: 4.0 hrs)`, margin + 5, y);
  y += 6;
  doc.text(`AHI (Apnea-Hypopnea Index): ${report.metrics.ahi}`, margin + 5, y);
  y += 15;

  // Determination
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DETERMINATION:', margin, y);
  y += 10;
  
  if (isCompliant) {
    doc.setTextColor(0, 128, 0);
    doc.text('COMPLIANT', margin + 5, y);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    y += 8;
    const compliantText = "The driver meets the FMCSA requirement of using the CPAP machine for at least 4 hours per night on 70% of the nights monitored.";
    const splitCompliant = doc.splitTextToSize(compliantText, 160);
    doc.text(splitCompliant, margin + 5, y);
    y += (splitCompliant.length * 6);
  } else {
    doc.setTextColor(220, 0, 0);
    doc.text('NON-COMPLIANT', margin + 5, y);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    y += 8;
    const nonCompliantText = "The driver DOES NOT meet the FMCSA requirement of using the CPAP machine for at least 4 hours per night on 70% of the nights monitored.";
    const splitNonCompliant = doc.splitTextToSize(nonCompliantText, 160);
    doc.text(splitNonCompliant, margin + 5, y);
    y += (splitNonCompliant.length * 6);
  }

  y += 20;

  // Signature
  doc.text('Certified by:', margin, y);
  y += 15;
  doc.line(margin, y, margin + 60, y);
  y += 5;
  doc.setFontSize(9);
  doc.text(clinicName, margin, y);
  y += 4;
  doc.text('Authorized Clinical Representative', margin, y);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  const footerText = "Disclaimer: This document is a summary of CPAP usage data extracted via AI analysis. The final determination of fitness for duty rests with the certified Medical Examiner.";
  const splitFooter = doc.splitTextToSize(footerText, 160);
  doc.text(splitFooter, margin, 270);

  doc.save(`DOT_Compliance_Letter_${report.patientName.replace(/\s+/g, '_')}.pdf`);
}
