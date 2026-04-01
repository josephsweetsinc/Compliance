import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let resendClient: Resend | null = null;

function getResend() {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY environment variable is missing. Please add it in the Settings menu.');
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.post("/api/send-notification", async (req, res) => {
    const { email, patientName, status, reportId } = req.body;

    if (!email || !patientName || !status || !reportId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Use APP_URL from environment variable
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    try {
      const resend = getResend();
      const reportUrl = `${appUrl}/report/${reportId}`;
      
      const { data, error } = await resend.emails.send({
        from: 'CPAP Compliance <notifications@resend.dev>',
        to: [email],
        subject: `CPAP Compliance Report: ${patientName} - ${status}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 16px;">CPAP Compliance Report Ready</h1>
            <p style="color: #475569; font-size: 16px; line-height: 1.5;">A new CPAP compliance report has been successfully processed and analyzed.</p>
            
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
              <h2 style="color: #1e293b; font-size: 18px; margin-top: 0;">Summary</h2>
              <p style="margin: 8px 0; color: #475569;"><strong>Patient Name:</strong> ${patientName}</p>
              <p style="margin: 8px 0; color: #475569;"><strong>Compliance Status:</strong> <span style="color: ${status === 'Compliant' ? '#059669' : '#dc2626'}; font-weight: bold;">${status}</span></p>
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
        console.error('Resend API Error:', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to send email via Resend.',
          details: error.message 
        });
      }

      console.log(`Notification sent successfully to ${email}`);
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
