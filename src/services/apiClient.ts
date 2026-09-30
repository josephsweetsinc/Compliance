import { auth } from '../lib/firebase';
import { ApiError, logErrorToFirestore } from './errorLoggingService';

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  skipErrorLogging?: boolean;
}

/**
 * Robust fetch wrapper that guarantees auth header injection, error interception,
 * and automatic logging of all API failures to the Firestore 'error_logs' collection.
 */
export async function apiFetch<T = any>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const { timeoutMs = 30000, skipErrorLogging = false, headers: rawHeaders, ...fetchInit } = options;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(rawHeaders as Record<string, string> || {}),
  };

  // Only set default application/json content-type if not sending FormData
  if (!(fetchInit.body instanceof FormData) && !headers['Content-Type'] && fetchInit.method && fetchInit.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  // Inject Firebase Auth Bearer token if user is signed in
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (tokenErr) {
      console.warn('[apiClient] Could not fetch current user token:', tokenErr);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();

  try {
    const response = await fetch(endpoint, {
      ...fetchInit,
      headers,
      signal: fetchInit.signal || controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // Handle HTTP non-2xx responses
    if (!response.ok) {
      let parsedErrorData: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        parsedErrorData = JSON.parse(rawText);
      } catch {
        // Not JSON
      }

      const errorMessage = 
        parsedErrorData?.error || 
        parsedErrorData?.message || 
        (rawText && rawText.length < 200 ? rawText : `API request failed with HTTP ${response.status} (${response.statusText})`);

      let logId: string | undefined;
      if (!skipErrorLogging) {
        logId = await logErrorToFirestore({
          errorType: 'API_FAILURE',
          message: errorMessage,
          apiEndpoint: endpoint,
          status: response.status,
          context: {
            method: fetchInit.method || 'GET',
            statusText: response.statusText,
            durationMs,
            errorDetails: parsedErrorData,
          },
        });
      }

      const apiError = new ApiError(
        errorMessage,
        response.status,
        endpoint,
        parsedErrorData,
        logId
      );

      // Dispatch global event for error boundaries or toasts
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('complyzzz:api-error', { detail: apiError }));
      }

      throw apiError;
    }

    // Success response
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;

  } catch (error: any) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // If it's already an ApiError, rethrow directly
    if (error instanceof ApiError) {
      throw error;
    }

    const isAbort = error.name === 'AbortError';
    const message = isAbort 
      ? `API request to ${endpoint} timed out after ${timeoutMs / 1000}s` 
      : (error.message || 'Network error occurred during API request');

    let logId: string | undefined;
    if (!skipErrorLogging) {
      logId = await logErrorToFirestore({
        errorType: isAbort ? 'API_FAILURE' : 'NETWORK_ERROR',
        message,
        apiEndpoint: endpoint,
        status: isAbort ? 408 : 0,
        error,
        context: {
          method: fetchInit.method || 'GET',
          durationMs,
          isTimeout: isAbort,
        },
      });
    }

    const apiError = new ApiError(
      message,
      isAbort ? 408 : 0,
      endpoint,
      { originalError: error.message },
      logId
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('complyzzz:api-error', { detail: apiError }));
    }

    throw apiError;
  }
}
