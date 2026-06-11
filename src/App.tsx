import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, logout } from './lib/firebase';
import { UserProfile } from './types';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { LayoutDashboard, FileUp, History, LogOut, Activity, HelpCircle } from 'lucide-react';

// Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import ResultPage from './pages/ResultPage';
import HistoryPage from './pages/HistoryPage';
import HelpPage from './pages/HelpPage';
import Analytics from './components/Analytics';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as UserProfile);
        } else {
          // New user, will need to set up clinic name on first login
          // For now, we'll handle this in the login page or a setup page
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Router>
      <Analytics />
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
    </Router>
  );
}

function AuthenticatedApp({ user, profile, setProfile }: { user: User; profile: UserProfile | null; setProfile: (p: UserProfile) => void }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // If no profile, show a simple setup screen
  if (!profile) {
    return <ProfileSetup user={user} setProfile={setProfile} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-5 flex items-center gap-3 border-b border-slate-100">
          <img
            src="/src/assets/images/complyzzz_logo_1781018719318.png"
            alt="ComplyZzz Balloon Logo"
            className="w-10 h-10 object-contain rounded-xl shadow-md border border-slate-100 cursor-pointer"
            referrerPolicy="no-referrer"
            onClick={() => navigate('/dashboard')}
          />
          <span className="font-extrabold text-slate-950 text-xl tracking-tight cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate('/dashboard')}>ComplyZzz</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <SidebarLink to="/dashboard" icon={<LayoutDashboard size={20} />} label="Dashboard" />
          <SidebarLink to="/dashboard/upload" icon={<FileUp size={20} />} label="Upload Report" />
          <SidebarLink to="/dashboard/history" icon={<History size={20} />} label="Report History" />
          <SidebarLink to="/dashboard/help" icon={<HelpCircle size={20} />} label="Help & FAQ" />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="mb-4 px-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Operator Profile</p>
            <p className="text-sm font-medium text-slate-700 truncate">{profile.clinicName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-red-600 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8">
          <Routes>
            <Route path="/" element={<DashboardPage profile={profile} setProfile={setProfile} />} />
            <Route path="/upload" element={<UploadPage profile={profile} />} />
            <Route path="/report/:id" element={<ResultPage profile={profile} />} />
            <Route path="/history" element={<HistoryPage profile={profile} />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors font-medium"
    >
      {icon}
      <span>{label}</span>
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
    };
    await setDoc(doc(db, 'users', user.uid), newProfile);
    setProfile(newProfile);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="flex justify-center mb-6">
          <img
            src="/src/assets/images/complyzzz_logo_1781018719318.png"
            alt="ComplyZzz Logo"
            className="w-16 h-16 object-contain rounded-2xl shadow-md border border-slate-100"
            referrerPolicy="no-referrer"
          />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">ComplyZzz Setup</h1>
        <p className="text-slate-500 text-center text-sm mb-6">
          Welcome! Please enter your personal operator name, employer, or company name. This will register your profile and appear as the authority on generated compliance letters.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Company, Employer, or Personal Representative</label>
            <input
              type="text"
              required
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="e.g. Independent Driver, Falcon Air, or Self"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Setting up...' : 'Complete Profile Setup'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
