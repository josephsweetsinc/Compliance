import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import {
  ShieldCheck,
  Users,
  CreditCard,
  Coins,
  FileText,
  Search,
  Filter,
  RefreshCw,
  Trash2,
  Edit3,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  ArrowUpDown,
  UserX,
  Lock,
  Eye,
  Calendar,
  Activity,
  FileCheck,
  Building2,
  Inbox
} from 'lucide-react';
import { formatDate } from '../lib/utils';

export interface AdminReportData {
  id: string;
  clinicId: string;
  patientName: string;
  dob?: string;
  licenseNumber?: string;
  licenseState?: string;
  status: 'Compliant' | 'Non-Compliant';
  createdAt: string;
  metrics?: {
    device_type?: string;
    report_start_date?: string;
    report_end_date?: string;
    total_days?: number;
    days_used_4_plus_hours?: number;
    usage_days_percent?: number;
    average_usage_hours?: number;
    ahi?: number;
  };
}

export interface AdminUserData {
  uid: string;
  email: string;
  displayName: string;
  clinicName: string;
  createdAt: string;
  lastSignIn: string | null;
  reportCredits: number;
  subscriptionPlan: 'free' | 'per_report' | 'monthly_clinic';
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'canceled';
  reportsCount: number;
  isSuperAdmin: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

interface AdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalCredits: number;
  totalReports: number;
}

const SUPER_ADMIN_EMAIL = 'josephsweetsinc@gmail.com';

