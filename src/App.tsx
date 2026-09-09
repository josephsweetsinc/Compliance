import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, logout } from './lib/firebase';
import { UserProfile } from './types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { LayoutDashboard, FileUp, History, LogOut, Activity, HelpCircle, CreditCard, Coins, Sparkles, Menu, X, ChevronRight } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import ResultPage from './pages/ResultPage';
import HistoryPage from './pages/HistoryPage';
import HelpPage from './pages/HelpPage';
import BillingPage from './pages/BillingPage';
import Analytics from './components/Analytics';
import { BrandLogo } from './components/BrandLogo';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Immediate early-theme detection
    const saved = localStorage.getItem('theme');
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && system)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const loadProfile = async (u: User) => {
    try {
      const docSnap = await getDoc(doc(db, 'users', u.uid));
      setProfile(docSnap.exists() ? (docSnap.data() as UserProfile) : null);
    } catch (err) {
      console.error('Error loading profile:', err);
      setProfile(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        await loadProfile(user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0b0f19]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  return (
    <Router>
      <Analytics />
      <ErrorBoundary id="root-app-error-boundary">
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/dashboard" />} />
          <Route
            path="/dashboard/*"
            element={
              user ? (
                <AuthenticatedApp user={user} profile={profile} setProfile={setProfile} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route path="/*" element={<Navigate to={user ? "/dashboard" : "/"} />} />
        </Routes>
      </ErrorBoundary>
    </Router>
  );
}

function AuthenticatedApp({ user, profile, setProfile }: { user: User; profile: UserProfile | null; setProfile: (p: UserProfile) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Automatically close mobile drawer whenever the route changes
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setMobileDrawerOpen(false);
    await logout();
    navigate('/');
  };

  // If no profile, show a simple setup screen
  if (!profile) {
    return <ProfileSetup user={user} setProfile={setProfile} />;
  }

  const isUnlimited = profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active';
  const credits = profile.reportCredits ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 flex flex-col md:flex-row transition-colors duration-200">
      {/* Mobile Top App Bar (Visible on < md screens) */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-4 py-2.5 flex items-center justify-between shadow-xs">
        <div 
          className="flex items-center gap-2.5 cursor-pointer select-none" 
          onClick={() => navigate('/dashboard')}
        >
          <BrandLogo size="sm" id="app-mobile-top-logo" />
          <span className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">ComplyZzz</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/billing"
            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            {isUnlimited ? (
              <span className="text-blue-600 dark:text-blue-400">Unlimited</span>
            ) : (
              <>
                <Coins size={12} className="text-blue-600 dark:text-blue-400" />
                <span>{credits} {credits === 1 ? 'Credit' : 'Credits'}</span>
              </>
            )}
          </Link>

          <ThemeToggle />

          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* Mobile Slide-Out Drawer Overlay */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex animate-in fade-in duration-200">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Sheet */}
          <div className="relative w-4/5 max-w-xs bg-white dark:bg-[#0f172a] h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-250 border-r border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
              <div 
                className="flex items-center gap-2.5 cursor-pointer" 
                onClick={() => { setMobileDrawerOpen(false); navigate('/dashboard'); }}
              >
                <BrandLogo size="sm" id="app-drawer-logo" />
                <span className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">ComplyZzz</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Operator info box */}
            <div className="p-4 mx-3 my-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Operator Profile</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">{profile.clinicName}</p>
              <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Balance:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {isUnlimited ? 'Unlimited Plan' : `${credits} ${credits === 1 ? 'Credit' : 'Credits'}`}
                </span>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
              <MobileDrawerLink 
                to="/dashboard" 
                icon={<LayoutDashboard size={20} />} 
                label="Dashboard" 
                active={location.pathname === '/dashboard'}
                onClick={() => setMobileDrawerOpen(false)}
              />
              <MobileDrawerLink 
                to="/dashboard/upload" 
                icon={<FileUp size={20} />} 
                label="Upload Report" 
                active={location.pathname === '/dashboard/upload'}
                onClick={() => setMobileDrawerOpen(false)}
              />
              <MobileDrawerLink 
                to="/dashboard/history" 
                icon={<History size={20} />} 
                label="Report History" 
                active={location.pathname === '/dashboard/history'}
                onClick={() => setMobileDrawerOpen(false)}
              />
              <MobileDrawerLink 
                to="/dashboard/billing" 
                icon={<CreditCard size={20} />} 
                label="Plans & Billing" 
                active={location.pathname === '/dashboard/billing'}
                onClick={() => setMobileDrawerOpen(false)}
                badge={
                  isUnlimited ? (
                    <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Unlimited
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                      {credits} {credits === 1 ? 'Credit' : 'Credits'}
                    </span>
                  )
                }
              />
              <MobileDrawerLink 
                to="/dashboard/help" 
                icon={<HelpCircle size={20} />} 
                label="Help & FAQ" 
                active={location.pathname === '/dashboard/help'}
                onClick={() => setMobileDrawerOpen(false)}
              />
            </nav>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800/60 space-y-3">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-semibold text-slate-500">Appearance</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer min-h-[44px]"
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
      <aside className="hidden md:flex md:w-64 bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-800/60 flex-col transition-colors duration-200 shrink-0">
        <div className="p-5 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800/60 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <BrandLogo size="md" id="app-sidebar-logo" />
          <span className="font-extrabold text-slate-950 dark:text-white text-xl tracking-tight hover:opacity-80 transition-opacity">ComplyZzz</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <SidebarLink to="/dashboard" icon={<LayoutDashboard size={20} />} label="Dashboard" />
          <SidebarLink to="/dashboard/upload" icon={<FileUp size={20} />} label="Upload Report" />
          <SidebarLink to="/dashboard/history" icon={<History size={20} />} label="Report History" />
          <SidebarLink 
            to="/dashboard/billing" 
            icon={<CreditCard size={20} />} 
            label="Plans & Billing"
            badge={
              isUnlimited ? (
                <span className="text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Unlimited
                </span>
              ) : (
                <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                  {credits} {credits === 1 ? 'Credit' : 'Credits'}
                </span>
              )
            }
          />
          <SidebarLink to="/dashboard/help" icon={<HelpCircle size={20} />} label="Help & FAQ" />
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800/60">
          <div className="mb-4 px-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Operator Profile</p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate" title={profile.clinicName}>{profile.clinicName}</p>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto min-w-0">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 pb-28 md:pb-8">
          <ErrorBoundary
            id="dashboard-routes-error-boundary"
            resetKeys={[location.pathname]}
            fallbackTitle="View or Report Display Error"
            fallbackMessage="An unexpected issue occurred while rendering this report or view. Your compliance records and data remain intact."
          >
            <Routes>
              <Route path="/" element={<DashboardPage profile={profile} setProfile={setProfile} />} />
              <Route path="/upload" element={<UploadPage profile={profile} setProfile={setProfile} />} />
              <Route path="/report/:id" element={<ResultPage profile={profile} />} />
              <Route path="/history" element={<HistoryPage profile={profile} />} />
              <Route path="/billing" element={<BillingPage profile={profile} setProfile={setProfile} />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (Visible only on < md screens) */}
      <nav 
        id="mobile-bottom-navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/90 py-1 px-2 flex justify-around items-center shadow-lg"
        aria-label="Mobile Navigation"
      >
        <MobileBottomItem
          to="/dashboard"
          icon={<LayoutDashboard size={20} />}
          label="Dashboard"
          active={location.pathname === '/dashboard'}
        />
        <MobileBottomItem
          to="/dashboard/upload"
          icon={<FileUp size={20} />}
          label="Upload"
          active={location.pathname === '/dashboard/upload'}
          isHighlight
        />
        <MobileBottomItem
          to="/dashboard/history"
          icon={<History size={20} />}
          label="History"
          active={location.pathname === '/dashboard/history'}
        />
        <MobileBottomItem
          to="/dashboard/billing"
          icon={<CreditCard size={20} />}
          label="Plans"
          active={location.pathname === '/dashboard/billing'}
        />
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center min-w-[56px] min-h-[44px] py-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 text-[10px] font-medium transition-colors cursor-pointer"
        >
          <Menu size={20} />
          <span className="mt-0.5">More</span>
        </button>
      </nav>
    </div>
  );
}

function MobileBottomItem({ 
  to, 
  icon, 
  label, 
  active, 
  isHighlight = false 
}: { 
  to: string; 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  isHighlight?: boolean;
}) {
  if (isHighlight) {
    return (
      <Link
        to={to}
        className="flex flex-col items-center justify-center -mt-4 min-w-[56px] min-h-[48px] py-1 transition-all group"
      >
        <div className={`p-2.5 rounded-full shadow-md transition-all ${
          active 
            ? 'bg-blue-600 text-white shadow-blue-500/30 ring-2 ring-blue-400/50 scale-105' 
            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
        }`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold mt-0.5 ${
          active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'
        }`}>
          {label}
        </span>
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className={`flex flex-col items-center justify-center min-w-[56px] min-h-[44px] py-1 text-[10px] font-medium transition-colors ${
        active 
          ? 'text-blue-600 dark:text-blue-400 font-bold' 
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      <div className={`p-1 rounded-lg transition-colors ${active ? 'bg-blue-50 dark:bg-blue-950/50' : ''}`}>
        {icon}
      </div>
      <span className="mt-0.5">{label}</span>
    </Link>
  );
}

function MobileDrawerLink({
  to,
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
        active
          ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge && <div>{badge}</div>}
    </Link>
  );
}

function SidebarLink({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors font-medium group"
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge && <div>{badge}</div>}
    </Link>
  );
}

function ProfileSetup({ user, setProfile }: { user: User; setProfile: (p: UserProfile) => void }) {
  const [clinicName, setClinicName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicName.trim()) return;
    setLoading(true);
    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: user.displayName || '',
      clinicName: clinicName.trim(),
      createdAt: new Date().toISOString(),
      reportCredits: 1, // 1 complimentary trial credit to try their first report
      subscriptionPlan: 'free',
      subscriptionStatus: 'trial',
    };
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setProfile(newProfile);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0b0f19] p-4 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-md w-full bg-white dark:bg-[#0f172a] rounded-2xl shadow-xl p-8 border border-slate-100 dark:border-slate-800/60 relative">
        <div className="absolute top-6 right-6">
          <ThemeToggle />
        </div>
        <div className="flex justify-center mb-6">
          <BrandLogo size="lg" id="profile-setup-logo" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-2">ComplyZzz Setup</h1>
        <p className="text-slate-500 dark:text-slate-450 text-center text-sm mb-6 leading-relaxed">
          Welcome! Please enter your personal operator name, employer, or company name. This will register your profile and appear as the authority on generated compliance letters.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Company, Employer, or Personal Representative</label>
            <input
              type="text"
              required
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-850 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder-slate-400"
              placeholder="e.g. Independent Driver, Falcon Air, or Self"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Setting up...' : 'Complete Profile Setup'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
