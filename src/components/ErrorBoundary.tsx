import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  fallback?: ReactNode;
  renderFallback?: (error: Error, reset: () => void) => ReactNode;
  onReset?: () => void;
  resetKeys?: any[];
  id?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught a rendering error:', error, errorInfo);
    this.setState({ errorInfo });
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
      showDetails: false,
    });
  };

  private handleGoHome = () => {
    this.resetError();
    if (window.location.pathname.startsWith('/dashboard')) {
      window.location.href = '/dashboard';
    } else {
      window.location.href = '/';
    }
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const { fallback, renderFallback, fallbackTitle, fallbackMessage, id = 'app-error-boundary-fallback' } = this.props;
      const { error, errorInfo, showDetails } = this.state;

      if (renderFallback && error) {
        return renderFallback(error, this.resetError);
      }

      if (fallback) {
        return fallback;
      }

      return (
        <div
          id={id}
          className="w-full min-h-[380px] my-6 flex items-center justify-center p-6 text-slate-800 dark:text-slate-100"
        >
          <div className="max-w-xl w-full bg-white dark:bg-[#0f172a] rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl transition-all">
            {/* Header / Icon */}
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {fallbackTitle || 'Rendering Error Encountered'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {fallbackMessage ||
                    'A display issue occurred while rendering this section. Your records and data remain completely safe.'}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2 pb-4 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={this.resetError}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Home size={16} />
                <span>Return to Dashboard</span>
              </button>

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
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <span>Technical details</span>
                  {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showDetails && (
                  <div className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 font-mono text-xs text-rose-600 dark:text-rose-400 overflow-x-auto max-h-48">
                    <p className="font-bold">{error.name}: {error.message}</p>
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
