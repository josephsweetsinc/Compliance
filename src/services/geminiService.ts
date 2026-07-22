import { ComplianceMetrics } from "../types";
import { auth } from "../lib/firebase";

export async function extractComplianceMetrics(text: string): Promise<ComplianceMetrics> {
  if (!auth.currentUser) {
    throw new Error("You must be signed in to analyze a report.");
  }

  const token = await auth.currentUser.getIdToken();

  const response = await fetch("/api/extract-metrics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Server responded with status code ${response.status}`);
  }

  return data.metrics as ComplianceMetrics;
}
