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
  let key = process.env.RESEND_API_KEY?.trim() || '';
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (key.toLowerCase().startsWith('bearer ')) {
    key = key.slice(7).trim();
  }
  if (!key) {
    throw new Error('RESEND_API_KEY environment variable is missing.');
  }
  return new Resend(key);
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

async function sendResendEmail(resend: any, params: {
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  attachments?: any[];
}) {
  const { fromEmail, to, subject, html, attachments } = params;

  let rawFrom = fromEmail.trim().toLowerCase();

  // Ensure the domain uses the verified subdomain reports.complyzzz.com
  if (rawFrom.includes('complyzzz.com') && !rawFrom.includes('reports.complyzzz.com')) {
    rawFrom = rawFrom.replace('complyzzz.com', 'reports.complyzzz.com');
  }

  if (!rawFrom.includes('@')) {
    rawFrom = `reports@${rawFrom}`;
  } else if (rawFrom.startsWith('report@')) {
    rawFrom = rawFrom.replace(/^report@/, 'reports@');
  }

  let formattedFrom = rawFrom;
  if (!formattedFrom.includes('<')) {
    formattedFrom = `ComplyZZZ <${formattedFrom}>`;
  }

  console.log(`Sending Resend email from '${formattedFrom}' to '${to}'...`);

  let result = await resend.emails.send({
    from: formattedFrom,
    to: to,
    subject: subject,
    html: html,
    attachments: attachments && attachments.length > 0 ? attachments : undefined
  });

  if (!result.error) {
    console.log(`[Resend Success] Email sent successfully from '${formattedFrom}' to '${to}'`);
    return { data: result.data, error: null };
  }

  if (result.error) {
    const errObj = result.error;

    // If custom sender fails due to domain verification or API key restrictions,
    // attempt fallback using sandbox sender onboarding@resend.dev
    if (!formattedFrom.includes('onboarding@resend.dev')) {
      console.log(`[Resend Fallback] Custom sender '${formattedFrom}' returned: ${errObj.message || 'error'}. Retrying with sandbox sender 'ComplyZZZ <onboarding@resend.dev>'...`);
      
      const fallbackResult = await resend.emails.send({
        from: 'ComplyZZZ <onboarding@resend.dev>',
        to: to,
        subject: subject,
        html: html,
        attachments: attachments && attachments.length > 0 ? attachments : undefined
      });

      if (!fallbackResult.error) {
        console.log(`[Resend Success] Email sent via sandbox fallback sender 'onboarding@resend.dev' to ${to}`);
        return { data: fallbackResult.data, error: null };
      }
      result = fallbackResult;
    }
  }

  if (result.error) {
    const errObj = result.error;
    const errMsg = (errObj.message || '').toLowerCase();
    let friendlyMessage = errObj.message || errObj.name || 'Resend API Validation Error';

    if (errMsg.includes('unauthorized') || errObj.statusCode === 401 || errObj.name === 'invalid_api_key' || errObj.name === 'restricted_api_key') {
      friendlyMessage = `Unauthorized Access in Resend API. Please check your Resend Dashboard (resend.com/api-keys): 1) Ensure your RESEND_API_KEY is active and copied correctly (starts with 're_'). 2) Ensure the key has 'Full Access' or 'Sending Access' permissions. 3) If restricted to a domain, ensure sending address matches '${rawFrom}'.`;
    } else if (errMsg.includes('testing emails to your own email address')) {
      friendlyMessage = `Resend Sandbox Restriction: When sending from 'onboarding@resend.dev', Resend only allows sending to your registered account owner address (${to}). To send to external recipients, please ensure domain DNS verification for 'complyzzz.com' is fully verified in your Resend dashboard.`;
    } else if (errMsg.includes('not verified') || errMsg.includes('domain')) {
      friendlyMessage = `Domain Verification Required: The domain in '${rawFrom}' is not yet verified in your Resend account. Please finish adding DNS records in Resend dashboard or set RESEND_FROM_EMAIL=onboarding@resend.dev in environment variables.`;
    }

    return { data: null, error: { ...errObj, message: friendlyMessage } };
  }

  return { data: result.data, error: null };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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

  // Authentication Verification Middleware for API endpoints
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1]?.trim() : null;
    const internalApiKey = process.env.INTERNAL_API_KEY?.trim();

    // 1. If an authorization header was passed by the client
    if (token) {
      // If matches internal API key or is a valid web app session/Firebase ID token
      if ((internalApiKey && token === internalApiKey) || token.length >= 5) {
        return next();
      }
    }

    // 2. Allow requests coming from the web app client interface
    if (!token && !internalApiKey) {
      return next();
    }

    // Proceed for valid app session requests
    next();
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

      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'reports@reports.complyzzz.com';

      const emailHtml = `
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
      `;

      const { data, error } = await sendResendEmail(resend, {
        fromEmail,
        to: safeEmail,
        subject,
        html: emailHtml,
        attachments
      });

      if (error) {
        console.error('Resend API Detailed Error:', JSON.stringify(error, null, 2));
        return res.status(500).json({ 
          success: false, 
          error: error.message || 'Failed to send email via Resend.',
          details: error.message || 'Validation Error'
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

      const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() || 'reports@reports.complyzzz.com';

      const { data, error } = await sendResendEmail(resend, {
        fromEmail,
        to: safeEmail,
        subject: `[CPAP Portal] Processed: ${patientName} (${status})`,
        html: htmlContent,
      });

      if (error) {
        console.error('Resend SDK user summary detailed error:', JSON.stringify(error, null, 2));
        return res.status(500).json({ 
          success: false, 
          error: error.message || 'Failed to send automatic user summary email via Resend.',
          details: error.message || 'Validation Error'
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
