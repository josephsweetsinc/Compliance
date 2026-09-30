import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ErrorCategory, ErrorLog } from '../types';

// In-memory rate limiting and deduplication window (15 seconds)
const recentErrorCache = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 15000;

export interface LogErrorParams {
  errorType: ErrorCategory;
  message: string;
  apiEndpoint?: string;
  status?: number;
  error?: unknown;
  context?: Record<string, any>;
  componentStack?: string;
}

/**
 * Sanitizes context metadata to prevent logging any Protected Health Information (PHI)
 * or sensitive credentials like tokens and passwords.
 */
function sanitizeContext(rawContext?: Record<string, any>): Record<string, any> {
  if (!rawContext || typeof rawContext !== 'object') return {};

  const sanitized: Record<string, any> = {};
  const sensitiveKeys = [
    'patientname', 'patient_name', 'drivername', 'driver_name',
    'dob', 'ssn', 'licensenumber', 'license_number', 'password',
    'token', 'authorization', 'secret', 'card', 'cvv'
  ];

  for (const [key, val] of Object.entries(rawContext)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(s => lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = '[REDACTED_FOR_PRIVACY]';
    } else if (typeof val === 'string') {
      // Truncate strings to prevent massive database payloads
      sanitized[key] = val.length > 500 ? `${val.substring(0, 500)}...[TRUNCATED]` : val;
    } else if (typeof val === 'number' || typeof val === 'boolean' || val === null) {
      sanitized[key] = val;
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = sanitizeContext(val);
    } else {
      sanitized[key] = String(val).substring(0, 200);
    }
  }

  return sanitized;
}

/**
 * Creates and logs a diagnostic record of an API, rendering, or runtime failure to
 * the dedicated 'error_logs' Firestore collection.
 */
export async function logErrorToFirestore(params: LogErrorParams): Promise<string> {
  const {
    errorType,
    message,
    apiEndpoint,
    status,
    error,
    context = {},
    componentStack,
  } = params;

  // Generate deduplication fingerprint
  const fingerprint = `${errorType}:${apiEndpoint || 'none'}:${message.substring(0, 100)}`;
  const now = Date.now();
  const lastLogged = recentErrorCache.get(fingerprint);

  if (lastLogged && now - lastLogged < DEDUPLICATION_WINDOW_MS) {
    // Return existing synthetic reference ID to avoid spamming the database
    return `err_cached_${lastLogged.toString(36)}`;
  }
  recentErrorCache.set(fingerprint, now);

  // Clean stale cache items periodically
  if (recentErrorCache.size > 100) {
    for (const [key, timestamp] of recentErrorCache.entries()) {
      if (now - timestamp > DEDUPLICATION_WINDOW_MS) {
        recentErrorCache.delete(key);
      }
    }
  }

  const logId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Extract stack trace safely
  let errorName = 'Error';
  let stack = '';
  if (error instanceof Error) {
    errorName = error.name || 'Error';
    stack = (error.stack || '').split('\n').slice(0, 10).join('\n');
  } else if (typeof error === 'string') {
    stack = error;
  }

  if (componentStack) {
    stack = `${stack}\nComponent Stack:\n${componentStack}`.trim();
  }

  const currentUser = auth.currentUser;
  const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : 'unknown';
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 300) : 'unknown';

  const cleanContext = sanitizeContext({
    ...context,
    pathname: currentPath,
    timestamp: new Date().toISOString(),
  });

  const errorRecord: ErrorLog = {
    id: logId,
    errorType,
    message: (message || 'Unknown application error').substring(0, 1500),
    createdAt: new Date().toISOString(),
    apiEndpoint: apiEndpoint ? apiEndpoint.substring(0, 300) : undefined,
    status: typeof status === 'number' ? status : undefined,
    errorName: errorName.substring(0, 100),
    stack: stack ? stack.substring(0, 4500) : undefined,
    userId: currentUser?.uid || null,
    userEmail: currentUser?.email || null,
    url: currentPath.substring(0, 300),
    userAgent,
    context: cleanContext,
  };

  // Log locally in development for debugging
  console.warn(`[ComplyZzz ErrorLog ${logId}] [${errorType}] ${apiEndpoint || ''} ${message}`, {
    status,
    record: errorRecord,
  });

  // Attempt 1: Direct Client Firestore write
  try {
    const logDocRef = doc(db, 'error_logs', logId);
    await setDoc(logDocRef, errorRecord);
    return logId;
  } catch (firestoreErr: any) {
    console.warn('[ErrorLogger] Direct Firestore write notice, dispatching to server fallback:', firestoreErr?.message || firestoreErr);
  }

  // Attempt 2: Server-side proxy fallback (/api/log-error) using Firebase Admin
  try {
    const idToken = await currentUser?.getIdToken().catch(() => null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

    await fetch('/api/log-error', {
      method: 'POST',
      headers,
      body: JSON.stringify(errorRecord),
    });
    return logId;
  } catch (fallbackErr) {
    console.error('[ErrorLogger] Server fallback error logging also failed:', fallbackErr);
  }

  return logId;
}

/**
 * Structured API Error class representing failures during fetch or backend service interactions.
 */
export class ApiError extends Error {
  public status: number;
  public apiEndpoint: string;
  public logId?: string;
  public details?: any;
  public isApiError = true;

  constructor(message: string, status: number, apiEndpoint: string, details?: any, logId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.apiEndpoint = apiEndpoint;
    this.details = details;
    this.logId = logId;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Provides patient-safe, user-friendly diagnostic guidance based on HTTP status codes
   */
  public getResolutionHint(): string {
    if (this.status === 401) {
      return 'Your clinical authentication session may have expired. Please sign in again.';
    }
    if (this.status === 402) {
      return 'Your account is out of report credits. Please visit the Billing page to recharge.';
    }
    if (this.status === 403) {
      return 'You do not have administrative permission to perform this medical action.';
    }
    if (this.status === 404) {
      return 'The requested resource or report record could not be found.';
    }
    if (this.status === 429) {
      return 'The compliance analysis service is currently handling high volume. Please wait a few seconds and try again.';
    }
    if (this.status >= 500) {
      return 'A temporary service interruption occurred on the secure backend. Our team has been notified via the audit log.';
    }
    return 'An unexpected issue occurred while processing this request.';
  }
}
