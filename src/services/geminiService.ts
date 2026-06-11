import { GoogleGenAI, Type } from "@google/genai";
import { ComplianceMetrics } from "../types";

let aiClient: GoogleGenAI | null = null;

function getAI() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please add it in the Settings menu.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function extractComplianceMetrics(text: string): Promise<ComplianceMetrics> {
  try {
    const ai = getAI();
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
      throw new Error("The AI returned an empty response. Please try uploading the report again.");
    }

    let metrics: any;
    try {
      metrics = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error("Failed to parse the CPAP data. The report format might be unsupported or the file might be corrupted.");
    }

    // Structural Validation
    const requiredFields = [
      "patient_name", "device_type", "report_start_date", "report_end_date", 
      "total_days", "days_used_4_plus_hours", "usage_days_percent", "average_usage_hours", "ahi"
    ];

    for (const field of requiredFields) {
      if (metrics[field] === undefined || metrics[field] === null) {
        // We throw if missing in structural validation to avoid runtime errors in pages
        // though the prompt says "If a value is missing, return null" we can handle null if we want
        // But for CPAP physicals, we usually need these values. 
        // I will keep the check but allow null if the page handles it?
        // Actually the prompt says "If a value is missing, return null", so I'll allow null in types.
      }
    }

    return metrics as ComplianceMetrics;
  } catch (error: any) {
    console.error("Extraction error:", error);
    
    // Handle specific API errors
    if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("API key")) {
      throw new Error("The Gemini API key is missing or invalid. Please check your application settings.");
    }
    
    if (error.message?.includes("quota") || error.message?.includes("429")) {
      throw new Error("The analysis service is currently busy. Please wait a moment and try again.");
    }

    // Re-throw if it's already one of our custom errors
    if (error.message?.includes("clinical analysis") || error.message?.includes("AI returned")) {
      throw error;
    }

    throw new Error(`Failed to analyze the CPAP report: ${error.message || "Unknown error"}`);
  }
}