export default function AdminPage({ profile }: { profile: UserProfile }) {
  const [users, setUsers] = useState<AdminUserData[]>([]);
  const [reports, setReports] = useState<AdminReportData[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'reports'>('users');
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    activeSubscriptions: 0,
    totalCredits: 0,
    totalReports: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters and search for Users
  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'credits' | 'reports' | 'email'>('recent');

  // Filters and search for Reports
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState<'all' | 'Compliant' | 'Non-Compliant'>('all');
  const [reportSortBy, setReportSortBy] = useState<'recent' | 'compliance' | 'patient'>('recent');

  // Modal States
  const [deleteModalUser, setDeleteModalUser] = useState<AdminUserData | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const [deleteModalReport, setDeleteModalReport] = useState<AdminReportData | null>(null);
  const [isDeletingReport, setIsDeletingReport] = useState(false);

  const [editModalUser, setEditModalUser] = useState<AdminUserData | null>(null);
  const [editCredits, setEditCredits] = useState<number>(0);
  const [editPlan, setEditPlan] = useState<'free' | 'per_report' | 'monthly_clinic'>('free');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive' | 'trial' | 'canceled'>('inactive');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Copy feedback state
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const currentEmail = (auth.currentUser?.email || profile?.email || '').toLowerCase().trim();
  const isCurrentSuperAdmin = currentEmail === SUPER_ADMIN_EMAIL.toLowerCase();

  const isFetchingRef = useRef(false);

  const fetchUsers = async (isManualRefresh = false) => {
    if (isFetchingRef.current && !isManualRefresh) {
      return;
    }
    isFetchingRef.current = true;

    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    let loadedSuccessfully = false;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        // Wait until Firebase Auth user session resolves to prevent unauthenticated PERMISSION_DENIED errors
        return;
      }

      // 1. First attempt: call server admin API
      try {
        const idToken = await currentUser.getIdToken(true);
        const res = await fetch('/api/admin/users', {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (!data.clientFallback && Array.isArray(data.users) && data.users.length > 0) {
            const serverUsers: AdminUserData[] = data.users;
            setUsers(serverUsers);
            if (Array.isArray(data.reports)) {
              setReports(data.reports);
            }
            const statsToSet = (data.stats && data.stats.totalUsers > 0) ? data.stats : {
              totalUsers: serverUsers.length,
              activeSubscriptions: serverUsers.filter((u: any) => u.subscriptionPlan === 'monthly_clinic' && u.subscriptionStatus === 'active').length,
              totalCredits: serverUsers.reduce((sum: number, u: any) => sum + (u.reportCredits || 0), 0),
              totalReports: serverUsers.reduce((sum: number, u: any) => sum + (u.reportsCount || 0), 0),
            };
            setStats(statsToSet);
            setError(null);
            loadedSuccessfully = true;
            return;
          }
        }
      } catch (apiErr) {
        console.warn('[AdminPage] /api/admin/users request notice, falling back to direct Firestore:', apiErr);
      }

      // 2. Direct Firestore SDK fallback (Super Admin access allowed by firestore.rules)
      const usersSnap = await getDocs(collection(db, 'users')).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'users');
        throw err;
      });

      let reportsSnap: any = { size: 0, forEach: () => {} };
      try {
        reportsSnap = await getDocs(collection(db, 'reports'));
      } catch (repErr) {
        console.warn('[AdminPage] Direct reports aggregation notice:', repErr);
      }

      const reportCountsMap = new Map<string, number>();
      const clientReports: AdminReportData[] = [];
      reportsSnap.forEach((docSnap: any) => {
        const data = docSnap.data();
        const cid = data.clinicId || data.userId;
        if (cid) {
          reportCountsMap.set(cid, (reportCountsMap.get(cid) || 0) + 1);
        }
        clientReports.push({
          id: docSnap.id,
          clinicId: cid || '',
          patientName: data.patientName || 'Anonymous Patient',
          dob: data.dob || '',
          licenseNumber: data.licenseNumber || '',
          licenseState: data.licenseState || '',
          status: data.status || 'Non-Compliant',
          createdAt: data.createdAt || '',
          metrics: data.metrics || {},
        });
      });
      clientReports.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setReports(clientReports);

      const clientUsers: AdminUserData[] = [];
      usersSnap.forEach(docSnap => {
        const data = docSnap.data();
        const uid = docSnap.id;
        const email = data.email || 'No email';
        clientUsers.push({
          uid,
          email,
          displayName: data.displayName || '',
          clinicName: data.clinicName || 'Not Set',
          createdAt: data.createdAt || new Date().toISOString(),
          lastSignIn: null,
          reportCredits: typeof data.reportCredits === 'number' ? data.reportCredits : 0,
          subscriptionPlan: data.subscriptionPlan || 'free',
          subscriptionStatus: data.subscriptionStatus || 'inactive',
          reportsCount: reportCountsMap.get(uid) || 0,
          isSuperAdmin: email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase(),
          stripeCustomerId: data.stripeCustomerId || null,
          stripeSubscriptionId: data.stripeSubscriptionId || null,
        });
      });

      clientUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setUsers(clientUsers);
      setStats({
        totalUsers: clientUsers.length,
        activeSubscriptions: clientUsers.filter(u => u.subscriptionPlan === 'monthly_clinic' && u.subscriptionStatus === 'active').length,
        totalCredits: clientUsers.reduce((sum, u) => sum + (u.reportCredits || 0), 0),
        totalReports: reportsSnap.size || clientReports.length || 0,
      });
      setError(null);
      loadedSuccessfully = true;
    } catch (clientErr: any) {
      console.error('[AdminPage] Error loading users:', clientErr);
      if (!loadedSuccessfully) {
        let msg = clientErr?.message || 'An unexpected error occurred while loading users.';
        try {
          const parsed = JSON.parse(msg);
          if (parsed && parsed.error) {
            msg = parsed.error;
          }
        } catch {
          // not json
        }
        setError(msg);
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Listen to Firebase Auth state to trigger when user credentials resolve
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && isMounted) {
        fetchUsers();
      }
    });

    if (auth.currentUser) {
      fetchUsers();
    }

    const watchdogTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
        setRefreshing(false);
      }
    }, 5000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(watchdogTimer);
    };
  }, []);

  const showToast = (message: string) => {
    setSuccessToast(message);
    setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
  };

  const handleCopyUid = (uid: string) => {
    navigator.clipboard.writeText(uid);
    setCopiedUid(uid);
    setTimeout(() => setCopiedUid(null), 2000);
  };

  // Open Edit Modal
  const openEditModal = (targetUser: AdminUserData) => {
    setEditModalUser(targetUser);
    setEditCredits(targetUser.reportCredits ?? 0);
    setEditPlan(targetUser.subscriptionPlan || 'free');
    setEditStatus(targetUser.subscriptionStatus || 'inactive');
  };

  // Save Credit/Plan Adjustments
  const handleSaveEdit = async () => {
    if (!editModalUser) return;
    setIsSavingEdit(true);

    try {
      let updatedViaApi = false;
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/admin/users/${editModalUser.uid}/credits`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reportCredits: editCredits,
            subscriptionPlan: editPlan,
            subscriptionStatus: editStatus,
          })
        });

        if (res.ok) {
          updatedViaApi = true;
        }
      }

      // Direct Firestore SDK fallback if server API encounters issue
      if (!updatedViaApi) {
        await updateDoc(doc(db, 'users', editModalUser.uid), {
          reportCredits: editCredits,
          subscriptionPlan: editPlan,
          subscriptionStatus: editStatus,
        }).catch(err => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${editModalUser.uid}`);
          throw err;
        });
      }

      // Optimistically update local users state
      setUsers(prev => prev.map(u => {
        if (u.uid === editModalUser.uid) {
          return {
            ...u,
            reportCredits: editCredits,
            subscriptionPlan: editPlan,
            subscriptionStatus: editStatus
          };
        }
        return u;
      }));

      showToast(`Updated ${editModalUser.email} credits to ${editCredits} (${editPlan} / ${editStatus}).`);
      setEditModalUser(null);
    } catch (err: any) {
      showToast(`Update failed: ${err?.message || 'Could not save modifications'}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Quick delta button (+1, -1, +5)
  const handleQuickCreditAdjust = async (targetUser: AdminUserData, delta: number) => {
    const newCredits = Math.max(0, (targetUser.reportCredits ?? 0) + delta);
    try {
      let updatedViaApi = false;
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/admin/users/${targetUser.uid}/credits`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reportCredits: newCredits
          })
        });
        if (res.ok) updatedViaApi = true;
      }

      if (!updatedViaApi) {
        await updateDoc(doc(db, 'users', targetUser.uid), {
          reportCredits: newCredits
        }).catch(err => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
          throw err;
        });
      }

      setUsers(prev => prev.map(u => u.uid === targetUser.uid ? { ...u, reportCredits: newCredits } : u));
      showToast(`${delta > 0 ? `+${delta}` : delta} credits for ${targetUser.email} (Now: ${newCredits})`);
    } catch (err: any) {
      showToast(`Adjustment error: ${err?.message || 'Could not adjust credits'}`);
    }
  };

  // Permanently Delete User
  const handleDeleteUser = async () => {
    if (!deleteModalUser) return;
    setIsDeleting(true);

    try {
      let deletedViaApi = false;
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        const res = await fetch(`/api/admin/users/${deleteModalUser.uid}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) deletedViaApi = true;
      }

      if (!deletedViaApi) {
        await deleteDoc(doc(db, 'users', deleteModalUser.uid)).catch(err => {
          handleFirestoreError(err, OperationType.DELETE, `users/${deleteModalUser.uid}`);
          throw err;
        });
      }

      // Remove user from local state
      setUsers(prev => prev.filter(u => u.uid !== deleteModalUser.uid));
      setStats(prev => ({
        ...prev,
        totalUsers: Math.max(0, prev.totalUsers - 1),
        totalCredits: Math.max(0, prev.totalCredits - (deleteModalUser.reportCredits || 0)),
        totalReports: Math.max(0, prev.totalReports - (deleteModalUser.reportsCount || 0)),
      }));

      showToast(`User ${deleteModalUser.email} and all associated data were removed.`);
      setDeleteModalUser(null);
      setDeleteConfirmationText('');
    } catch (err: any) {
      showToast(`Failed to delete user: ${err?.message || 'Permission denied or network failure'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered & Sorted users list
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search match
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch = !query ||
        user.email.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query) ||
        user.clinicName.toLowerCase().includes(query) ||
        user.uid.toLowerCase().includes(query);

      // Plan match
      const matchesPlan = planFilter === 'all' || user.subscriptionPlan === planFilter;

      // Status match
      const matchesStatus = statusFilter === 'all' || user.subscriptionStatus === statusFilter;

      return matchesSearch && matchesPlan && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'credits') {
        return (b.reportCredits || 0) - (a.reportCredits || 0);
      }
      if (sortBy === 'reports') {
        return (b.reportsCount || 0) - (a.reportsCount || 0);
      }
      if (sortBy === 'email') {
        return a.email.localeCompare(b.email);
      }
      return 0;
    });
  }, [users, searchTerm, planFilter, statusFilter, sortBy]);

  // Map of users for quick clinic lookup
  const usersById = useMemo(() => {
    const map = new Map<string, AdminUserData>();
    users.forEach(u => map.set(u.uid, u));
    return map;
  }, [users]);

  // Filtered & Sorted reports list
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      const clinic = usersById.get(report.clinicId);
      const searchTarget = `${report.patientName || ''} ${report.id} ${report.metrics?.device_type || ''} ${clinic?.clinicName || ''} ${clinic?.email || ''}`.toLowerCase();
      const matchesSearch = !reportSearchTerm || searchTarget.includes(reportSearchTerm.toLowerCase().trim());
      const matchesStatus = reportStatusFilter === 'all' || report.status === reportStatusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => {
      if (reportSortBy === 'recent') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (reportSortBy === 'compliance') {
        const aVal = a.metrics?.usage_days_percent ?? (a.status === 'Compliant' ? 100 : 0);
        const bVal = b.metrics?.usage_days_percent ?? (b.status === 'Compliant' ? 100 : 0);
        return bVal - aVal;
      }
      if (reportSortBy === 'patient') {
        return (a.patientName || '').localeCompare(b.patientName || '');
      }
      return 0;
    });
  }, [reports, usersById, reportSearchTerm, reportStatusFilter, reportSortBy]);

  // Delete Report Handler
  const handleDeleteReport = async () => {
    if (!deleteModalReport) return;
    setIsDeletingReport(true);
    try {
      await deleteDoc(doc(db, 'reports', deleteModalReport.id));
      setReports(prev => prev.filter(r => r.id !== deleteModalReport.id));
      setStats(prev => ({
        ...prev,
        totalReports: Math.max(0, prev.totalReports - 1),
      }));
      showToast(`Report for "${deleteModalReport.patientName}" was deleted.`);
      setDeleteModalReport(null);
    } catch (err: any) {
      console.error('Failed to delete report:', err);
      showToast(`Failed to delete report: ${err?.message || 'Permission denied or network failure'}`);
    } finally {
      setIsDeletingReport(false);
    }
  };

  // Report statistics summary
  const reportStats = useMemo(() => {
    const total = reports.length;
    const compliant = reports.filter(r => r.status === 'Compliant').length;
    const nonCompliant = total - compliant;
    const compliantRate = total > 0 ? Math.round((compliant / total) * 100) : 0;
    return { total, compliant, nonCompliant, compliantRate };
  }, [reports]);

  // Access guard
  if (!isCurrentSuperAdmin) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 dark:border-rose-900/50 shadow-sm max-w-lg mx-auto mt-12">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock size={32} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
          This Super Administrator panel is exclusively restricted to authorized personnel (<strong>{SUPER_ADMIN_EMAIL}</strong>).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl border border-emerald-500 text-sm font-semibold animate-in slide-in-from-top duration-200">
          <CheckCircle2 size={18} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Banner */}
      <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-indigo-900/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold uppercase tracking-wider mb-3">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Super Admin Console • Level 1 Access</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              User Management & Accounts
            </h1>
            <p className="text-sm text-indigo-200/80 mt-1 max-w-2xl">
              Manage all registered occupational clinics, monitor compliance credit allocations, adjust subscription tiers, and delete accounts directly.
            </p>
            <div className="mt-3 text-xs text-indigo-300/70 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Authenticated as: <strong className="text-white">{profile.email}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchUsers(true)}
              disabled={refreshing || (loading && users.length === 0)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-sm font-semibold backdrop-blur-sm border border-white/15 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh Users'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Metric KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Users size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Users</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white truncate">
              {(loading && users.length === 0) ? '...' : (stats.totalUsers || users.length)}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CreditCard size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Monthly Active</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white truncate">
              {(loading && users.length === 0) ? '...' : stats.activeSubscriptions}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Coins size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Credits</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white truncate">
              {(loading && users.length === 0) ? '...' : stats.totalCredits}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <FileText size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Reports</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white truncate">
              {(loading && users.length === 0) ? '...' : stats.totalReports}
            </p>
          </div>
        </div>
      </section>

      {/* Primary Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 sm:gap-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2.5 pb-3 px-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Users size={18} />
          <span>Registered Clinics & Users</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
            activeTab === 'users'
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            {users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2.5 pb-3 px-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'reports'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <FileText size={18} />
          <span>All Compliance Reports</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-extrabold ${
            activeTab === 'reports'
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}>
            {reports.length}
          </span>
        </button>
      </div>

      {activeTab === 'users' && (
        <>
          {/* Filter and Search Bar */}
          <section className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by clinic name, email, display name, or user UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filter: Plan */}
          <div className="flex gap-2">
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="all">All Plans</option>
              <option value="monthly_clinic">Monthly Clinic ($250/mo)</option>
              <option value="per_report">Pay-Per-Report</option>
              <option value="free">Free Tier</option>
            </select>

            {/* Filter: Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="inactive">Inactive</option>
              <option value="canceled">Canceled</option>
            </select>

            {/* Sort by */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            >
              <option value="recent">Sort: Most Recent</option>
              <option value="credits">Sort: Most Credits</option>
              <option value="reports">Sort: Most Reports</option>
              <option value="email">Sort: Email A-Z</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/60">
          <span>Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> registered users</span>
          {(searchTerm || planFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => { setSearchTerm(''); setPlanFilter('all'); setStatusFilter('all'); }}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl text-rose-700 dark:text-rose-300 flex items-start gap-3 text-sm">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Error Loading Users</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => fetchUsers(true)}
            className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold text-xs hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Users List & Table */}
      {(loading && users.length === 0) ? (
        <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mt-4">Loading system users and Firestore records...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
          <UserX size={40} className="mx-auto text-slate-400" />
          <p className="text-base font-bold text-slate-800 dark:text-slate-200">No users match your filters</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search query or reset the plan and status filters.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Desktop Table View (Hidden on mobile) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4">User / Clinic</th>
                  <th className="py-3.5 px-4">Registration</th>
                  <th className="py-3.5 px-4">Plan & Status</th>
                  <th className="py-3.5 px-4">Report Credits</th>
                  <th className="py-3.5 px-4">Reports</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                {filteredUsers.map((user) => {
                  const isSuperAdminAccount = user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
                  const isMonthlyUnlimited = user.subscriptionPlan === 'monthly_clinic' && user.subscriptionStatus === 'active';

                  return (
                    <tr
                      key={user.uid}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        isSuperAdminAccount ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      {/* User & Clinic Column */}
                      <td className="py-4 px-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                            isSuperAdminAccount
                              ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/40'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}>
                            {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]" title={user.email}>
                                {user.email}
                              </span>
                              {isSuperAdminAccount && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 uppercase tracking-wider">
                                  You (Admin)
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]" title={user.clinicName}>
                              Clinic: <span className="font-semibold text-slate-700 dark:text-slate-300">{user.clinicName || 'Not specified'}</span>
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                UID: {user.uid.slice(0, 12)}...
                              </span>
                              <button
                                onClick={() => handleCopyUid(user.uid)}
                                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                title="Copy Full UID"
                              >
                                {copiedUid === user.uid ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Registration Date */}
                      <td className="py-4 px-4 text-xs text-slate-600 dark:text-slate-400">
                        <p className="font-medium text-slate-900 dark:text-slate-200">{formatDate(user.createdAt)}</p>
                        {user.lastSignIn && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                            Last seen: {formatDate(user.lastSignIn)}
                          </p>
                        )}
                      </td>

                      {/* Plan & Status */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            user.subscriptionPlan === 'monthly_clinic'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                              : user.subscriptionPlan === 'per_report'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}>
                            {user.subscriptionPlan === 'monthly_clinic' ? 'Monthly Clinic' : user.subscriptionPlan === 'per_report' ? 'Pay-Per-Report' : 'Free Tier'}
                          </span>
                          <div>
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              user.subscriptionStatus === 'active'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : user.subscriptionStatus === 'canceled'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {user.subscriptionStatus || 'inactive'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Report Credits */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-base font-extrabold ${
                            isMonthlyUnlimited
                              ? 'text-purple-600 dark:text-purple-400'
                              : user.reportCredits > 0
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-400'
                          }`}>
                            {isMonthlyUnlimited ? '∞' : user.reportCredits}
                          </span>
                          <span className="text-xs text-slate-500">
                            {isMonthlyUnlimited ? 'Unlimited' : user.reportCredits === 1 ? 'credit' : 'credits'}
                          </span>

                          {/* Quick Adjust Buttons */}
                          {!isSuperAdminAccount && (
                            <div className="flex items-center gap-1 ml-2">
                              <button
                                onClick={() => handleQuickCreditAdjust(user, 1)}
                                className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer"
                                title="Add 1 credit"
                              >
                                <Plus size={12} />
                              </button>
                              <button
                                onClick={() => handleQuickCreditAdjust(user, -1)}
                                disabled={user.reportCredits <= 0}
                                className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer disabled:opacity-30"
                                title="Subtract 1 credit"
                              >
                                <Minus size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Reports Generated */}
                      <td className="py-4 px-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                        {user.reportsCount} {user.reportsCount === 1 ? 'report' : 'reports'}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Edit Credits/Plan */}
                          <button
                            onClick={() => openEditModal(user)}
                            className="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                            title="Edit User Credits or Plan"
                          >
                            <Edit3 size={14} />
                            <span>Adjust</span>
                          </button>

                          {/* Delete User */}
                          {isSuperAdminAccount ? (
                            <span className="text-[11px] text-slate-400 px-2 py-1 select-none italic" title="You cannot delete the super admin account">
                              Super Admin
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setDeleteModalUser(user);
                                setDeleteConfirmationText('');
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                              title="Permanently Delete User"
                            >
                              <Trash2 size={14} />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Visible on < lg screens) */}
          <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
            {filteredUsers.map((user) => {
              const isSuperAdminAccount = user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
              const isMonthlyUnlimited = user.subscriptionPlan === 'monthly_clinic' && user.subscriptionStatus === 'active';

              return (
                <div key={user.uid} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{user.email}</p>
                        {isSuperAdminAccount && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 uppercase">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        Clinic: <strong className="text-slate-700 dark:text-slate-200">{user.clinicName || 'Not Set'}</strong>
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        UID: {user.uid}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        user.subscriptionPlan === 'monthly_clinic'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                      }`}>
                        {user.subscriptionPlan}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl">
                    <div>
                      <span className="text-slate-400">Credits: </span>
                      <strong className="text-blue-600 dark:text-blue-400 font-mono text-sm">
                        {isMonthlyUnlimited ? 'Unlimited' : user.reportCredits}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Reports: </span>
                      <strong className="text-slate-800 dark:text-slate-200">{user.reportsCount}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Joined: </span>
                      <span className="text-slate-600 dark:text-slate-300">{formatDate(user.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions for mobile card */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => openEditModal(user)}
                      className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg flex items-center gap-1.5"
                    >
                      <Edit3 size={13} />
                      <span>Adjust</span>
                    </button>

                    {!isSuperAdminAccount && (
                      <button
                        onClick={() => {
                          setDeleteModalUser(user);
                          setDeleteConfirmationText('');
                        }}
                        className="px-3 py-1.5 text-xs font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 rounded-lg flex items-center gap-1.5"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>
      )}

      {/* TAB 2: ALL COMPLIANCE REPORTS INSPECTION */}
      {activeTab === 'reports' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Reports Run</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{reports.length}</p>
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Compliant Outcomes</p>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {reportStats.compliant} <span className="text-xs font-semibold text-slate-400">({reportStats.compliantRate}%)</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <XCircle size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Non-Compliant Outcomes</p>
                <p className="text-lg font-black text-rose-600 dark:text-rose-400">
                  {reportStats.nonCompliant} <span className="text-xs font-semibold text-slate-400">({100 - reportStats.compliantRate}%)</span>
                </p>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar for Reports */}
          <section className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by patient name, clinic name/email, device model, or report ID..."
                  value={reportSearchTerm}
                  onChange={(e) => setReportSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white placeholder:text-slate-400"
                />
                {reportSearchTerm && (
                  <button
                    onClick={() => setReportSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div className="flex gap-2">
                <select
                  value={reportStatusFilter}
                  onChange={(e) => setReportStatusFilter(e.target.value as any)}
                  className="px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  <option value="all">All Determinations</option>
                  <option value="Compliant">Compliant Only</option>
                  <option value="Non-Compliant">Non-Compliant Only</option>
                </select>

                {/* Sort dropdown */}
                <select
                  value={reportSortBy}
                  onChange={(e) => setReportSortBy(e.target.value as any)}
                  className="px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  <option value="recent">Sort: Most Recent</option>
                  <option value="compliance">Sort: Compliance %</option>
                  <option value="patient">Sort: Patient Name</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/60">
              <span>Showing <strong>{filteredReports.length}</strong> of <strong>{reports.length}</strong> compliance reports</span>
              {(reportSearchTerm || reportStatusFilter !== 'all') && (
                <button
                  onClick={() => { setReportSearchTerm(''); setReportStatusFilter('all'); }}
                  className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          </section>

          {/* Reports Table & List */}
          {(loading && reports.length === 0) ? (
            <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 dark:border-indigo-400 mx-auto"></div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mt-4">Loading reports from database...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
              <Inbox size={40} className="mx-auto text-slate-400" />
              <p className="text-base font-bold text-slate-800 dark:text-slate-200">
                {reports.length === 0 ? 'No compliance reports evaluated yet' : 'No reports match your filters'}
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {reports.length === 0
                  ? 'When clinic operators upload CPAP compliance printouts, their generated determinations will appear here live.'
                  : 'Try adjusting your search criteria or clearing your determination filter.'}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-xs uppercase font-extrabold tracking-wider">
                      <th className="py-3.5 px-4">Patient / Subject</th>
                      <th className="py-3.5 px-4">Generating Clinic</th>
                      <th className="py-3.5 px-4">Determination</th>
                      <th className="py-3.5 px-4">Device & Window</th>
                      <th className="py-3.5 px-4 text-center">Compliance Rate</th>
                      <th className="py-3.5 px-4 text-center">Avg Hours</th>
                      <th className="py-3.5 px-4 text-center">AHI</th>
                      <th className="py-3.5 px-4">Evaluated Date</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredReports.map((report) => {
                      const clinic = usersById.get(report.clinicId);
                      const isCompliant = report.status === 'Compliant';
                      const usagePercent = report.metrics?.usage_days_percent ?? 0;
                      return (
                        <tr
                          key={report.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Patient */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-slate-900 dark:text-white">
                                {report.patientName || 'Anonymous Patient'}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                <span className="font-mono text-[11px]">ID: {report.id.substring(0, 10)}...</span>
                                {report.dob && <span className="text-[11px]">• DOB: {report.dob}</span>}
                              </div>
                            </div>
                          </td>

                          {/* Clinic */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1">
                                <Building2 size={13} className="text-slate-400 shrink-0" />
                                {clinic?.clinicName || 'Direct Account'}
                              </span>
                              <span className="text-xs text-slate-500 font-mono truncate max-w-[180px]">
                                {clinic?.email || report.clinicId || 'Unknown'}
                              </span>
                            </div>
                          </td>

                          {/* Determination */}
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                              isCompliant
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            }`}>
                              {isCompliant ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                              {report.status}
                            </span>
                          </td>

                          {/* Device & Window */}
                          <td className="py-3.5 px-4 text-xs">
                            <p className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[160px]">
                              {report.metrics?.device_type || 'CPAP Device'}
                            </p>
                            {(report.metrics?.report_start_date || report.metrics?.report_end_date) && (
                              <p className="text-[11px] text-slate-400">
                                {report.metrics.report_start_date} – {report.metrics.report_end_date}
                              </p>
                            )}
                          </td>

                          {/* Compliance % */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${
                                usagePercent >= 70
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                              }`}>
                                {usagePercent}%
                              </span>
                              {typeof report.metrics?.days_used_4_plus_hours === 'number' && (
                                <span className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                  {report.metrics.days_used_4_plus_hours}/{report.metrics?.total_days || 30} days
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Avg Hours */}
                          <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                            {typeof report.metrics?.average_usage_hours === 'number'
                              ? `${report.metrics.average_usage_hours} hrs`
                              : '—'}
                          </td>

                          {/* AHI */}
                          <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                            {typeof report.metrics?.ahi === 'number' ? report.metrics.ahi : '—'}
                          </td>

                          {/* Evaluated Date */}
                          <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(report.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Inspect Full Report */}
                              <Link
                                to={`/dashboard/report/${report.id}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
                              >
                                <Eye size={13} />
                                <span>Inspect</span>
                                <ExternalLink size={11} />
                              </Link>

                              {/* Delete Report */}
                              <button
                                onClick={() => setDeleteModalReport(report)}
                                title="Delete report"
                                className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all cursor-pointer"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="block lg:hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredReports.map((report) => {
                  const clinic = usersById.get(report.clinicId);
                  const isCompliant = report.status === 'Compliant';
                  const usagePercent = report.metrics?.usage_days_percent ?? 0;
                  return (
                    <div key={report.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-slate-900 dark:text-white text-base">
                            {report.patientName || 'Anonymous Patient'}
                          </p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">
                            ID: {report.id.substring(0, 16)}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                          isCompliant
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}>
                          {isCompliant ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {report.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                        <p className="flex items-center gap-1.5">
                          <Building2 size={13} className="text-slate-400" />
                          <span>Clinic: <strong>{clinic?.clinicName || 'Direct Account'}</strong> ({clinic?.email || report.clinicId})</span>
                        </p>
                        <p className="text-slate-500">Device: {report.metrics?.device_type || 'CPAP'}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs text-center">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Usage %</p>
                          <p className={`font-mono font-black mt-0.5 ${usagePercent >= 70 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {usagePercent}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">Avg Hours</p>
                          <p className="font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                            {report.metrics?.average_usage_hours ? `${report.metrics.average_usage_hours}h` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">AHI</p>
                          <p className="font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                            {report.metrics?.ahi ?? '—'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-400">{formatDate(report.createdAt)}</span>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/dashboard/report/${report.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg text-xs cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Inspect Report</span>
                          </Link>
                          <button
                            onClick={() => setDeleteModalReport(report)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: DELETE USER CONFIRMATION                                        */}
      {/* ========================================================================= */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 size={28} />
            </div>

            <div className="text-center">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Delete User Account?
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider mt-1">
                Permanent • Irreversible Action
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Email:</span>
                <strong className="text-slate-900 dark:text-white">{deleteModalUser.email}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Clinic Name:</span>
                <strong className="text-slate-700 dark:text-slate-300">{deleteModalUser.clinicName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Credits Remaining:</span>
                <strong className="text-blue-600 dark:text-blue-400">{deleteModalUser.reportCredits}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Compliance Reports:</span>
                <strong className="text-rose-600 dark:text-rose-400">{deleteModalUser.reportsCount} will be deleted</strong>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              This will permanently delete this user from <strong>Firebase Authentication</strong>, remove their <strong>Firestore user profile</strong>, and purge all compliance reports generated under their account.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Type <span className="text-rose-600 font-mono font-extrabold">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                placeholder="DELETE"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500 text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalUser(null);
                  setDeleteConfirmationText('');
                }}
                disabled={isDeleting}
                className="flex-1 py-2.5 px-4 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteConfirmationText.trim() !== 'DELETE' || isDeleting}
                className="flex-1 py-2.5 px-4 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-40 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Delete User</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADJUST USER CREDITS & SUBSCRIPTION PLAN                         */}
      {/* ========================================================================= */}
      {editModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-indigo-200 dark:border-indigo-900/60 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Adjust User Account</h3>
                  <p className="text-xs text-slate-500 truncate max-w-[240px]">{editModalUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setEditModalUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Credit Adjuster */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Report Credits Balance</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400 text-sm font-extrabold">{editCredits} Credits</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditCredits(prev => Math.max(0, prev - 1))}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold flex items-center justify-center cursor-pointer"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min="0"
                  value={editCredits}
                  onChange={(e) => setEditCredits(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="flex-1 text-center py-2 text-lg font-mono font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setEditCredits(prev => prev + 1)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold flex items-center justify-center cursor-pointer"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-1.5 pt-1">
                {[0, 1, 5, 10, 25, 50].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setEditCredits(val)}
                    className={`flex-1 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      editCredits === val
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {val === 0 ? '0' : `+${val}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Subscription Plan
              </label>
              <select
                value={editPlan}
                onChange={(e) => setEditPlan(e.target.value as any)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              >
                <option value="free">Free Tier</option>
                <option value="per_report">Pay-Per-Report ($9/ea)</option>
                <option value="monthly_clinic">Monthly Clinic ($250/mo Unlimited)</option>
              </select>
            </div>

            {/* Status Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Subscription Status
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as any)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              >
                <option value="active">Active (Entitled)</option>
                <option value="trial">Trial</option>
                <option value="inactive">Inactive</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditModalUser(null)}
                disabled={isSavingEdit}
                className="flex-1 py-2.5 px-4 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="flex-1 py-2.5 px-4 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                {isSavingEdit ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Save Adjustments</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE REPORT CONFIRMATION                                      */}
      {/* ========================================================================= */}
      {deleteModalReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 size={28} />
            </div>

            <div className="text-center">
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Delete Compliance Report?
              </h3>
              <p className="text-xs text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider mt-1">
                Permanent • Irreversible Action
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Patient:</span>
                <strong className="text-slate-900 dark:text-white">{deleteModalReport.patientName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tracker ID:</span>
                <span className="font-mono text-slate-600 dark:text-slate-400">{deleteModalReport.id.substring(0, 16)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Determination:</span>
                <strong className={deleteModalReport.status === 'Compliant' ? 'text-emerald-600' : 'text-rose-600'}>
                  {deleteModalReport.status}
                </strong>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalReport(null)}
                disabled={isDeletingReport}
                className="flex-1 py-2.5 px-4 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReport}
                disabled={isDeletingReport}
                className="flex-1 py-2.5 px-4 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
              >
                {isDeletingReport ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Delete Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
