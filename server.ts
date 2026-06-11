import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from 'resend';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let resendClient: Resend | null = null;
let twilioClient: any = null;

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

  // API routes
  app.post("/api/send-notification", async (req, res) => {
    const { email, patientName, status, reportId } = req.body;

    console.log('Processing notification request for:', email);

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

      const { data, error } = await resend.emails.send({
        // Standard onboarding address works best without display names in some environments
        from: 'onboarding@resend.dev',
        to: safeEmail,
        subject: `CPAP Report: ${safePatientName} - ${safeStatus}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 16px;">CPAP Compliance Report Ready</h1>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">A new CPAP compliance report has been successfully processed and analyzed.</p>
            
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
              <h2 style="color: #1e293b; font-size: 18px; margin-top: 0;">Summary</h2>
              <p style="margin: 8px 0; color: #475569;"><strong>Patient Name:</strong> ${safePatientName}</p>
              <p style="margin: 8px 0; color: #475569;"><strong>Compliance Status:</strong> <span style="color: ${safeStatus === 'Compliant' ? '#059669' : '#dc2626'}; font-weight: bold;">${safeStatus}</span></p>
            </div>
            
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">You can view the full report, review metrics, and download the generated PDF in the application.</p>
            
            <div style="margin-top: 32px; text-align: center;">
              <a href="${reportUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">View Full Report</a>
            </div>
            
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">This is an automated notification from your CPAP Compliance SaaS app.</p>
          </div>
        `,
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

          <!-- Ephemeral warning -->
          <div style="background-color: #fffbeb; border: 1px dashed #f59e0b; border-radius: 12px; padding: 15px; margin-bottom: 24px; font-size: 13px; color: #b45309; line-height: 1.5;">
            <strong>⚠️ EPHEMERAL PURGE WARNING (15 Min Expiry)</strong><br />
            To comply with HIPAA, industrial transport regulations, and Zero-Trust credential requirements, this report is stored in <strong>temporary, self-destructing cloud storage</strong>. It will be <strong>permanently destroyed</strong> in 15 minutes. Please immediately log in, review the details, and generate/download the Official Certified Letter.
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
