import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { Resend } from 'resend';
import twilio from 'twilio';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { initializeApp as initAdminApp, cert, applicationDefault, getApps, type App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseAppletConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf-8')
);

let resendClient: Resend | null = null;
let twilioClient: any = null;
let stripeClient: Stripe | null = null;
let adminApp: AdminApp | null = null;

function getStripe(): Stripe | null {
  let key = process.env.STRIPE_SECRET_KEY?.trim() || '';
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (!key) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

// Firebase Admin SDK - used to write trusted, server-verified data (billing
// entitlements, credit balances) directly to Firestore, bypassing security
// rules. This is the only code path allowed to grant paid access; the
// client can only ever read these fields, never write them.
function getAdminApp(): AdminApp {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const projectId = firebaseAppletConfig.projectId;
  const svcKeyRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

  if (svcKeyRaw) {
    const svcKey = JSON.parse(svcKeyRaw);
    adminApp = initAdminApp({ credential: cert(svcKey), projectId });
  } else {
    // Falls back to Application Default Credentials, which is populated
    // automatically when running on Google Cloud / Firebase infrastructure.
    adminApp = initAdminApp({ credential: applicationDefault(), projectId });
  }
  return adminApp;
}

function getAdminDb(): AdminFirestore {
  return getAdminFirestore(getAdminApp(), firebaseAppletConfig.firestoreDatabaseId);
}

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  try {
    const decoded = await getAdminAuth(getAdminApp()).verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email };
  } catch (err: any) {
    console.warn('Firebase ID token verification failed:', err.message);
    return null;
  }
}

// Grants report credits or an active subscription for a completed Stripe
// Checkout Session. Safe to call more than once for the same session
// (e.g. from both the post-checkout redirect and the webhook) - the
// transaction below is idempotent per session id.
async function grantEntitlementForCheckoutSession(db: AdminFirestore, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) {
    console.warn(`[Stripe] Checkout session ${session.id} has no metadata.userId; cannot grant entitlement.`);
    return { granted: false, reason: 'missing_user_id' };
  }

  const planType = session.metadata?.planType === 'monthly_clinic' ? 'monthly_clinic' : 'per_report';
  const credits = Math.max(1, parseInt(session.metadata?.credits || '1', 10) || 1);
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  // Note: this deliberately does not catch-and-report-success on Firestore
  // errors. A failed write must surface as a failure - silently claiming
  // `granted: true` when nothing was written would let every credit/plan
  // check downstream believe the customer is entitled when they aren't
  // (this exact pattern was the cause of a prior free-access bypass).
  const processedRef = db.collection('stripeProcessedSessions').doc(session.id);
  const userRef = db.collection('users').doc(userId);

  return db.runTransaction(async (tx) => {
    const [processedSnap, userSnap] = await Promise.all([tx.get(processedRef), tx.get(userRef)]);

    if (processedSnap.exists) {
      return { granted: true, planType, credits, reason: 'already_processed' };
    }

    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const updates: Record<string, any> = {};

    if (planType === 'monthly_clinic') {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      updates.subscriptionPlan = 'monthly_clinic';
      updates.subscriptionStatus = 'active';
      updates.subscriptionCurrentPeriodEnd = periodEnd.toISOString();
    } else {
      updates.reportCredits = FieldValue.increment(credits);
      if (!userData.subscriptionPlan || userData.subscriptionPlan === 'free') {
        updates.subscriptionPlan = 'per_report';
      }
    }
    if (customerId) updates.stripeCustomerId = customerId;
    if (subscriptionId) updates.stripeSubscriptionId = subscriptionId;

    tx.set(processedRef, {
      sessionId: session.id,
      userId,
      planType,
      credits,
      processedAt: new Date().toISOString(),
    });

    if (userSnap.exists) {
      tx.update(userRef, updates);
    } else {
      // The user's profile doc should already exist by the time they can
      // reach checkout, but guard against a race by creating it rather
      // than dropping the entitlement on the floor.
      tx.set(userRef, {
        uid: userId,
        email: session.customer_email || session.metadata?.userEmail || '',
        clinicName: session.metadata?.clinicName || 'Personal / Operator',
        createdAt: new Date().toISOString(),
        reportCredits: credits,
        subscriptionPlan: planType,
        subscriptionStatus: 'active',
        ...updates,
      }, { merge: true });
    }

    return { granted: true, planType, credits };
  });
}

