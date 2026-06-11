import { useState } from 'react';
import { loginWithGoogle } from '../lib/firebase';
import { Activity, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="flex justify-center mb-6">
          <img
            src="/src/assets/images/complyzzz_logo_1781018719318.png"
            alt="ComplyZzz Logo"
            className="w-20 h-20 object-contain rounded-2xl shadow-lg border border-slate-100"
            referrerPolicy="no-referrer"
          />
        </div>
        
        <h1 className="text-3xl font-extrabold text-slate-950 text-center mb-1">ComplyZzz</h1>
        <p className="text-slate-500 text-center mb-8 font-medium">CPAP Compliance Verification Portal</p>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          <span>{loading ? 'Signing in...' : 'Sign in with Google'}</span>
        </button>

        <div className="mt-8 pt-8 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-2">Privacy & Security Gate</p>
          <p className="text-sm text-slate-500">Your CPAP report is analysed temporarily and deleted in 15 minutes for security.</p>
        </div>
      </div>
    </div>
  );
}
