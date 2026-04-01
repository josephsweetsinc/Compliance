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
      contents: `Extract CPAP compliance data from the following text. Return only JSON.
      Text: ${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            patient_name: { type: Type.STRING },
            start_date: { type: Type.STRING },
            end_date: { type: Type.STRING },
            total_nights: { type: Type.INTEGER },
            nights_over_4_hours: { type: Type.INTEGER },
            compliance_percentage: { type: Type.NUMBER },
            average_usage_hours: { type: Type.NUMBER },
            ahi: { type: Type.NUMBER },
          },
          required: [
            "patient_name",
            "start_date",
            "end_date",
            "total_nights",
            "nights_over_4_hours",
            "compliance_percentage",
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
      throw new Error("Failed to parse the clinical data. The report format might be unsupported or the file might be corrupted.");
    }

    // Structural Validation
    const requiredFields = [
      "patient_name", "start_date", "end_date", "total_nights", 
      "nights_over_4_hours", "compliance_percentage", "average_usage_hours", "ahi"
    ];

    for (const field of requiredFields) {
      if (metrics[field] === undefined || metrics[field] === null) {
        throw new Error(`The clinical analysis is missing a required field: ${field}. The report might be missing critical compliance data.`);
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
