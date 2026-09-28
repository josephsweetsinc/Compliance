import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, ComplianceReport } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Filter, CheckCircle, XCircle, ChevronRight, FileText, Calendar, Trash2, Mail, CheckSquare, Square, Loader2, AlertCircle, Clock, X } from 'lucide-react';
import { formatDate } from '../lib/utils';
import { LegalDisclaimer } from '../components/LegalDisclaimer';

export default function HistoryPage({ profile }: { profile: UserProfile }) {
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Compliant' | 'Non-Compliant'>('All');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkSuccessNotice, setBulkSuccessNotice] = useState<string | null>(null);
  const [showExpiredAlert, setShowExpiredAlert] = useState<{ patientName: string } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.expired) {
      setShowExpiredAlert({ patientName: location.state.patientName });
      // Clear the state so it doesn't reappear on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    const reportsPath = 'reports';
    const q = query(
      collection(db, reportsPath),
      where('clinicId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date().getTime();
      const reportsData = snapshot.docs.map(doc => {
        const data = doc.data() as ComplianceReport;
        return { id: doc.id, ...data };
      });
      
      // Client-side filtering of expired reports
      const activeReports = reportsData.filter(report => {
        if (!report.expiresAt) return true;
        const expiry = new Date(report.expiresAt).getTime();
        return expiry > now;
      });

      setReports(activeReports);
      setLoading(false);

      // Background cleanup of expired reports found during sync
      reportsData.forEach(async (report) => {
        if (report.expiresAt && new Date(report.expiresAt).getTime() <= now) {
          try {
            await deleteDoc(doc(db, 'reports', report.id));
          } catch (e) {
            console.error("Failed to clean up expired report", e);
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, reportsPath);
    });

    return () => unsubscribe();
  }, [profile.uid]);

  const filteredReports = reports.filter(report => {
    const matchesSearch = report.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'All' || report.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getRemainingTime = (expiresAt: string) => {
    const expiry = new Date(expiresAt).getTime();
    const now = new Date().getTime();
    const diff = expiry - now;
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60000);
    return `${mins}m left`;
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredReports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredReports.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm(`Are you sure you want to delete ${selectedIds.size} reports?`)) return;
    
    setIsActionLoading(true);
    setActionError(null);
    const batch = writeBatch(db);
    
    try {
      selectedIds.forEach(id => {
        batch.delete(doc(db, 'reports', id));
      });
      await batch.commit();
      setSelectedIds(new Set());
    } catch (err) {
      setActionError('Failed to delete some reports. Please try again.');
      console.error(err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleBulkEmail = async () => {
    if (selectedIds.size === 0) return;
    
    setIsActionLoading(true);
    setActionError(null);

    const selectedReports = reports.filter(r => selectedIds.has(r.id));
    let successCount = 0;

    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      for (const report of selectedReports) {
        // We use the profile email since we don't have individual patient emails saved in the schema
        // This simulates bulk sending reports to the clinic or a designated recipient
        const response = await fetch('/api/send-notification', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            email: profile.email,
            patientName: report.patientName,
            status: report.status,
            reportId: report.id,
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          successCount++;
        } else {
          throw new Error(data.error || data.message || data.details || 'Failed to send email');
        }
      }
      
      setBulkSuccessNotice(`Successfully sent ${successCount} report notifications to ${profile.email}`);
      setTimeout(() => setBulkSuccessNotice(null), 5000);
      setSelectedIds(new Set());
    } catch (err: any) {
      setActionError(`Email error: ${err.message || 'Failed to send some emails. Please try again.'}`);
      console.error(err);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Report History</h1>
          <p className="text-sm text-slate-500 mt-0.5">View and manage all your CPAP compliance reports.</p>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-blue-50 px-3.5 py-2 rounded-xl border border-blue-100 animate-in slide-in-from-top-4 duration-300 self-start sm:self-auto">
            <span className="text-xs sm:text-sm font-bold text-blue-700">{selectedIds.size} Selected</span>
            <div className="h-4 w-px bg-blue-200"></div>
            <button
              onClick={toggleSelectAll}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer min-h-[36px] flex items-center"
            >
              {selectedIds.size === filteredReports.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        )}
      </header>
      
      {showExpiredAlert && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3 text-amber-800">
            <Clock size={20} className="text-amber-600" />
            <p className="text-sm font-medium">
              The report for <strong>{showExpiredAlert.patientName}</strong> has expired and was automatically deleted for security.
            </p>
          </div>
          <button onClick={() => setShowExpiredAlert(null)} className="text-amber-400 hover:text-amber-600">
            <X size={18} />
          </button>
        </div>
      )}

      {bulkSuccessNotice && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl animate-in fade-in duration-300">
          <CheckCircle size={20} className="text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">{bulkSuccessNotice}</p>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">{actionError}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by driver or pilot name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shadow-xs"
          />
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1 shadow-xs">
          <Filter className="text-slate-400 shrink-0" size={16} />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="w-full bg-transparent py-2 text-xs sm:text-sm font-semibold text-slate-700 outline-none cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Compliant">Compliant</option>
            <option value="Non-Compliant">Non-Compliant</option>
          </select>
        </div>
      </div>

      {/* Reports List */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredReports.length > 0 ? (
          <>
            {/* Mobile Card List View (< md screens) */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredReports.map((report) => (
                <div
                  key={`mobile-${report.id}`}
                  className={`p-4 transition-colors cursor-pointer ${
                    selectedIds.has(report.id) ? 'bg-blue-50/50' : 'active:bg-slate-50'
                  }`}
                  onClick={() => navigate(`/dashboard/report/${report.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => toggleSelect(report.id, e)}
                        className="mt-0.5 p-2 -m-2 text-slate-400 hover:text-blue-600 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label="Select report"
                      >
                        {selectedIds.has(report.id) ? (
                          <CheckSquare size={20} className="text-blue-600" />
                        ) : (
                          <Square size={20} className="text-slate-300" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 truncate text-base">{report.patientName}</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar size={12} /> {formatDate(report.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      report.status === 'Compliant'
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-rose-50 text-rose-600 border border-rose-100'
                    }`}>
                      {report.status === 'Compliant' ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {report.status}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-50 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="font-bold text-slate-800">
                        {report.metrics?.compliance_percentage ?? report.metrics?.usage_days_percent ?? 0}%
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500">
                        {report.metrics?.average_usage_hours ?? 0} hrs/night
                      </span>
                      {report.expiresAt && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-amber-600 font-mono text-[11px]">
                            {getRemainingTime(report.expiresAt)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 text-blue-600 font-semibold text-xs">
                      <span>View</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (md+ screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 w-10">
                      <button 
                        onClick={toggleSelectAll}
                        className="p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        {selectedIds.size === filteredReports.length && filteredReports.length > 0 ? (
                          <CheckSquare size={18} className="text-blue-600" />
                        ) : (
                          <Square size={18} className="text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Driver / Pilot</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Compliance</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Expires</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredReports.map((report) => (
                    <tr 
                      key={report.id} 
                      className={`group transition-colors cursor-pointer ${
                        selectedIds.has(report.id) ? 'bg-blue-50/30' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => navigate(`/dashboard/report/${report.id}`)}
                    >
                      <td className="px-6 py-4" onClick={(e) => toggleSelect(report.id, e)}>
                        <div className="flex items-center justify-center">
                          {selectedIds.has(report.id) ? (
                            <CheckSquare size={18} className="text-blue-600" />
                          ) : (
                            <Square size={18} className="text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                            <FileText size={18} />
                          </div>
                          <span className="font-bold text-slate-800">{report.patientName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          report.status === 'Compliant' 
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                            : 'bg-rose-50 text-rose-600 border border-rose-100'
                        }`}>
                          {report.status === 'Compliant' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {report.status}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{report.metrics?.compliance_percentage ?? 0}%</span>
                          <span className="text-xs text-slate-400">{report.metrics?.average_usage_hours ?? 0} hrs avg</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-bold font-mono text-amber-600">
                          <Clock size={12} />
                          {report.expiresAt ? getRemainingTime(report.expiresAt) : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <Calendar size={14} />
                          {formatDate(report.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-600 transition-colors inline-block" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-20 text-center">
            <div className="mb-4 flex justify-center">
              <div className="p-6 bg-slate-50 rounded-full">
                <Search className="text-slate-300" size={48} />
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">No reports found</h3>
            <p className="text-slate-500">Try adjusting your search or filter criteria.</p>
          </div>
        )}
      </section>

      {/* Compliance & Regulatory Legal Disclaimer */}
      <LegalDisclaimer variant="compact" id="history-legal-disclaimer" />

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 sm:px-6 py-3.5 sm:py-4 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-3 sm:gap-6 z-40 animate-in slide-in-from-bottom-8 duration-500 max-w-[92vw] w-auto">
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm font-bold">{selectedIds.size} Reports Selected</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold hidden sm:inline">Bulk Action Toolkit</span>
          </div>
          
          <div className="h-6 sm:h-8 w-px bg-slate-700"></div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkEmail}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-3 py-2 hover:bg-slate-800 rounded-xl transition-all text-xs sm:text-sm font-bold group cursor-pointer"
            >
              {isActionLoading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} className="text-slate-400 group-hover:text-blue-400" />}
              <span>Email</span>
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-3 py-2 hover:bg-rose-900/50 hover:text-rose-400 rounded-xl transition-all text-xs sm:text-sm font-bold group cursor-pointer"
            >
              {isActionLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} className="text-slate-400 group-hover:text-rose-500" />}
              <span>Delete</span>
            </button>
          </div>
          
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Deselect all"
          >
            <XCircle size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
