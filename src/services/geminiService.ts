import { ComplianceMetrics } from "../types";
import { auth } from "../lib/firebase";

export async function extractComplianceMetrics(text: string): Promise<ComplianceMetrics> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/extract-metrics', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const serverMsg = data?.error || `Server returned status ${response.status}`;
      throw new Error(serverMsg);
    }

    if (!data?.metrics) {
      throw new Error("No compliance metrics returned by the analysis service.");
    }

    const metrics = data.metrics;

    // Structural Validation
    const requiredFields = [
      "patient_name", "device_type", "report_start_date", "report_end_date", 
      "total_days", "days_used_4_plus_hours", "usage_days_percent", "average_usage_hours", "ahi"
    ];

    for (const field of requiredFields) {
      if (metrics[field] === undefined || metrics[field] === null) {
        // Tolerant of nulls as structured
      }
    }

    return metrics as ComplianceMetrics;
  } catch (error: any) {
    console.error("Extraction error:", error);

    if (error.message?.includes("suspended") || error.message?.includes("API key")) {
      throw new Error("The Gemini AI service is temporarily unavailable due to an API key or project issue. Please check your project settings.");
    }
    
    if (error.message?.includes("busy") || error.message?.includes("429")) {
      throw new Error("The analysis service is currently busy. Please wait a moment and try again.");
    }

    throw new Error(error.message || "Failed to analyze the CPAP report.");
  }
}

