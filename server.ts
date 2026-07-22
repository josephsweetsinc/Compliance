import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Resend } from 'resend';
import twilio from 'twilio';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf-8')
);

if (!admin.apps.length) {
  admin.initializeApp({ projectId: firebaseConfig.projectId });
}

let resendClient: Resend | null = null;
let twilioClient: any = null;
let genAIClient: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

function getResend() {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) {
      throw new Error('RESEND_API_KEY environment variable is missing.');
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

function getTwilio() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const token = process.env.TWILIO_AUTH_TOKEN?.trim();
    if (!sid || !token) {
      throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN environment variable is missing.');
    }
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // IP-based Rate Limiter Middleware for API endpoints (Max 30 requests / min)
  const apiRateLimitMap = new Map<string, { count: number; resetTime: number }>();
  
  const apiRateLimiter = (maxRequests = 30, windowMs = 60 * 1000) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
      const now = Date.now();
      const record = apiRateLimitMap.get(ip);

      if (!record || now > record.resetTime) {
        apiRateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
      }

      if (record.count >= maxRequests) {
        return res.status(429).json({
          success: false,
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please wait a minute before sending additional requests."
        });
      }

      record.count++;
      return next();
    };
  };

  // Authentication Verification Middleware for API endpoints.
  // Verifies the Firebase ID token's signature, issuer, audience and expiry
  // via firebase-admin rather than just checking that a header is present.
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized access",
        message: "An active authorization session token is required to execute notification dispatches."
      });
    }
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized access",
        message: "Invalid or malformed authorization token."
      });
    }
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      if (!decoded.email_verified) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Email verification is required to perform this action."
        });
      }
      (req as any).authUser = decoded;
      next();
    } catch (err: any) {
      console.error('Token verification failed:', err.message);
      return res.status(401).json({
        success: false,
        error: "Unauthorized access",
        message: "Invalid or expired authorization token."
      });
    }
  };

  // Apply rate limiter and auth verification to all /api endpoints
  app.use('/api', apiRateLimiter(30, 60 * 1000), requireAuth);

  // API routes
  app.post("/api/send-notification", async (req, res) => {
    const { email, patientName, status, reportId, pdfBase64, recipientRole, customMessage } = req.body;

    console.log('Processing notification request for:', email, 'with role:', recipientRole);

    if (!email || !patientName || !status || !reportId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: "Invalid email address format" });
    }

    // Use APP_URL from environment variable and handle trailing slashes
    let appUrl = process.env.APP_URL || 'http://localhost:3000';
    appUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;

    try {
      const resend = getResend();
      const reportUrl = `${appUrl}/report/${reportId}`;
      
      // Clean inputs
      const safePatientName = (patientName as string).replace(/[\n\r]/g, '').trim();
      const safeStatus = (status as string).trim();
      const safeEmail = (email as string).trim();
      const role = (recipientRole as string || 'custom').toLowerCase();
      const isCompliant = safeStatus === 'Compliant';

      const attachments = [];
      if (pdfBase64 && typeof pdfBase64 === "string") {
        const base64Content = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
        attachments.push({
          filename: `DOT_Compliance_Letter_${safePatientName.replace(/\s+/g, '_')}.pdf`,
          content: Buffer.from(base64Content, 'base64'),
        });
      }

      // Customize subject, greeting, and introduction based on recipient role
      let subject = `CPAP Compliance Report: ${safePatientName} - ${safeStatus}`;
      let emailHeader = "CPAP Compliance Verification";
      let greeting = "Hello,";
      let introParagraph = `A new CPAP compliance report has been successfully processed and analyzed. The certified compliance letter for <strong>${safePatientName}</strong> (Status: <strong>${safeStatus}</strong>) is attached for your reference.`;

      if (role === 'driver' || role === 'patient') {
        subject = `Your DOT CPAP Compliance Certificate: ${safePatientName} (${safeStatus})`;
        emailHeader = "Driver CPAP Compliance Report";
        greeting = `Dear ${safePatientName},`;
        introParagraph = isCompliant
          ? `Congratulations! Your CPAP therapy usage has been analyzed and meets the DOT/FMCSA compliance guidelines. Your certified compliance letter is attached to this email. You may download, print, or show this PDF at your DOT physical examination.`
          : `Your CPAP therapy usage has been analyzed. Unfortunately, your current records indicate that your usage does not yet meet the 70% threshold (at least 4 hours per night on 70% of days) required by DOT/FMCSA guidelines. Your certified report is attached for your clinical review.`;
      } else if (role === 'examiner' || role === 'clinic') {
        subject = `Official CPAP Compliance Audit: ${safePatientName} - ${safeStatus}`;
        emailHeader = "Medical Examiner Compliance Verification";
        greeting = "Dear Medical Examiner / Certification Official,";
        introParagraph = `Please find attached the certified CPAP compliance letter and therapy audit for commercial operator <strong>${safePatientName}</strong>. This document certifies that the operator is <strong>${safeStatus}</strong> with the physical qualifications standard of the FMCSA.`;
      } else if (role === 'employer' || role === 'safety') {
        subject = `Safety Compliance Alert: ${safePatientName} CPAP Status (${safeStatus})`;
        emailHeader = "Employer Safety & Health Compliance Alert";
        greeting = "Dear Fleet Representative / Safety Officer,";
        introParagraph = `This is to notify you that CPAP compliance monitoring metrics have been successfully processed for operator <strong>${safePatientName}</strong>. The operator's compliance status is verified as <strong>${safeStatus}</strong>. The complete, official certified letter is attached.`;
      }

      const statusColor = isCompliant ? '#10b981' : '#f43f5e';
      const statusBgColor = isCompliant ? '#ecfdf5' : '#fff1f2';
      const statusTextColor = isCompliant ? '#065f46' : '#9f1239';

      const customMessageHtml = customMessage && String(customMessage).trim().length > 0
        ? `
          <div style="margin: 20px 0; padding: 14px 18px; border-left: 4px solid #3b82f6; background-color: #eff6ff; border-radius: 4px 12px 12px 4px;">
            <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: bold; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em;">Personalized Dispatch Note:</p>
            <p style="margin: 0; color: #1e293b; font-size: 14px; font-style: italic; line-height: 1.5;">"${String(customMessage).trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}"</p>
          </div>
        `
        : '';

      const { data, error } = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: safeEmail,
        subject: subject,
        html: `
          <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <!-- Header Banner -->
            <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px;">
              <span style="font-size: 10px; font-weight: 800; color: #5850c2; text-transform: uppercase; letter-spacing: 0.15em; display: block; margin-bottom: 4px;">ComplyZzz Certified System</span>
              <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0; tracking-tight: -0.02em;">${emailHeader}</h1>
            </div>

            <p style="color: #1e293b; font-size: 16px; font-weight: 600; margin-top: 0; margin-bottom: 12px;">${greeting}</p>
            <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-top: 0; margin-bottom: 20px;">${introParagraph}</p>
            
            <!-- Optional Custom Message from Operator -->
            ${customMessageHtml}

            <!-- Summary Box -->
            <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; padding: 20px; border-radius: 12px; margin: 24px 0;">
              <h2 style="color: #0f172a; font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Compliance Assessment</h2>
              
              <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
                <tr>
                  <td style="padding: 6px 0; font-weight: 600; color: #64748b; width: 40%;">Operator Name</td>
                  <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">${safePatientName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: 600; color: #64748b;">Regulatory Status</td>
                  <td style="padding: 6px 0;">
                    <span style="background-color: ${statusBgColor}; color: ${statusTextColor}; border: 1px solid rgba(${isCompliant ? '16,185,129' : '244,63,94'},0.2); padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 12px; text-transform: uppercase;">
                      ${safeStatus}
                    </span>
                  </td>
                </tr>
              </table>
            </div>

            <p style="color: #64748b; font-size: 14px; line-height: 1.5; margin-bottom: 24px;">
              The certified DOT CPAP Compliance report is attached to this message as an official <strong>PDF document</strong>. For security and medical privacy compliance, all report records are transmitted using encrypted SSL/TLS protocols and stored securely in your portal.
            </p>
            
            <div style="margin-top: 32px; text-align: center; margin-bottom: 16px;">
              <a href="${reportUrl}" style="display: inline-block; padding: 14px 28px; background-color: #5850c2; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 12px rgba(88,80,194,0.2);">Open Compliance Dashboard</a>
            </div>
            
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 32px 0;" />
            <div style="text-align: center; color: #94a3b8; font-size: 11px; line-height: 1.6;">
              <p style="margin: 0; font-weight: bold;">ComplyZzz Sleep Analytics Portal</p>
              <p style="margin: 4px 0 0 0;">This email was sent on behalf of your healthcare/safety administration program using the Resend platform.</p>
            </div>
          </div>
        `,
        attachments: attachments.length > 0 ? attachments : undefined
      });

      if (error) {
        console.error('Resend API Detailed Error:', JSON.stringify(error, null, 2));
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to send email via Resend.',
          details: error.message || error.name || 'Validation Error'
        });
      }

      console.log(`Notification sent successfully to ${safeEmail}`);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('Notification Service Error:', err.message);
      
      const status = err.message.includes('RESEND_API_KEY') ? 401 : 500;
      res.status(status).json({ 
        success: false, 
        error: 'An error occurred while processing the notification.',
        message: err.message 
      });
    }
  });

  app.post("/api/send-user-summary", async (req, res) => {
    const { email, report } = req.body;

    console.log('Processing automatic user summary email for:', email);

    if (!email || !report || !report.id || !report.metrics) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: "Invalid email address format" });
    }

    // Use APP_URL from environment variable and handle trailing slashes
    let appUrl = process.env.APP_URL || 'http://localhost:3000';
    appUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;

    try {
      const resend = getResend();
      const reportUrl = `${appUrl}/report/${report.id}`;
      
      // Clean and extract data safely
      const safeEmail = (email as string).trim();
      const patientName = String(report.patientName || report.metrics.patient_name || 'N/A').replace(/[\n\r]/g, '').trim();
      const status = String(report.status || 'Non-Compliant').trim();
      const metrics = report.metrics;

      const isCompliant = status === 'Compliant';
      const statusColor = isCompliant ? '#10b981' : '#f43f5e';
      const statusBgColor = isCompliant ? '#ecfdf5' : '#fff1f2';
      const statusTextColor = isCompliant ? '#065f46' : '#9f1239';
      const statusLabel = isCompliant ? 'Compliant - Passes Guidelines' : 'Does Not Meet Standards';

      const htmlContent = `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <!-- Header -->
          <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
            <span style="font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 0.1em; text-transform: uppercase; display: block; margin-bottom: 4px;">Commercial Transport Tracker</span>
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 800; margin: 0;">CPAP Compliance Assessment Summary</h1>
          </div>
          
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-top: 0; margin-bottom: 24px;">
            Hello, operator. The CPAP report upload of <strong>${patientName}</strong> has been successfully processed and verified. Below is the automated summary notification for your clinical/administrative records:
          </p>

          <!-- Status Card -->
          <div style="background-color: ${statusBgColor}; border: 1px solid ${statusColor}40; border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0; font-size: 11px; font-weight: 700; color: ${statusTextColor}; text-transform: uppercase; letter-spacing: 0.05em;">Initial Determination</p>
            <h2 style="margin: 4px 0 0 0; font-size: 24px; font-weight: 850; color: ${statusTextColor};">
              ${statusLabel}
            </h2>
          </div>

          <!-- Report Details & Metrics -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <h3 style="color: #0f172a; font-size: 14px; font-weight: 700; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em;">Assessment Details</h3>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Driver / Pilot:</td>
                <td style="padding: 8px 0; color: #011627; font-weight: 600; text-align: right;">${patientName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Evaluation Period:</td>
                <td style="padding: 8px 0; color: #011627; font-weight: 600; text-align: right;">${metrics.report_start_date} to ${metrics.report_end_date}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">CPAP Device:</td>
                <td style="padding: 8px 0; color: #011627; font-weight: 600; text-align: right;">${metrics.device_type || 'CPAP System'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Consecutive Days:</td>
                <td style="padding: 8px 0; color: #011627; font-weight: 600; text-align: right;">${metrics.total_days} nights</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Nights with Use &ge; 4 hrs:</td>
                <td style="padding: 8px 0; color: #011627; font-weight: 600; text-align: right;">${metrics.days_used_4_plus_hours} nights (${metrics.usage_days_percent}%)</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b; font-weight: 500;">Avg Usage per Night:</td>
                <td style="padding: 8px 0; color: #011627; font-weight: 600; text-align: right;">${metrics.average_usage_hours} hours</td>
              </tr>
              <tr>
                <td style="padding: 8px 0 0 0; color: #64748b; font-weight: 500;">Residual AHI:</td>
                <td style="padding: 8px 0 0 0; color: ${metrics.ahi <= 5 ? '#059669' : '#dc2626'}; font-weight: 700; text-align: right;">${metrics.ahi} / hr</td>
              </tr>
            </table>
          </div>

          <!-- Dynamic Action Link -->
          <div style="text-align: center; margin-bottom: 28px; margin-top: 24px;">
            <a href="${reportUrl}" style="display: inline-block; padding: 13px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">
              Access Certified Report
            </a>
          </div>

          <!-- Privacy & Security Notice -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 24px; font-size: 13px; color: #475569; line-height: 1.5;">
            <strong>🔒 CONFIDENTIALITY & PRIVACY NOTICE</strong><br />
            This compliance summary contains confidential medical and transport safety data. Access is restricted to verified healthcare and safety personnel. You can view, manage, or archive this official report directly in your portal.
          </div>

          <!-- Footer -->
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 28px 0 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; text-align: center; line-height: 1.6; margin: 0;">
            This is an automated administrative notification sent directly to you as the verified operator of this CPAP compliance portal. Please do not reply directly to this email.
          </p>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: safeEmail,
        subject: `[CPAP Portal] Processed: ${patientName} (${status})`,
        html: htmlContent,
      });

      if (error) {
        console.error('Resend SDK user summary detailed error:', JSON.stringify(error, null, 2));
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to send automatic user summary email via Resend.',
          details: error.message || error.name || 'Validation Error'
        });
      }

      console.log(`Automatic user summary email sent successfully to ${safeEmail}`);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error('Automatic summary notification service error:', err.message);
      
      const status = err.message.includes('RESEND_API_KEY') ? 401 : 500;
      res.status(status).json({ 
        success: false, 
        error: 'An error occurred while dispatching the automatic summary email.',
        message: err.message 
      });
    }
  });

  app.post("/api/send-sms", async (req, res) => {
    const { phone, patientName, clinicName, status, reportId } = req.body;

    console.log('Processing SMS request for:', phone);

    if (!phone || !patientName || !status || !reportId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const fromPhone = process.env.TWILIO_PHONE_NUMBER;
    if (!fromPhone) {
      return res.status(500).json({ error: "Twilio phone number not configured" });
    }

    let appUrl = process.env.APP_URL || 'http://localhost:3000';
    appUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;

    try {
      const client = getTwilio();
      const reportUrl = `${appUrl}/report/${reportId}`;
      
      const clinicText = clinicName ? ` from ${clinicName}` : '';
      const message = `Alert: A new CPAP compliance report for ${patientName} is ready${clinicText}. Status: ${status}. View summary at: ${reportUrl}`;

      const response = await client.messages.create({
        body: message,
        from: fromPhone,
        to: phone
      });

      console.log(`SMS sent successfully to ${phone}, SID: ${response.sid}`);
      res.json({ success: true, sid: response.sid });
    } catch (err: any) {
      console.error('SMS Service Error:', err.message);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send SMS notification.',
        message: err.message 
      });
    }
  });

  app.post("/api/extract-metrics", async (req, res) => {
    const { text } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ success: false, error: "Missing or empty 'text' field" });
    }

    try {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a medical data extraction engine.

Extract CPAP compliance metrics from the document.

Rules:

* Return ONLY valid JSON
* Do NOT explain anything
* Do NOT guess values
* If a value is missing, return null
* Numbers must be numeric (no % signs)

Extract:

patient_name
device_type
report_start_date
report_end_date
total_days
days_used_4_plus_hours
usage_days_percent
average_usage_hours
ahi

Important:

* usage_days_percent = % of days with ≥4 hours usage
* average_usage_hours = average nightly usage
* ahi = apnea-hypopnea index

Return format:

{
"patient_name": "",
"device_type": "",
"report_start_date": "",
"report_end_date": "",
"total_days": 0,
"days_used_4_plus_hours": 0,
"usage_days_percent": 0,
"average_usage_hours": 0,
"ahi": 0
}

Document Text:
${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              patient_name: { type: Type.STRING },
              device_type: { type: Type.STRING },
              report_start_date: { type: Type.STRING },
              report_end_date: { type: Type.STRING },
              total_days: { type: Type.INTEGER },
              days_used_4_plus_hours: { type: Type.INTEGER },
              usage_days_percent: { type: Type.NUMBER },
              average_usage_hours: { type: Type.NUMBER },
              ahi: { type: Type.NUMBER },
            },
            required: [
              "patient_name",
              "device_type",
              "report_start_date",
              "report_end_date",
              "total_days",
              "days_used_4_plus_hours",
              "usage_days_percent",
              "average_usage_hours",
              "ahi",
            ],
          },
        },
      });

      const jsonStr = response.text?.trim();
      if (!jsonStr) {
        return res.status(502).json({ success: false, error: "The AI returned an empty response. Please try uploading the report again." });
      }

      let metrics: any;
      try {
        metrics = JSON.parse(jsonStr);
      } catch {
        return res.status(502).json({ success: false, error: "Failed to parse the CPAP data. The report format might be unsupported or the file might be corrupted." });
      }

      res.json({ success: true, metrics });
    } catch (error: any) {
      console.error("Extraction error:", error);

      if (error.message?.includes("GEMINI_API_KEY")) {
        return res.status(500).json({ success: false, error: "The Gemini API key is missing or invalid on the server." });
      }
      if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("API key")) {
        return res.status(500).json({ success: false, error: "The Gemini API key is missing or invalid. Please check your application settings." });
      }
      if (error.message?.includes("quota") || error.message?.includes("429")) {
        return res.status(429).json({ success: false, error: "The analysis service is currently busy. Please wait a moment and try again." });
      }

      res.status(500).json({ success: false, error: `Failed to analyze the CPAP report: ${error.message || "Unknown error"}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
