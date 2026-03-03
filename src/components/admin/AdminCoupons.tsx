import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Plus, X, Pencil, Power, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getAdminCoupons,
  createCoupon,
  updateCoupon,
  deactivateCoupon,
  getCouponRedemptions,
  type Coupon,
  type CouponListResponse,
  type CouponRedemption,
} from '../../lib/adminApi';

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    starter: 'bg-emerald-100 text-emerald-700',
    pro: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[plan] || 'bg-slate-100 text-slate-700'}`}>
      {plan}
    </span>
  );
}

function StatusBadge({ active, expiresAt }: { active: boolean; expiresAt: string | null }) {
  if (!active) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Inactive</span>;
  }
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Expired</span>;
  }
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString();
}

function formatUses(current: number, max: number | null): string {
  return max != null ? `${current} / ${max}` : `${current} / ∞`;
}

// ── Create / Edit Modal ──────────────────────────────────────

interface CouponFormData {
  code: string;
  description: string;
  plan: 'starter' | 'pro';
  trial_days: number;
  max_uses: string; // empty string = unlimited
  expires_at: string; // empty string = never
}

const DEFAULT_FORM: CouponFormData = {
  code: '',
  description: '',
  plan: 'pro',
  trial_days: 30,
  max_uses: '',
  expires_at: '',
};

function CouponModal({
  editCoupon,
  onClose,
  onSaved,
}: {
  editCoupon: Coupon | null; // null = creating new
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = editCoupon != null;
  const [form, setForm] = useState<CouponFormData>(() => {
    if (editCoupon) {
      return {
        code: editCoupon.code,
        description: editCoupon.description || '',
        plan: editCoupon.plan,
        trial_days: editCoupon.trial_days,
        max_uses: editCoupon.max_uses != null ? String(editCoupon.max_uses) : '',
        expires_at: editCoupon.expires_at ? editCoupon.expires_at.slice(0, 10) : '',
      };
    }
    return DEFAULT_FORM;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (isEdit) {
        await updateCoupon(editCoupon.id, {
          description: form.description || undefined,
          max_uses: form.max_uses ? parseInt(form.max_uses) : null,
          expires_at: form.expires_at || null,
        });
      } else {
        await createCoupon({
          code: form.code,
          description: form.description || undefined,
          plan: form.plan,
          trial_days: form.trial_days,
          max_uses: form.max_uses ? parseInt(form.max_uses) : null,
          expires_at: form.expires_at || null,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save coupon');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEdit ? 'Edit Coupon' : 'Create Coupon'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Coupon Code</label>
            <input
              type="text"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              disabled={isEdit}
              placeholder="e.g. WELCOME2024"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 uppercase tracking-wider disabled:bg-slate-50 disabled:text-slate-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Welcome offer for new users"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Plan */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
              <select
                value={form.plan}
                onChange={e => setForm(f => ({ ...f, plan: e.target.value as 'starter' | 'pro' }))}
                disabled={isEdit}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 disabled:bg-slate-50 disabled:text-slate-500"
              >
                <option value="pro">Pro</option>
                <option value="starter">Starter</option>
              </select>
            </div>

            {/* Trial Days */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trial Days</label>
              <input
                type="number"
                value={form.trial_days}
                onChange={e => setForm(f => ({ ...f, trial_days: parseInt(e.target.value) || 30 }))}
                disabled={isEdit}
                min={1}
                max={365}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Max Uses */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max Uses</label>
              <input
                type="number"
                value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                placeholder="Unlimited"
                min={1}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>

            {/* Expires At */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expires On</label>
              <input
                type="date"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Coupon'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Redemptions Row ──────────────────────────────────────────

function RedemptionsPanel({ couponId }: { couponId: string }) {
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await getCouponRedemptions(couponId);
        setRedemptions(result.redemptions);
      } catch (err) {
        console.error('Failed to load redemptions:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [couponId]);

  if (loading) {
    return (
      <div className="px-4 py-3 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-48" />
      </div>
    );
  }

  if (redemptions.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-slate-500">No redemptions yet</div>
    );
  }

  return (
    <div className="px-4 py-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pb-2 font-medium">User</th>
            <th className="pb-2 font-medium">Redeemed</th>
            <th className="pb-2 font-medium hidden sm:table-cell">Subscription ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {redemptions.map(r => (
            <tr key={r.id}>
              <td className="py-2 text-slate-900">{r.user_email}</td>
              <td className="py-2 text-slate-500">{formatDate(r.redeemed_at)}</td>
              <td className="py-2 text-slate-500 hidden sm:table-cell font-mono text-xs">
                {r.stripe_subscription_id || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function AdminCoupons() {
  const [data, setData] = useState<CouponListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 25;

  const loadCoupons = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getAdminCoupons({
        page,
        limit,
        search: search || undefined,
      });
      setData(result);
    } catch (err) {
      console.error('Failed to load coupons:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { loadCoupons(); }, [loadCoupons]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleDeactivate = async (coupon: Coupon) => {
    if (!confirm(`Deactivate coupon "${coupon.code}"?`)) return;
    try {
      await deactivateCoupon(coupon.id);
      loadCoupons();
    } catch (err) {
      console.error('Failed to deactivate coupon:', err);
    }
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditCoupon(null);
    loadCoupons();
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      {/* Header + Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by code or description..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
          />
        </div>
        <button
          onClick={loadCoupons}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={() => { setEditCoupon(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Coupon
        </button>
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600 w-8"></th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Code</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Description</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Plan</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Trial Days</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Uses</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Expires</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-4 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 rounded w-40" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-12" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 bg-slate-200 rounded w-8 ml-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-14" /></td>
                    <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : data?.coupons.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No coupons found. Create your first coupon to get started.
                  </td>
                </tr>
              ) : (
                data?.coupons.map(coupon => {
                  const isExpanded = expandedId === coupon.id;
                  return (
                    <tr key={coupon.id} className="group">
                      <td colSpan={9} className="p-0">
                        <div
                          className="flex items-center hover:bg-slate-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : coupon.id)}
                        >
                          <div className="px-4 py-3 w-8">
                            {isExpanded
                              ? <ChevronUp className="h-4 w-4 text-slate-400" />
                              : <ChevronDown className="h-4 w-4 text-slate-400" />}
                          </div>
                          <div className="px-4 py-3 flex-shrink-0">
                            <span className="font-mono font-medium text-slate-900 tracking-wider">{coupon.code}</span>
                          </div>
                          <div className="px-4 py-3 flex-1 min-w-0 hidden md:block">
                            <span className="text-slate-600 truncate block">{coupon.description || '—'}</span>
                          </div>
                          <div className="px-4 py-3 flex-shrink-0">
                            <PlanBadge plan={coupon.plan} />
                          </div>
                          <div className="px-4 py-3 text-right text-slate-700 flex-shrink-0 hidden sm:block">
                            {coupon.trial_days}d
                          </div>
                          <div className="px-4 py-3 text-right text-slate-700 flex-shrink-0">
                            {formatUses(coupon.current_uses, coupon.max_uses)}
                          </div>
                          <div className="px-4 py-3 text-slate-500 flex-shrink-0 hidden lg:block">
                            {formatDate(coupon.expires_at)}
                          </div>
                          <div className="px-4 py-3 flex-shrink-0">
                            <StatusBadge active={coupon.is_active} expiresAt={coupon.expires_at} />
                          </div>
                          <div className="px-4 py-3 flex-shrink-0 text-right">
                            <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => { setEditCoupon(coupon); setShowModal(true); }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {coupon.is_active && (
                                <button
                                  onClick={() => handleDeactivate(coupon)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-600"
                                  title="Deactivate"
                                >
                                  <Power className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50">
                            <RedemptionsPanel couponId={coupon.id} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
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

      {/* Create/Edit Modal */}
      {showModal && (
        <CouponModal
          editCoupon={editCoupon}
          onClose={() => { setShowModal(false); setEditCoupon(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
