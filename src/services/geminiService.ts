import { ComplianceMetrics } from "../types";
import { auth } from "../lib/firebase";
import { parseCpapMetrics } from "./cpapParser";

export async function extractComplianceMetrics(text: string): Promise<ComplianceMetrics> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken().catch(() => null);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch('/api/extract-metrics', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });

    const data = await response.json().catch(() => null);

    if (response.ok && data?.metrics) {
      return data.metrics as ComplianceMetrics;
    }

    // If server responded with an error (e.g. 402 Prepayment credits or 429),
    // attempt local deterministic parser before failing the user's document
    const fallback = parseCpapMetrics(text);
    if (fallback) {
      console.warn("Extracted CPAP compliance metrics via client-side deterministic engine fallback.");
      return fallback;
    }

    const serverMsg = data?.error || `Server returned status ${response.status}`;
    const cleanMsg = serverMsg.toLowerCase();
    if (cleanMsg.includes("gemini") || cleanMsg.includes("api key") || cleanMsg.includes("prepayment") || cleanMsg.includes("billing") || cleanMsg.includes("402") || cleanMsg.includes("403")) {
      throw new Error("Unable to automatically extract compliance metrics from this document. Please ensure the CPAP report contains readable text.");
    }
    throw new Error(serverMsg);
  } catch (error: any) {
    // Attempt local deterministic parser if network error occurred
    const fallback = parseCpapMetrics(text);
    if (fallback) {
      console.warn("Recovered CPAP metrics via local deterministic engine after network disruption.");
      return fallback;
    }

    console.warn("Extraction notice:", error.message || error);

    const errStr = (error.message || '').toLowerCase();
    if (errStr.includes("suspended") || errStr.includes("api key") || errStr.includes("prepayment") || errStr.includes("gemini") || errStr.includes("billing") || errStr.includes("402") || errStr.includes("403")) {
      throw new Error("Unable to automatically extract compliance metrics from this document. Please ensure the CPAP report contains readable text, or try another file.");
    }
    
    if (errStr.includes("busy") || errStr.includes("429")) {
      throw new Error("The analysis service is currently busy. Please wait a moment and try again.");
    }

    throw new Error(error.message || "Failed to analyze the CPAP report.");
  }
}