async function findUserRefByStripeCustomerId(db: AdminFirestore, customerId: string) {
  const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].ref;
}

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
  let sid = process.env.TWILIO_ACCOUNT_SID?.trim() || '';
  if ((sid.startsWith('"') && sid.endsWith('"')) || (sid.startsWith("'") && sid.endsWith("'"))) {
    sid = sid.slice(1, -1).trim();
  }
  let token = process.env.TWILIO_AUTH_TOKEN?.trim() || '';
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1).trim();
  }

  if (!sid || !token) {
    throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN environment variable is missing.');
  }

  if (!sid.startsWith('AC')) {
    throw new Error('TWILIO_ACCOUNT_SID must start with "AC". Please check your Twilio credentials in environment settings.');
  }

  return twilio(sid, token);
}

function getAppUrl(req?: express.Request): string {
  // 1. If req is provided, prioritize dynamic host detection from request headers
  if (req) {
    const origin = (req.headers.origin || req.headers.referer) as string | undefined;
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (parsed.host && !parsed.host.includes('localhost:3000')) {
          return `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
        }
      } catch (e) {
        // ignore invalid URL format
      }
    }

    const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
    const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const proto = rawProto.split(',')[0].trim();
    if (host && !host.includes('localhost:3000')) {
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }

  // 2. Fallback to process.env.APP_URL if set in environment (and not generic placeholder)
  let envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl.includes('=')) {
    envUrl = envUrl.split('=')[0].trim();
  }

  if (envUrl && envUrl !== 'http://localhost:3000' && envUrl !== 'https://localhost:3000') {
    if (!envUrl.startsWith('http://') && !envUrl.startsWith('https://')) {
      envUrl = `https://${envUrl}`;
    }
    return envUrl.replace(/\/+$/, '');
  }

  // 3. Last fallback
  return 'https://reports.complyzzz.com';
}

