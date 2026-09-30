import React, { Component, ErrorInfo, ReactNode } from 'react';
import { 
  AlertTriangle, 
  RefreshCw, 
  Home, 
  ChevronDown, 
  ChevronUp, 
  Server, 
  WifiOff, 
  ShieldAlert, 
  Copy, 
  Check, 
  CreditCard 
} from 'lucide-react';
import { logErrorToFirestore, ApiError } from '../services/errorLoggingService';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  fallback?: ReactNode;
  renderFallback?: (error: Error, reset: () => void, logId?: string) => ReactNode;
  onReset?: () => void;
  resetKeys?: any[];
  id?: string;
  isGlobal?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: (Error & { status?: number; apiEndpoint?: string; logId?: string }) | null;
  errorInfo: ErrorInfo | null;
  logId: string | null;
  showDetails: boolean;
  copiedId: boolean;
  isLogging: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    logId: null,
    showDetails: false,
    copiedId: false,
    isLogging: false,
  };

  private unhandledRejectionHandler?: (event: PromiseRejectionEvent) => void;
  private windowErrorHandler?: (event: ErrorEvent) => void;

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidMount() {
    // Top-level global error boundary monitors unhandled rejections and window errors
    if (this.props.isGlobal) {
      this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        console.warn('[GlobalErrorBoundary] Unhandled promise rejection caught:', reason);

        const isApi = reason instanceof ApiError || (reason && typeof reason === 'object' && 'isApiError' in reason);
        const message = reason instanceof Error ? reason.message : String(reason);
        const endpoint = isApi ? (reason as ApiError).apiEndpoint : undefined;
        const status = isApi ? (reason as ApiError).status : undefined;

        logErrorToFirestore({
          errorType: isApi ? 'API_FAILURE' : 'UNHANDLED_REJECTION',
          message: `Unhandled rejection: ${message}`,
          apiEndpoint: endpoint,
          status,
          error: reason,
          context: {
            reasonType: typeof reason,
          },
        }).catch(() => {});
      };

      this.windowErrorHandler = (event: ErrorEvent) => {
        console.warn('[GlobalErrorBoundary] Uncaught window error:', event.message);

        logErrorToFirestore({
          errorType: 'RENDER_ERROR',
          message: `Uncaught window error: ${event.message}`,
          error: event.error || event.message,
          context: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
          },
        }).catch(() => {});
      };

      window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
      window.addEventListener('error', this.windowErrorHandler);
    }
  }

  public componentWillUnmount() {
    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
    }
    if (this.windowErrorHandler) {
      window.removeEventListener('error', this.windowErrorHandler);
    }
  }

  public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
    this.setState({ errorInfo, isLogging: true });

    const isApi = error instanceof ApiError || ('status' in error && 'apiEndpoint' in error);
    const apiError = isApi ? (error as ApiError) : undefined;

    try {
      const generatedId = await logErrorToFirestore({
        errorType: isApi ? 'API_FAILURE' : 'RENDER_ERROR',
        message: error.message || 'React rendering error',
        apiEndpoint: apiError?.apiEndpoint,
        status: apiError?.status,
        error,
        componentStack: errorInfo.componentStack || undefined,
        context: {
          boundaryId: this.props.id || 'default_boundary',
          isGlobal: !!this.props.isGlobal,
        },
      });

      this.setState({ logId: generatedId, isLogging: false });
    } catch (loggingErr) {
      console.warn('[ErrorBoundary] Logging to Firestore encountered notice:', loggingErr);
      this.setState({ isLogging: false });
    }
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, i) => !prevProps.resetKeys || key !== prevProps.resetKeys[i]
      );
      if (hasChanged) {
        this.resetError();
      }
    }
  }

  public resetError = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      logId: null,
      showDetails: false,
      copiedId: false,
      isLogging: false,
    });
  };

  private handleGoHome = () => {
    this.resetError();
    if (typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/dashboard')) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/';
      }
    }
  };

  private handleGoBilling = () => {
    this.resetError();
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard/billing';
    }
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  private copyLogId = () => {
    const idToCopy = this.state.logId || this.state.error?.logId || 'UNKNOWN_ID';
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(idToCopy);
      this.setState({ copiedId: true });
      setTimeout(() => this.setState({ copiedId: false }), 2000);
    }
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const { 
        fallback, 
        renderFallback, 
        fallbackTitle, 
        fallbackMessage, 
        id = 'app-error-boundary-fallback' 
      } = this.props;
      const { error, errorInfo, logId, showDetails, copiedId, isLogging } = this.state;

      const activeLogId = logId || error?.logId;

      if (renderFallback && error) {
        return renderFallback(error, this.resetError, activeLogId || undefined);
      }

      if (fallback) {
        return fallback;
      }

      // Categorize the error for intelligent user-facing remedies
      const isApi = error instanceof ApiError || (error && 'apiEndpoint' in error);
      const isOffline = !navigator.onLine || error?.message?.toLowerCase().includes('network') || error?.message?.toLowerCase().includes('offline');
      const isQuotaOrCredit = error?.status === 402 || error?.message?.toLowerCase().includes('credit') || error?.message?.toLowerCase().includes('quota');
      const isAuth = error?.status === 401 || error?.status === 403 || error?.message?.toLowerCase().includes('permission') || error?.message?.toLowerCase().includes('unauthorized');

      let categoryBadge = 'Application Display Notice';
      let BadgeIcon = AlertTriangle;
      let badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800';

      if (isQuotaOrCredit) {
        categoryBadge = 'Credits / Billing Notice';
        BadgeIcon = CreditCard;
        badgeColor = 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      } else if (isApi) {
        categoryBadge = `API Service Failure (${error?.status || '500'})`;
        BadgeIcon = Server;
        badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      } else if (isOffline) {
        categoryBadge = 'Network Connection Interrupted';
        BadgeIcon = WifiOff;
        badgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      } else if (isAuth) {
        categoryBadge = 'Security / Authentication Required';
        BadgeIcon = ShieldAlert;
        badgeColor = 'bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      }

      const displayTitle = fallbackTitle || (
        isQuotaOrCredit ? 'Report Credits Required' :
        isApi ? 'Service Communication Interruption' :
        isOffline ? 'Network Connection Lost' :
        'Display Notice Encountered'
      );

      const displayMessage = fallbackMessage || (
        isQuotaOrCredit ? 'Your clinic has used all available compliance report processing credits. Please top up to proceed.' :
        isApi ? (error instanceof ApiError ? error.getResolutionHint() : 'The secure clinical processing service encountered a temporary response failure. This event has been saved to the diagnostic audit log.') :
        isOffline ? 'Your internet connection appears to be offline. Reconnecting will allow data processing to resume immediately.' :
        'A display issue occurred while rendering this section. All driver records and compliance evaluations remain completely intact.'
      );

      return (
        <div
          id={id}
          className="w-full min-h-[380px] my-6 flex items-center justify-center p-4 sm:p-6 text-slate-800 dark:text-slate-100"
        >
          <div className="max-w-xl w-full bg-white dark:bg-[#0f172a] rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl transition-all">
            
            {/* Category Pill */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badgeColor}`}>
                <BadgeIcon size={13} />
                <span>{categoryBadge}</span>
              </span>

              {activeLogId && (
                <button
                  type="button"
                  onClick={this.copyLogId}
                  title="Copy Reference ID for Clinical Support"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-mono transition-colors cursor-pointer py-1 px-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span>Ref: {activeLogId.substring(0, 16)}...</span>
                  {copiedId ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              )}
            </div>

            {/* Header / Icon */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {displayTitle}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {displayMessage}
                </p>
              </div>
            </div>

            {/* API Endpoint & Status Bar if applicable */}
            {error?.apiEndpoint && (
              <div className="mb-5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono flex items-center justify-between text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2 truncate">
                  <Server size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate">{error.apiEndpoint}</span>
                </div>
                {error.status && (
                  <span className="shrink-0 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    HTTP {error.status}
                  </span>
                )}
              </div>
            )}

            {/* Audit Log Confirmation Status */}
            <div className="mb-5 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <span>
                {isLogging ? 'Transmitting diagnostic record to audit log...' : 'Diagnostic report recorded in secure Firestore error_logs.'}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={this.resetError}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>Try Again</span>
              </button>

              {isQuotaOrCredit ? (
                <button
                  type="button"
                  onClick={this.handleGoBilling}
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  <CreditCard size={16} />
                  <span>Recharge Credits</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <Home size={16} />
                  <span>Dashboard</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium transition-colors cursor-pointer py-2"
              >
                Reload Page
              </button>
            </div>

            {/* Collapsible Error Debug Details */}
            {error && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={this.toggleDetails}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer py-1"
                >
                  <span>Root-cause technical details</span>
                  {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showDetails && (
                  <div className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 font-mono text-xs text-rose-600 dark:text-rose-400 overflow-x-auto max-h-56">
                    <p className="font-bold">{error.name || 'Error'}: {error.message}</p>
                    {error.status && <p className="text-slate-500 dark:text-slate-400 mt-1">Status Code: {error.status}</p>}
                    {error.apiEndpoint && <p className="text-slate-500 dark:text-slate-400">Endpoint: {error.apiEndpoint}</p>}
                    {activeLogId && <p className="text-slate-500 dark:text-slate-400">Log Record ID: {activeLogId}</p>}
                    {errorInfo && errorInfo.componentStack && (
                      <pre className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-tight">
                        {errorInfo.componentStack.trim()}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
