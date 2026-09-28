import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } from '../lib/firebase';
import { Mail, Lock, User, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, KeyRound, Sparkles, ArrowLeft, Loader2 } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { BrandLogo } from '../components/BrandLogo';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExistingEmail, setIsExistingEmail] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('mode') === 'signup') {
      setMode('signup');
    }
  }, [searchParams]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
      // Auth state listener in App.tsx will navigate to /dashboard
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        const rawMsg = (err.message || '').toLowerCase();
        if (rawMsg.includes('consumer_suspended') || rawMsg.includes('has been suspended')) {
          setError('Google Cloud project is suspended. Please check Google Cloud Console.');
        } else {
          setError(err.message || 'Failed to sign in with Google');
        }
      }
      setGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        await loginWithEmail(email, password);
      } else if (mode === 'signup') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await registerWithEmail(email, password, displayName || 'Operator');
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          throw new Error('Please enter your email address to receive password reset instructions.');
        }
        await resetPassword(email);
        setSuccessMessage(`Password reset link sent to ${email.trim()}. Please check your inbox.`);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      let msg = err.message || 'Authentication failed.';
      const rawMsg = (err.message || '').toLowerCase();
      if (rawMsg.includes('consumer_suspended') || rawMsg.includes('has been suspended')) {
        msg = 'Google Cloud project is suspended. Please check Google Cloud Console.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || rawMsg.includes('invalid-credential') || rawMsg.includes('user-not-found') || rawMsg.includes('wrong-password')) {
        msg = 'Invalid email or password. Please verify your credentials or create an account.';
      } else if (err.code === 'auth/email-already-in-use' || rawMsg.includes('email-already-in-use') || rawMsg.includes('email already in use')) {
        msg = 'An account with this email already exists. You can sign in directly or reset your password.';
        setIsExistingEmail(true);
      } else if (err.code === 'auth/invalid-email' || rawMsg.includes('invalid-email')) {
        msg = 'Please enter a valid email address.';
      } else if (err.code === 'auth/weak-password' || rawMsg.includes('weak-password')) {
        msg = 'Password is too weak. Please use at least 6 characters with letters and numbers.';
      }
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0b0f19] p-4 text-slate-900 dark:text-slate-100 relative transition-colors duration-200">
      <div className="absolute top-6 left-6 flex items-center gap-4">
        <Link 
          to="/" 
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors bg-white dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <ArrowLeft size={14} />
          <span>Back to Home</span>
        </Link>
      </div>

      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="max-w-md w-full bg-white dark:bg-[#0f172a] rounded-2xl shadow-xl p-8 border border-slate-100 dark:border-slate-800/60 my-10">
        {/* Header Branding */}
        <div className="flex justify-center mb-5">
          <Link to="/">
            <BrandLogo size="lg" className="hover:scale-105 transition-transform" id="login-brand-logo" />
          </Link>
        </div>
        
        <h1 className="text-2xl font-black text-slate-950 dark:text-white text-center tracking-tight">ComplyZzz</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-6 font-medium">
          {mode === 'signup' 
            ? 'Create your account for DOT/FAA CPAP compliance auditing' 
            : mode === 'forgot'
            ? 'Reset your password'
            : 'Sign in to your CPAP compliance portal'}
        </p>

        {/* Tab Selector: Sign In vs Create Account */}
        {mode !== 'forgot' && (
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl mb-6 border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); setIsExistingEmail(false); setSuccessMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); setIsExistingEmail(false); setSuccessMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Alert Notifications */}
        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
            </div>
            {(isExistingEmail || error.includes('already exists')) && mode === 'signup' && (
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setIsExistingEmail(false);
                }}
                className="self-start mt-0.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <span>Switch to Sign In &rarr;</span>
              </button>
            )}
          </div>
        )}

        {successMessage && (
          <div className="mb-5 p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Google 1-Click Sign-In Option */}
        {mode !== 'forgot' && (
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 cursor-pointer text-xs"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              ) : (
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
              )}
              <span>{mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}</span>
            </button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-wider font-semibold">
                <span className="bg-white dark:bg-[#0f172a] px-3 text-slate-400 dark:text-slate-500">
                  Or use any email
                </span>
              </div>
            </div>
          </>
        )}

        {/* Email & Password Authentication Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Email Address (Yahoo, Outlook, Work, etc.)
            </label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="driver@company.com or name@yahoo.com"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); }}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 py-2 text-xs border border-slate-200 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer text-xs mt-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'signup' ? (
              <>
                <span>Create Free Account</span>
                <ArrowRight size={14} />
              </>
            ) : mode === 'forgot' ? (
              <>
                <KeyRound size={14} />
                <span>Send Reset Link</span>
              </>
            ) : (
              <>
                <span>Sign In with Email</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Back to sign in if in forgot password mode */}
        {mode === 'forgot' && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); setSuccessMessage(null); }}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        )}

        {/* Security & HIPAA notice */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/60 text-center">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold mb-1">
            Privacy & Security Gate
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
            Your CPAP compliance reports are processed securely using encrypted HIPAA-compliant data practices.
          </p>
        </div>
      </div>
    </div>
  );
}


