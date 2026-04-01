import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, ComplianceReport } from '../types';
import { Link } from 'react-router-dom';
import { FileUp, History, CheckCircle, XCircle, Clock, ChevronRight } from 'lucide-react';
import { formatDate } from '../lib/utils';

export default function DashboardPage({ profile }: { profile: UserProfile }) {
  const [recentReports, setRecentReports] = useState<ComplianceReport[]>([]);
  const [loading, setLoading] = useState(true);

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

  const stats = {
    total: recentReports.length,
    compliant: recentReports.filter(r => r.status === 'Compliant').length,
    nonCompliant: recentReports.filter(r => r.status === 'Non-Compliant').length,
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Welcome back, {profile.displayName || 'Clinic Staff'}</p>
        </div>
        <Link
          to="/upload"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-200"
        >
          <FileUp size={20} />
          <span>Upload New Report</span>
        </Link>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={<History className="text-blue-600" />}
          label="Recent Reports"
          value={stats.total.toString()}
          bgColor="bg-blue-50"
        />
        <StatCard
          icon={<CheckCircle className="text-emerald-600" />}
          label="Compliant"
          value={stats.compliant.toString()}
          bgColor="bg-emerald-50"
        />
        <StatCard
          icon={<XCircle className="text-rose-600" />}
          label="Non-Compliant"
          value={stats.nonCompliant.toString()}
          bgColor="bg-rose-50"
        />
      </div>

      {/* Recent Activity */}
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Recent Activity</h2>
          <Link to="/history" className="text-blue-600 hover:text-blue-700 text-sm font-semibold flex items-center gap-1">
            View All <ChevronRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
          </div>
        ) : recentReports.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {recentReports.map((report) => (
              <Link
                key={report.id}
                to={`/report/${report.id}`}
                className="flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${report.status === 'Compliant' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {report.status === 'Compliant' ? <CheckCircle size={20} /> : <XCircle size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{report.patientName}</h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1">
                      <Clock size={14} /> {formatDate(report.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-slate-700">{report.metrics.compliance_percentage}% Compliance</p>
                    <p className="text-xs text-slate-400">{report.metrics.average_usage_hours} hrs avg usage</p>
                  </div>
                  <ChevronRight size={20} className="text-slate-300" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="mb-4 flex justify-center">
              <div className="p-4 bg-slate-50 rounded-full">
                <FileUp className="text-slate-300" size={32} />
              </div>
            </div>
            <p className="text-slate-500 font-medium">No reports uploaded yet.</p>
            <Link to="/upload" className="text-blue-600 hover:underline text-sm font-semibold mt-2 inline-block">
              Upload your first report
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, bgColor }: { icon: React.ReactNode; label: string; value: string; bgColor: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
      <div className={`p-4 rounded-xl ${bgColor}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
