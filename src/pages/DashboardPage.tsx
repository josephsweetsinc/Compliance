import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, ComplianceReport } from '../types';
import { Link } from 'react-router-dom';
import { FileUp, History, CheckCircle, XCircle, Clock, ChevronRight, Mail, Settings, ShieldCheck, Loader2, CreditCard, Coins, Building2, Zap } from 'lucide-react';
import { formatDate } from '../lib/utils';

export default function DashboardPage({ profile, setProfile }: { profile: UserProfile; setProfile: (p: UserProfile) => void }) {
  const [recentReports, setRecentReports] = useState<ComplianceReport[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Settings saving status states
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'reports'),
      where('clinicId', '==', profile.uid),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ComplianceReport));
      setRecentReports(reports);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile.uid]);

  const toggleAutoEmail = async (enabled: boolean) => {
    setSavingSettings(true);
    setSettingsSuccess(false);
    setSettingsError(null);
    try {
      const userDocRef = doc(db, 'users', profile.uid);
      await updateDoc(userDocRef, {
        autoEmailEnabled: enabled
      });
      
      // Update the local context/profile state so rest of the app reacts instantly
      setProfile({
        ...profile,
        autoEmailEnabled: enabled
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error updating notification details:', err);
      setSettingsError(err.message || 'Failed to update preferences');
    } finally {
      setSavingSettings(false);
    }
  };

  const stats = {
    total: recentReports.length,
    compliant: recentReports.filter(r => r.status === 'Compliant').length,
    nonCompliant: recentReports.filter(r => r.status === 'Non-Compliant').length,
  };

  const isSuperAdmin = (auth.currentUser?.email || profile.email || '').toLowerCase().trim() === 'josephsweetsinc@gmail.com';

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Welcome back, {profile.displayName || 'Operator'}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          {isSuperAdmin && (
            <Link
              to="/dashboard/admin"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-5 rounded-xl transition-all shadow-md shadow-purple-600/20 cursor-pointer min-h-[44px]"
            >
              <ShieldCheck size={18} />
              <span>Admin Panel</span>
            </Link>
          )}
          <Link
            to="/dashboard/upload"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-md shadow-blue-500/20 cursor-pointer min-h-[44px]"
          >
            <FileUp size={20} />
            <span>Upload New Report</span>
          </Link>
        </div>
      </header>

      {/* Super Admin Access Banner */}
      {isSuperAdmin && (
        <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-white p-4 sm:p-5 rounded-2xl border border-purple-500/40 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="font-extrabold text-sm sm:text-base text-white flex items-center gap-2">
                <span>Super Administrator Access</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase">Active</span>
              </p>
              <p className="text-xs text-purple-200/90 mt-0.5">
                Logged in as <strong>{auth.currentUser?.email || profile.email}</strong>. You have full access to manage all users, credits, and reports.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/admin"
            className="w-full sm:w-auto px-4 py-2.5 bg-white text-purple-900 hover:bg-purple-50 active:scale-95 text-xs font-black rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0"
          >
            <span>Open User Management</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatCard
          icon={<History className="text-blue-600 dark:text-blue-400" />}
          label="Recent Reports"
          value={(stats.total ?? 0).toString()}
          bgColor="bg-blue-50 dark:bg-blue-950/30"
        />
        <StatCard
          icon={<CheckCircle className="text-emerald-600 dark:text-emerald-400" />}
          label="Compliant"
          value={(stats.compliant ?? 0).toString()}
          bgColor="bg-emerald-50 dark:bg-emerald-950/30"
        />
        <StatCard
          icon={<XCircle className="text-rose-600 dark:text-rose-400" />}
          label="Non-Compliant"
          value={(stats.nonCompliant ?? 0).toString()}
          bgColor="bg-rose-50 dark:bg-rose-950/30"
        />
        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-[#0f172a] p-4 sm:p-6 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm flex flex-col justify-between transition-colors duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold text-slate-500 dark:text-slate-400">Plan & Credits</span>
            <div className={`p-2.5 sm:p-3 rounded-xl ${profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active' ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400'}`}>
              {profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active' ? (
                <Building2 size={18} />
              ) : (
                <Coins size={18} />
              )}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active'
                ? 'Unlimited'
                : `${profile.reportCredits ?? 0} Credits`}
            </p>
            <Link
              to="/dashboard/billing"
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-flex items-center gap-1 min-h-[36px]"
            >
              {profile.subscriptionPlan === 'monthly_clinic' && profile.subscriptionStatus === 'active'
                ? 'Manage Plan ($250/mo)'
                : '+ Top Up ($9/ea or $250/mo)'}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Recent Activity */}
        <section className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm overflow-hidden transition-colors duration-200">
          <div className="p-4 sm:p-6 border-b border-slate-50 dark:border-slate-800/60 flex justify-between items-center">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">Recent Activity</h2>
            <Link to="/dashboard/history" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs sm:text-sm font-semibold flex items-center gap-1 py-1">
              View All <ChevronRight size={16} />
            </Link>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 dark:border-blue-400"></div>
            </div>
          ) : recentReports.length > 0 ? (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {recentReports.map((report) => (
                <Link
                  key={report.id}
                  to={`/dashboard/report/${report.id}`}
                  className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${report.status === 'Compliant' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'}`}>
                      {report.status === 'Compliant' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base truncate">{report.patientName}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock size={12} /> {formatDate(report.createdAt)}
                      </p>
                      {/* Mobile-only compliance pill */}
                      <div className="sm:hidden mt-1 flex items-center gap-2 text-xs">
                        <span className={`font-bold ${report.status === 'Compliant' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {report.metrics?.compliance_percentage ?? report.metrics?.usage_days_percent ?? 0}%
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">{report.metrics?.average_usage_hours ?? 0} hrs avg</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-6 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{report.metrics?.compliance_percentage ?? 0}% Compliance</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{report.metrics?.average_usage_hours ?? 0} hrs avg usage</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 dark:text-slate-600" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="mb-4 flex justify-center">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-full">
                  <FileUp className="text-slate-300 dark:text-slate-600" size={32} />
                </div>
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">No reports uploaded yet.</p>
              <Link to="/dashboard/upload" className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-semibold mt-2 inline-block">
                Upload your first report
              </Link>
            </div>
          )}
        </section>

        {/* Portal settings / Notification preferences */}
        <section className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm p-6" id="settings-preferences">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-850 pb-4 mb-6">
            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Notification Preferences</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">Configure administrative notifications for generated CPAP compliance letters</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-5 rounded-xl bg-slate-50 dark:bg-slate-850/40 border border-slate-100 dark:border-slate-800/60">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <Mail className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                <span className="font-semibold text-slate-800 dark:text-slate-200">Automated Operator Email Summary</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-355 leading-relaxed">
                When a new CPAP report is uploaded and successfully processed, automatically dispatch an analytical compliance scorecard summary directly to your registered operator email: <span className="font-semibold text-slate-705 dark:text-slate-200 underline">{profile.email}</span>.
              </p>
            </div>

            <div className="flex items-center gap-3 md:self-center self-end">
              {savingSettings && (
                <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Saving...
                </span>
              )}
              {settingsSuccess && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold animate-pulse">
                  <ShieldCheck size={14} /> Preference Saved
                </span>
              )}
              {settingsError && (
                <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {settingsError}
                </span>
              )}

              {/* Toggle Switch */}
              <button
                onClick={() => toggleAutoEmail(profile.autoEmailEnabled === false)}
                disabled={savingSettings}
                className={`relative z-0 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                  profile.autoEmailEnabled !== false ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
                type="button"
                id="toggle-auto-email"
                aria-checked={profile.autoEmailEnabled !== false}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    profile.autoEmailEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bgColor }: { icon: React.ReactNode; label: string; value: string; bgColor: string }) {
  const darkBg = bgColor === 'bg-blue-50' ? 'dark:bg-blue-950/30 dark:text-blue-400' : bgColor === 'bg-emerald-50' ? 'dark:bg-emerald-950/30' : 'dark:bg-rose-950/30';
  return (
    <div className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm flex items-center gap-4 transition-colors duration-200">
      <div className={`p-4 rounded-xl ${bgColor} ${darkBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
