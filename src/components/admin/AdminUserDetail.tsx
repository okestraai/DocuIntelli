import { useState, useEffect } from 'react';
import {
  ArrowLeft, User, FileText, Smartphone, Activity, AlertTriangle, Mail,
  CreditCard, Landmark, Target, Shield, Eye, RotateCcw, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  getAdminUserDetail, updateUserPlan, resetAIQuestions, unblockDevice,
  impersonateUser, type UserDetail
} from '../../lib/adminApi';

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100">{children}</div>}
    </div>
  );
}

function InfoRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between py-2 px-4 ${className || ''}`}>
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value || '—'}</span>
    </div>
  );
}

export default function AdminUserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showPlanSelect, setShowPlanSelect] = useState(false);
  const [confirmImpersonate, setConfirmImpersonate] = useState(false);

  useEffect(() => { loadDetail(); }, [userId]);

  async function loadDetail() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminUserDetail(userId);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePlan(plan: string) {
    setActionLoading('plan');
    try {
      await updateUserPlan(userId, plan);
      setShowPlanSelect(false);
      await loadDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResetAI() {
    setActionLoading('ai');
    try {
      await resetAIQuestions(userId);
      await loadDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnblockDevice(deviceId: string) {
    setActionLoading(`device-${deviceId}`);
    try {
      await unblockDevice(userId, deviceId);
      await loadDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unblock');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleImpersonate() {
    setActionLoading('impersonate');
    try {
      const result = await impersonateUser(userId);
      // Pass session tokens to a new tab via URL params.
      // The new tab's Supabase client uses sessionStorage (isolated from admin)
      // and App.tsx calls setSession() with these tokens.
      const params = new URLSearchParams({
        impersonate_token: result.access_token,
        impersonate_refresh: result.refresh_token,
        impersonate_proof: result.impersonation_proof,
      });
      window.open(`${window.location.origin}/dashboard?${params}`, '_blank');
      setConfirmImpersonate(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to impersonate');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="h-32 bg-white rounded-xl border border-slate-200" />
        <div className="h-64 bg-white rounded-xl border border-slate-200" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to users
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error || 'User not found'}</p>
        </div>
      </div>
    );
  }

  const { user, profile, subscription, documents, devices, recent_activity, limit_violations, email_history, bank_connections, dunning_log, financial_goals } = detail;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to users
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmImpersonate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Impersonate
          </button>
        </div>
      </div>

      {/* User Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="bg-gradient-to-br from-slate-100 to-slate-200 p-3 rounded-xl">
            <User className="h-8 w-8 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{profile?.full_name || profile?.display_name || user.email}</h2>
            <p className="text-sm text-slate-500">{user.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                subscription?.plan === 'pro' ? 'bg-amber-100 text-amber-700' :
                subscription?.plan === 'starter' ? 'bg-emerald-100 text-emerald-700' :
                'bg-slate-100 text-slate-700'
              }`}>{subscription?.plan || 'free'}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                subscription?.payment_status === 'active' ? 'bg-green-100 text-green-700' :
                'bg-red-100 text-red-700'
              }`}>{subscription?.payment_status || 'active'}</span>
              <span className="text-xs text-slate-500">Joined {new Date(user.created_at).toLocaleDateString()}</span>
              {user.last_sign_in_at && (
                <span className="text-xs text-slate-500">Last active {new Date(user.last_sign_in_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <button
            onClick={() => setShowPlanSelect(!showPlanSelect)}
            disabled={actionLoading === 'plan'}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Shield className="h-3.5 w-3.5" />
            {actionLoading === 'plan' ? 'Updating...' : 'Change Plan'}
          </button>
          {showPlanSelect && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
              {['free', 'starter', 'pro'].map(plan => (
                <button
                  key={plan}
                  onClick={() => handleUpdatePlan(plan)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 capitalize ${
                    subscription?.plan === plan ? 'font-semibold text-emerald-600' : 'text-slate-700'
                  }`}
                >
                  {plan} {subscription?.plan === plan && '(current)'}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleResetAI}
          disabled={actionLoading === 'ai'}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {actionLoading === 'ai' ? 'Resetting...' : `Reset Token Budget (${((subscription?.tokens_used || 0) / 1000).toFixed(0)}K used)`}
        </button>
      </div>

      {/* Subscription */}
      <Section title="Subscription Details" icon={CreditCard}>
        <div className="divide-y divide-slate-50">
          <InfoRow label="Plan" value={subscription?.plan} />
          <InfoRow label="Status" value={subscription?.status} />
          <InfoRow label="Payment Status" value={subscription?.payment_status} />
          <InfoRow label="Document Limit" value={`${documents.length} / ${subscription?.document_limit}`} />
          <InfoRow label="Monthly Tokens" value={`${((subscription?.tokens_used ?? 0) / 1000).toFixed(0)}K / ${((subscription?.tokens_limit ?? 50000) / 1000).toFixed(0)}K`} />
          <InfoRow label="Monthly Uploads" value={`${subscription?.monthly_uploads_used} / ${subscription?.monthly_upload_limit}`} />
          <InfoRow label="Bank Account Limit" value={subscription?.bank_account_limit} />
          {subscription?.stripe_subscription_id && (
            <InfoRow label="Stripe Sub ID" value={<span className="font-mono text-xs">{subscription.stripe_subscription_id}</span>} />
          )}
          {subscription?.current_period_end && (
            <InfoRow label="Period End" value={new Date(subscription.current_period_end).toLocaleDateString()} />
          )}
          {subscription?.dunning_step > 0 && (
            <InfoRow label="Dunning Step" value={<span className="text-red-600">{subscription.dunning_step}</span>} />
          )}
        </div>
      </Section>

      {/* Documents */}
      <Section title={`Documents (${documents.length})`} icon={FileText} defaultOpen={documents.length > 0}>
        {documents.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No documents</p>
        ) : (
          <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500">{doc.category} {doc.expiration_date ? `| Expires ${doc.expiration_date}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    doc.health_state === 'healthy' ? 'bg-green-100 text-green-700' :
                    doc.health_state === 'watch' ? 'bg-amber-100 text-amber-700' :
                    doc.health_state === 'risk' ? 'bg-orange-100 text-orange-700' :
                    doc.health_state === 'critical' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>{doc.health_state || 'healthy'}</span>
                  {!doc.processed && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">unprocessed</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Devices */}
      <Section title={`Devices (${devices.length})`} icon={Smartphone} defaultOpen={devices.length > 0}>
        {devices.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No devices</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {devices.map(device => (
              <div key={device.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{device.device_name}</p>
                  <p className="text-xs text-slate-500">{device.platform} | Last active {new Date(device.last_active_at).toLocaleDateString()}</p>
                </div>
                {device.is_blocked ? (
                  <button
                    onClick={() => handleUnblockDevice(device.id)}
                    disabled={actionLoading === `device-${device.id}`}
                    className="text-xs font-medium px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    {actionLoading === `device-${device.id}` ? 'Unblocking...' : 'Unblock'}
                  </button>
                ) : (
                  <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Active</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Recent Activity */}
      <Section title="Recent Activity" icon={Activity} defaultOpen={false}>
        {recent_activity.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No recent activity</p>
        ) : (
          <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
            {recent_activity.map((act, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-slate-700">{act.feature}</span>
                <span className="text-xs text-slate-500">{new Date(act.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Limit Violations */}
      {limit_violations.length > 0 && (
        <Section title={`Limit Violations (${limit_violations.length})`} icon={AlertTriangle} defaultOpen={false}>
          <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
            {limit_violations.map((v, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-slate-700">{v.limit_type} ({v.current_value}/{v.limit_value})</span>
                <span className="text-xs text-slate-500">{new Date(v.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Email History */}
      <Section title={`Email History (${email_history.length})`} icon={Mail} defaultOpen={false}>
        {email_history.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No emails sent</p>
        ) : (
          <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
            {email_history.map((e, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <div className="min-w-0">
                  <span className="text-sm text-slate-700">{e.notification_type}</span>
                  {e.error_message && <p className="text-xs text-red-500 truncate">{e.error_message}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${e.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.status}</span>
                  <span className="text-xs text-slate-500">{new Date(e.sent_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Bank Connections */}
      {bank_connections.length > 0 && (
        <Section title={`Bank Connections (${bank_connections.length})`} icon={Landmark} defaultOpen={false}>
          <div className="divide-y divide-slate-50">
            {bank_connections.map((b, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">{b.institution_name}</p>
                  <p className="text-xs text-slate-500">{b.account_count} accounts | Last synced {new Date(b.last_synced_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Financial Goals */}
      {financial_goals.length > 0 && (
        <Section title={`Financial Goals (${financial_goals.length})`} icon={Target} defaultOpen={false}>
          <div className="divide-y divide-slate-50">
            {financial_goals.map(g => (
              <div key={g.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">{g.name}</p>
                  <p className="text-xs text-slate-500">{g.goal_type} | ${Number(g.current_amount).toFixed(0)} / ${Number(g.target_amount).toFixed(0)}</p>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded ${g.status === 'active' ? 'bg-green-100 text-green-700' : g.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                  {g.status}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Dunning Log */}
      {dunning_log.length > 0 && (
        <Section title={`Dunning Log (${dunning_log.length})`} icon={CreditCard} defaultOpen={false}>
          <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
            {dunning_log.map((d, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-slate-700">Step {d.step}: {d.action}</span>
                <span className="text-xs text-slate-500">{new Date(d.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Impersonation Confirmation */}
      {confirmImpersonate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Impersonate User</h3>
            <p className="text-sm text-slate-600 mb-1">
              You are about to view the app as <strong>{user.email}</strong>.
            </p>
            <p className="text-xs text-amber-600 mb-4">This action will be logged in the audit trail.</p>
            <p className="text-sm text-slate-600 mb-4">
              A new browser tab will open where you'll be signed in as this user.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmImpersonate(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImpersonate}
                disabled={actionLoading === 'impersonate'}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {actionLoading === 'impersonate' ? 'Opening...' : 'Open as User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