async function sendResendEmail(resend: any, params: {
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
}) {
  const { fromEmail, to, subject, html, text, attachments } = params;

  let rawFrom = fromEmail.trim().toLowerCase();

  // Ensure the domain strictly uses the verified subdomain reports.complyzzz.com
  if (rawFrom.includes('complyzzz.com')) {
    rawFrom = rawFrom.replace(/@.*complyzzz\.com$/, '@reports.complyzzz.com');
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

  const plainText = text || html.replace(/<[^>]+>/g, '');

  let result = await resend.emails.send({
    from: formattedFrom,
    to: to,
    subject: subject,
    html: html,
    text: plainText,
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
        text: plainText,
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

  // Preserve raw body buffer for Stripe webhook signature verification
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // IP-based Rate Limiter Middleware for API endpoints (Max 30 requests / min)
  const apiRateLimitMap = new Map<string, { count: number; resetTime: number }>();
  
  const apiRateLimiter = (maxRequests = 30, windowMs = 60 * 1000) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Exclude Stripe webhooks from user rate limiting
      if (req.path.endsWith('/webhook')) {
        return next();
      }

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
  // Verifies a real Firebase ID token (or the internal server-to-server key)
  // and attaches the verified uid/email to the request - handlers must use
  // req.uid rather than trusting a userId supplied in the request body,
  // since a client can put any value it likes in a JSON body.
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1]?.trim() : null;
    const internalApiKey = process.env.INTERNAL_API_KEY?.trim();

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization bearer token.' });
    }

    if (internalApiKey && token === internalApiKey) {
      (req as any).isInternal = true;
      return next();
    }

    const decoded = await verifyFirebaseIdToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired authentication token.' });
    }

    (req as any).uid = decoded.uid;
    (req as any).userEmail = decoded.email;
    next();
  };

  // Stripe calls the webhook directly with no user session (it authenticates
  // via the webhook signature instead), and the pricing config is public,
  // non-sensitive data - both are exempt from requireAuth.
  const PUBLIC_API_PATHS = new Set(['/billing/webhook', '/billing/config', '/stripe/webhook']);
  const requireAuthUnlessPublic = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (PUBLIC_API_PATHS.has(req.path)) {
      return next();
    }
    return requireAuth(req, res, next);
  };

  // Apply rate limiter and auth verification to all /api endpoints
  app.use('/api', apiRateLimiter(30, 60 * 1000), requireAuthUnlessPublic);

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

    const appUrl = getAppUrl(req);

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
        let base64Content = pdfBase64;
        if (base64Content.includes("base64,")) {
          base64Content = base64Content.split("base64,")[1];
        }
        base64Content = base64Content.trim();
        const pdfBuffer = Buffer.from(base64Content, 'base64');

        // Log validation check for PDF header %PDF
        const pdfHeader = pdfBuffer.toString('ascii', 0, 5);
        console.log(`[PDF Attachment Check] Header: '${pdfHeader}', size: ${pdfBuffer.length} bytes`);

        attachments.push({
          filename: `DOT_Compliance_Letter_${safePatientName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
          content: pdfBuffer,
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

    const appUrl = getAppUrl(req);

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

  // ===============================================================
  // Stripe Billing & Checkout Routes ($9/report, $250/month)
  // ===============================================================

  app.get("/api/billing/config", (req, res) => {
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY?.trim();
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim() || '';
    
    res.json({
      configured: hasStripeKey,
      publishableKey: publishableKey || null,
      pricing: {
        perReport: 9, // $9 USD per CPAP compliance report
        monthlySubscription: 250, // $250 USD per month unlimited clinic plan
      },
      plans: [
        {
          id: 'per_report',
          name: 'Pay-Per-Report',
          price: 9,
          interval: 'one_time',
          description: 'Certified DOT & FAA CPAP compliance letter credit. Ideal for individual operators, single physicals, and ad-hoc reviews.',
          features: [
            'Instant AI extraction from any CPAP vendor PDF',
            'Full FMCSA & FAA guideline adherence audit',
            'Certified clinical compliance verification letter',
            'SMS & Email delivery directly to phone or medical examiner',
            'Full PDF export and 1-year audit-safe archive',
          ]
        },
        {
          id: 'monthly_clinic',
          name: 'Clinic & Fleet Unlimited',
          price: 250,
          interval: 'month',
          popular: true,
          description: 'Unlimited CPAP compliance report processing for clinics, occupational health providers, DOT examiners, and transport fleets.',
          features: [
            'Unlimited CPAP report uploads and certifications',
            'Batch multi-file upload queue (up to 10 files at once)',
            'Automated operator email scorecard notifications',
            'Custom clinic branding on official determination letters',
            'Permanent secure report archive & search history',
            'Dedicated priority support & custom examiner export',
          ]
        }
      ]
    });
  });

  app.post("/api/billing/create-checkout-session", async (req: any, res) => {
    try {
      const { planType = 'per_report', quantity = 1, clinicName } = req.body;
      // userId/userEmail come from the verified ID token, never from the
      // request body or a synthesized guest id - otherwise a client could
      // request a checkout session (and later have it verified) under
      // someone else's account, or pay without any account to credit.
      if (!req.uid || !req.userEmail) {
        return res.status(401).json({ error: "A verified, email-bearing account is required to start checkout." });
      }
      const effectiveUserId = req.uid;
      const effectiveEmail = req.userEmail;

      const appUrl = getAppUrl(req);
      const stripe = getStripe();
      const safeQty = Math.max(1, parseInt(String(quantity), 10) || 1);

      // If Stripe secret key is configured, create live/test Stripe session
      if (stripe) {
        let session: Stripe.Checkout.Session;
        if (planType === 'monthly_clinic') {
          session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            customer_email: effectiveEmail,
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: 'ComplyZzz - Clinic & Fleet Unlimited Plan',
                    description: 'Unlimited DOT Physical & FAA Medical CPAP Compliance Reports & Letters',
                  },
                  unit_amount: 25000, // $250.00 in cents
                  recurring: {
                    interval: 'month',
                  },
                },
                quantity: 1,
              },
            ],
            metadata: {
              userId: effectiveUserId,
              userEmail: effectiveEmail,
              clinicName: clinicName || '',
              planType: 'monthly_clinic',
            },
            success_url: `${appUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&status=success&plan=monthly_clinic`,
            cancel_url: `${appUrl}/dashboard/billing?status=cancelled`,
          });
        } else {
          // Pay-per-report: $9 per report (or batch credit purchase)
          session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: effectiveEmail,
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: safeQty === 1 ? 'ComplyZzz - Single Report Credit' : `ComplyZzz - ${safeQty} Report Credits Pack`,
                    description: 'Certified DOT/FAA CPAP compliance determination letter credits ($9/report).',
                  },
                  unit_amount: 900, // $9.00 in cents
                },
                quantity: safeQty,
              },
            ],
            metadata: {
              userId: effectiveUserId,
              userEmail: effectiveEmail,
              clinicName: clinicName || '',
              planType: 'per_report',
              credits: String(safeQty),
            },
            success_url: `${appUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&status=success&plan=per_report&credits=${safeQty}`,
            cancel_url: `${appUrl}/dashboard/billing?status=cancelled`,
          });
        }

        return res.json({
          url: session.url,
          sessionId: session.id,
          simulated: false,
        });
      }

      // If Stripe is not yet configured with secret keys, provide instant preview simulation response
      // This allows immediate testing and preview in the development container
      const simulatedSessionId = `sim_session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const redirectUrl = planType === 'monthly_clinic'
        ? `${appUrl}/dashboard/billing?session_id=${simulatedSessionId}&status=success&plan=monthly_clinic&simulated=true`
        : `${appUrl}/dashboard/billing?session_id=${simulatedSessionId}&status=success&plan=per_report&credits=${safeQty}&simulated=true`;

      return res.json({
        url: redirectUrl,
        sessionId: simulatedSessionId,
        simulated: true,
        planType,
        credits: safeQty,
        message: "Stripe key is not configured in settings. Simulation mode active for testing.",
      });
    } catch (err: any) {
      console.error('Create checkout session error:', err);
      const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
      res.status(statusCode).json({
        error: err.message || 'Failed to initialize payment checkout session.',
        code: err.code || (err.raw?.code ?? null),
        declineCode: err.decline_code || (err.raw?.decline_code ?? null),
        type: err.type || (err.raw?.type ?? null),
        param: err.param || (err.raw?.param ?? null),
      });
    }
  });

  // Verifies a completed Checkout Session directly with Stripe and grants the
  // corresponding entitlement server-side via the Admin SDK. This is what
  // actually unlocks paid access - the client only ever displays the result,
  // it never writes reportCredits/subscriptionPlan/subscriptionStatus itself.
  app.post("/api/billing/verify-session", async (req: any, res) => {
    try {
      const { sessionId } = req.body;
      const userId = req.uid;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required." });
      }
      if (!userId) {
        return res.status(401).json({ error: "Authentication required." });
      }

      const stripe = getStripe();
      const db = getAdminDb();

      if (!stripe) {
        const { planType, quantity = 1 } = req.body;
        const session = {
          id: sessionId,
          metadata: {
            userId,
            planType: planType === 'monthly_clinic' ? 'monthly_clinic' : 'per_report',
            credits: String(Math.max(1, parseInt(quantity, 10) || 1)),
          },
        } as unknown as Stripe.Checkout.Session;
        // grantEntitlementForCheckoutSession throws on a genuine write
        // failure - let that propagate to the outer catch below rather
        // than reporting success for a grant that never happened.
        const result = await grantEntitlementForCheckoutSession(db, session);
        const userSnap = await db.collection('users').doc(userId).get();
        return res.json({ verified: true, simulated: true, granted: result.granted, profile: userSnap.data() ?? null });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['customer', 'subscription'],
      });

      if (session.metadata?.userId && session.metadata.userId !== userId) {
        return res.status(403).json({ error: "This checkout session does not belong to your account." });
      }

      if (session.payment_status === 'paid' || session.status === 'complete') {
        // Same as above: a failed grant must surface as an error, not a
        // fabricated success with numbers that were never persisted.
        const result = await grantEntitlementForCheckoutSession(db, session);
        const userSnap = await db.collection('users').doc(userId).get();

        return res.json({
          verified: true,
          granted: result.granted,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total ? session.amount_total / 100 : 0,
          profile: userSnap.exists ? userSnap.data() : null,
        });
      } else {
        return res.json({
          verified: false,
          paymentStatus: session.payment_status,
          status: session.status,
          planType: session.metadata?.planType,
          credits: session.metadata?.credits,
        });
      }
    } catch (err: any) {
      console.error('Verify checkout session error:', err);
      const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
      res.status(statusCode).json({
        error: err.message || 'Failed to verify checkout session.',
        code: err.code || (err.raw?.code ?? null),
        declineCode: err.decline_code || (err.raw?.decline_code ?? null),
        type: err.type || (err.raw?.type ?? null),
      });
    }
  });

  app.post("/api/billing/create-portal-session", async (req: any, res) => {
    try {
      const stripe = getStripe();
      const appUrl = getAppUrl(req);
      const userId = req.uid;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required." });
      }

      const db = getAdminDb();
      const userSnap = await db.collection('users').doc(userId).get();
      const customerId: string | undefined = userSnap.data()?.stripeCustomerId;

      if (!stripe || !customerId) {
        return res.json({
          url: `${appUrl}/dashboard/billing`,
          simulated: true,
        });
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${appUrl}/dashboard/billing`,
      });

      res.json({ url: portalSession.url });
    } catch (err: any) {
      console.error('Portal session error:', err);
      const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
      res.status(statusCode).json({
        error: err.message || 'Failed to create customer portal session.',
        code: err.code || (err.raw?.code ?? null),
        declineCode: err.decline_code || (err.raw?.decline_code ?? null),
        type: err.type || (err.raw?.type ?? null),
      });
    }
  });

  // Atomically consumes report credits for a batch of uploads about to be
  // processed. This is the only path that may decrement reportCredits - it
  // runs entirely server-side via the Admin SDK so it can't be bypassed by
  // editing client requests or calling Firestore directly (security rules
  // deny client writes to this field).
  app.post("/api/reports/consume-credits", async (req: any, res) => {
    try {
      const userId = req.uid;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required." });
      }

      const count = Math.max(1, parseInt(req.body?.count, 10) || 1);

      // This is the one gate standing between a user and free report
      // processing - it must fail closed. If the Admin SDK can't reach
      // Firestore (e.g. the service account lacks the Firestore IAM role),
      // that has to come back as a real error, never as `success: true`.
      const db = getAdminDb();
      const userRef = db.collection('users').doc(userId);

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) {
          return { success: false, unlimited: false, reportCredits: 0 };
        }
        const data = snap.data() || {};
        const isUnlimited = data.subscriptionPlan === 'monthly_clinic' && data.subscriptionStatus === 'active';
        if (isUnlimited) {
          return { success: true, unlimited: true, reportCredits: data.reportCredits ?? 0 };
        }

        const currentCredits = data.reportCredits ?? 0;
        if (currentCredits < count) {
          return { success: false, unlimited: false, reportCredits: currentCredits };
        }

        const remaining = Math.max(0, currentCredits - count);
        tx.update(userRef, { reportCredits: remaining });
        return { success: true, unlimited: false, reportCredits: remaining };
      });

      if (!result.success) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient report credits.',
          reportCredits: result.reportCredits,
          required: count,
        });
      }

      return res.json(result);
    } catch (err: any) {
      console.error('Consume credits error:', err);
      res.status(500).json({ error: err.message || 'Failed to update report credit balance.' });
    }
  });

  app.post(["/api/billing/webhook", "/api/stripe/webhook"], async (req: any, res) => {
    const stripe = getStripe();
    const sig = req.headers['stripe-signature'];
    let webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
    if ((webhookSecret.startsWith('"') && webhookSecret.endsWith('"')) || (webhookSecret.startsWith("'") && webhookSecret.endsWith("'"))) {
      webhookSecret = webhookSecret.slice(1, -1).trim();
    }

    if (!stripe) {
      return res.status(200).json({ received: true, simulated: true });
    }

    // Signature verification is mandatory once Stripe is configured - an
    // unverified body would let anyone POST forged events (e.g. a fake
    // "subscription active" update) directly to this endpoint.
    if (!webhookSecret) {
      console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured; rejecting webhook request.');
      return res.status(500).send('Webhook Error: STRIPE_WEBHOOK_SECRET is not configured on the server.');
    }
    if (!sig || !req.rawBody) {
      return res.status(400).send('Webhook Error: Missing signature or raw request body.');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error(`⚠️ Webhook signature verification failed:`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const db = getAdminDb();

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const result = await grantEntitlementForCheckoutSession(db, session);
          console.log(`[Stripe Webhook] Checkout session completed: ${session.id} -> ${JSON.stringify(result)}`);
          break;
        }
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
          const userRef = customerId ? await findUserRefByStripeCustomerId(db, customerId) : null;
          if (userRef) {
            const isActive = subscription.status === 'active' || subscription.status === 'trialing';
            const periodEndSec = (subscription as any).current_period_end;
            await userRef.update({
              subscriptionStatus: isActive ? 'active' : (subscription.status === 'canceled' ? 'canceled' : 'inactive'),
              ...(periodEndSec ? { subscriptionCurrentPeriodEnd: new Date(periodEndSec * 1000).toISOString() } : {}),
            });
          }
          console.log(`[Stripe Webhook] Subscription updated: ${subscription.id} status=${subscription.status}`);
          break;
        }
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
          const userRef = customerId ? await findUserRefByStripeCustomerId(db, customerId) : null;
          if (userRef) {
            await userRef.update({ subscriptionStatus: 'canceled' });
          }
          console.log(`[Stripe Webhook] Subscription deleted: ${subscription.id}`);
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          console.log(`[Stripe Webhook] Invoice payment succeeded: ${invoice.id}`);
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          console.warn(`[Stripe Webhook] Invoice payment failed: ${invoice.id}`);
          break;
        }
        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }
    } catch (err: any) {
      console.error(`[Stripe Webhook] Error handling event ${event.type}:`, err);
      // Still ack the event so Stripe doesn't retry indefinitely on a
      // permanent error; the failure is logged for manual follow-up.
    }

    res.json({ received: true });
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
