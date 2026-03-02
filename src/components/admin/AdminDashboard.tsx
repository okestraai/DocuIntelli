import { useState, useEffect } from 'react';
import { Users, FileText, DollarSign, Zap, TrendingUp, AlertTriangle, Mail, CreditCard, Landmark, Target } from 'lucide-react';
import { getAdminDashboard, type DashboardStats } from '../../lib/adminApi';

function StatCard({ label, value, icon: Icon, color = 'emerald', subtitle }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  subtitle?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-50 to-teal-50 text-emerald-600',
    blue: 'from-blue-50 to-indigo-50 text-blue-600',
    amber: 'from-amber-50 to-yellow-50 text-amber-600',
    red: 'from-red-50 to-rose-50 text-red-600',
    purple: 'from-purple-50 to-violet-50 text-purple-600',
    slate: 'from-slate-50 to-gray-50 text-slate-600',
  };

  return (
    <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-500 mb-1 truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`bg-gradient-to-br ${colorMap[color] || colorMap.emerald} p-2.5 rounded-lg flex-shrink-0`}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

function PlanBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-slate-700 w-16">{label}</span>
      <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-slate-900 w-16 text-right">{count} ({pct}%)</span>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminDashboard();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-48 bg-white rounded-xl border border-slate-200" />
          <div className="h-48 bg-white rounded-xl border border-slate-200" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium">{error}</p>
        <button onClick={loadDashboard} className="mt-3 text-sm text-red-600 hover:text-red-700 underline">Retry</button>
      </div>
    );
  }

  if (!stats) return null;

  const totalUsers = stats.total_users;
  const mrr = (stats.total_revenue_cents / 100).toFixed(2);
  const emailRate = stats.emails_sent_24h + stats.emails_failed_24h > 0
    ? Math.round((stats.emails_sent_24h / (stats.emails_sent_24h + stats.emails_failed_24h)) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Users" value={totalUsers} icon={Users} color="blue" subtitle={`${stats.active_this_week} active this week`} />
        <StatCard label="Total Revenue" value={`$${mrr}`} icon={DollarSign} color="emerald" subtitle={`${stats.failed_payments} failed payments`} />
        <StatCard label="Total Documents" value={stats.total_documents} icon={FileText} color="purple" subtitle={`${stats.processing_queue} in queue`} />
        <StatCard label="Active Today" value={stats.active_this_week} icon={Zap} color="amber" subtitle={`${stats.new_this_month} new this month`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Plan Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              Plan Distribution
            </h3>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            <PlanBar label="Free" count={stats.plan_free} total={totalUsers} color="bg-slate-400" />
            <PlanBar label="Starter" count={stats.plan_starter} total={totalUsers} color="bg-emerald-500" />
            <PlanBar label="Pro" count={stats.plan_pro} total={totalUsers} color="bg-gradient-to-r from-amber-500 to-yellow-500" />
          </div>
        </div>

        {/* Health Indicators */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Health Indicators
            </h3>
          </div>
          <div className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600 flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email Delivery Rate (24h)
              </span>
              <span className={`text-sm font-semibold ${emailRate >= 95 ? 'text-green-600' : emailRate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>
                {emailRate}%
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Dunning (Past Due)
              </span>
              <span className={`text-sm font-semibold ${stats.dunning_past_due === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.dunning_past_due}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Churn Risk
              </span>
              <span className={`text-sm font-semibold ${stats.churn_risk === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                {stats.churn_risk}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Processing Queue
              </span>
              <span className={`text-sm font-semibold ${stats.processing_queue === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                {stats.processing_queue}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600 flex items-center gap-2">
                <Landmark className="h-4 w-4" /> Bank Connections
              </span>
              <span className="text-sm font-semibold text-slate-900">{stats.total_bank_connections}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-600 flex items-center gap-2">
                <Target className="h-4 w-4" /> Active Goals
              </span>
              <span className="text-sm font-semibold text-slate-900">{stats.total_goals}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Document Stats + Recent Signups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Documents by Category */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Documents by Category</h3>
          </div>
          <div className="p-4 sm:p-5">
            {Object.keys(stats.docs_by_category).length === 0 ? (
              <p className="text-sm text-slate-500">No documents yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.docs_by_category)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, count]) => (
                    <div key={cat} className="flex items-center justify-between py-1">
                      <span className="text-sm text-slate-700 capitalize">{cat}</span>
                      <span className="text-sm font-medium text-slate-900">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Signups */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <h3 className="text-base font-semibold text-slate-900">Recent Signups</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recent_signups.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No recent signups</p>
            ) : (
              stats.recent_signups.map(user => (
                <div key={user.id} className="flex items-center justify-between px-4 sm:px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{user.email}</p>
                    <p className="text-xs text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  {user.lastSignInAt ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">Active</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">Never</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
