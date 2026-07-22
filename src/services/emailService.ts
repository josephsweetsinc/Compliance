import { ComplianceReport } from '../types';
import { auth } from '../lib/firebase';

/**
 * Service function to automatically email a summary notification to the user (operator)
 * via the backend Resend integration after a report is successfully processed.
 */
export async function sendSummaryNotificationToUser(
  report: ComplianceReport,
  userEmail: string
): Promise<{ success: boolean; error?: string }> {
  if (!userEmail) {
    console.warn('Cannot send user notification: No user email available.');
    return { success: false, error: 'User email is missing.' };
  }

  try {
    if (!auth.currentUser) {
      return { success: false, error: 'You must be signed in to send this email.' };
    }
    const token = await auth.currentUser.getIdToken();

    const response = await fetch('/api/send-user-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        email: userEmail,
        report,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to send automatic summary email.');
    }

    console.log(`Automatic summary email notification triggered successfully for ${userEmail}`);
    return { success: true };
  } catch (err: any) {
    console.error('Error in sendSummaryNotificationToUser service:', err);
    return { success: false, error: err.message || 'Unknown error' };
  }
}
