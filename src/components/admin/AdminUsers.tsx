import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { getAdminUsers, type AdminUser, type UserListResponse } from '../../lib/adminApi';
import AdminUserDetail from './AdminUserDetail';

const PLAN_OPTIONS = [
  { value: '', label: 'All Plans' },
  { value: 'free', label: 'Free' },
  { value: 'starter', label: 'Starter' },
  { value: 'pro', label: 'Pro' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past Due' },
  { value: 'restricted', label: 'Restricted' },
  { value: 'downgraded', label: 'Downgraded' },
];

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    free: 'bg-slate-100 text-slate-700',
    starter: 'bg-emerald-100 text-emerald-700',
    pro: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[plan] || colors.free}`}>
      {plan}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    past_due: 'bg-amber-100 text-amber-700',
    restricted: 'bg-red-100 text-red-700',
    downgraded: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] || 'bg-slate-100 text-slate-700'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

export default function AdminUsers() {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const limit = 25;

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getAdminUsers({
        page,
        limit,
        search: search || undefined,
        plan: planFilter || undefined,
        status: statusFilter || undefined,
      });
      setData(result);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, planFilter, statusFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  if (selectedUserId) {
    return (
      <AdminUserDetail
        userId={selectedUserId}
        onBack={() => { setSelectedUserId(null); loadUsers(); }}
      />
    );
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          />
        </div>
        <select
          value={planFilter}
          onChange={e => { setPlanFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
        >
          {PLAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={loadUsers}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Docs</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Last Active</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-48" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 rounded w-8 ml-auto" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 rounded w-16 ml-auto" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 rounded w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No users found</td>
                </tr>
              ) : (
                data?.users.map(user => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{user.fullName || user.displayName || user.email}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><PlanBadge plan={user.plan} /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={user.paymentStatus} /></td>
                    <td className="px-4 py-3 text-right text-slate-700 hidden md:table-cell">{user.documentCount}</td>
                    <td className="px-4 py-3 text-right text-slate-500 hidden lg:table-cell">{formatDate(user.lastSignInAt)}</td>
                    <td className="px-4 py-3 text-right text-slate-500 hidden lg:table-cell">{formatDate(user.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-600">
              {((page - 1) * limit) + 1}–{Math.min(page * limit, data.total)} of {data.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-slate-600">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
