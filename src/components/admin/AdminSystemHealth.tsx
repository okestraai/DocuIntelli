import { useState, useEffect } from 'react';
import {
  Server, Mail, Database, CreditCard, Landmark, Smartphone,
  RefreshCw, CheckCircle, AlertTriangle, XCircle
} from 'lucide-react';
import { getAdminSystemHealth, type SystemHealth } from '../../lib/adminApi';

function HealthIndicator({ value, good = 90, warn = 70 }: { value: number; good?: number; warn?: number }) {
  const color = value >= good ? 'text-green-600' : value >= warn ? 'text-amber-600' : 'text-red-600';
  const Icon = value >= good ? CheckCircle : value >= warn ? AlertTriangle : XCircle;
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className={`text-sm font-semibold ${color}`}>{value}%</span>
    </div>
  );
}

function MetricCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Stat({ label, value, variant }: { label: string; value: React.ReactNode; variant?: 'good' | 'warn' | 'bad' }) {
  const colors = {
    good: 'text-green-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  };
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`text-sm font-semibold ${variant ? colors[variant] : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

export default function AdminSystemHealth() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHealth(); }, []);

  async function loadHealth() {
    try {
      setLoading(true);
      const data = await getAdminSystemHealth();
      setHealth(data);
    } catch (err) {
      console.error('Failed to load system health:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-white rounded-xl border border-slate-200" />)}
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={loadHealth}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Processing Queue */}
        <MetricCard title="Processing Queue" icon={Server}>
          <Stat
            label="Pending Documents"
            value={health.processingQueue.pending}
            variant={health.processingQueue.pending === 0 ? 'good' : health.processingQueue.pending < 5 ? 'warn' : 'bad'}
          />
          {health.processingQueue.oldestPendingAt && (
            <Stat
              label="Oldest Pending"
              value={new Date(health.processingQueue.oldestPendingAt).toLocaleString()}
            />
          )}
        </MetricCard>

        {/* Email Delivery */}
        <MetricCard title="Email Delivery" icon={Mail}>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-500">Last 24h</span>
                <HealthIndicator value={health.emailDelivery.last24h.rate} />
              </div>
              <Stat label="Sent" value={health.emailDelivery.last24h.sent} variant="good" />
              <Stat label="Failed" value={health.emailDelivery.last24h.failed} variant={health.emailDelivery.last24h.failed === 0 ? 'good' : 'bad'} />
            </div>
            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-500">Last 7d</span>
                <HealthIndicator value={health.emailDelivery.last7d.rate} />
              </div>
              <Stat label="Sent" value={health.emailDelivery.last7d.sent} variant="good" />
              <Stat label="Failed" value={health.emailDelivery.last7d.failed} variant={health.emailDelivery.last7d.failed === 0 ? 'good' : 'bad'} />
            </div>
          </div>
          {health.emailDelivery.recentErrors.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <p className="text-xs font-medium text-red-600 mb-1">Recent Errors</p>
              {health.emailDelivery.recentErrors.slice(0, 3).map((err, i) => (
                <div key={i} className="text-xs text-slate-600 py-1">
                  <span className="font-medium">{err.type}</span>: {err.error}
                </div>
              ))}
            </div>
          )}
        </MetricCard>

        {/* Embedding Coverage */}
        <MetricCard title="Embedding Coverage" icon={Database}>
          <Stat label="Total Documents" value={health.embeddings.totalDocuments} />
          <Stat label="Processed" value={health.embeddings.processedDocuments} />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-slate-600">Coverage</span>
            <HealthIndicator value={health.embeddings.coveragePercent} good={95} warn={80} />
          </div>
          <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                health.embeddings.coveragePercent >= 95 ? 'bg-green-500' :
                health.embeddings.coveragePercent >= 80 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${health.embeddings.coveragePercent}%` }}
            />
          </div>
        </MetricCard>

        {/* Dunning Pipeline */}
        <MetricCard title="Dunning Pipeline" icon={CreditCard}>
          <Stat label="Active (Healthy)" value={health.dunning.active} variant="good" />
          <Stat label="Past Due" value={health.dunning.pastDue} variant={health.dunning.pastDue === 0 ? 'good' : 'warn'} />
          <Stat label="Restricted" value={health.dunning.restricted} variant={health.dunning.restricted === 0 ? 'good' : 'bad'} />
          <Stat label="Downgraded" value={health.dunning.downgraded} variant={health.dunning.downgraded === 0 ? 'good' : 'bad'} />
        </MetricCard>

        {/* Plaid Connections */}
        <MetricCard title="Plaid Connections" icon={Landmark}>
          <Stat label="Connected Institutions" value={health.plaid.totalItems} />
          <Stat label="Total Accounts" value={health.plaid.totalAccounts} />
        </MetricCard>

        {/* Device Stats */}
        <MetricCard title="Devices" icon={Smartphone}>
          <Stat label="Total Devices" value={health.devices.total} />
          <Stat label="Active (7d)" value={health.devices.active} />
          <Stat label="Blocked" value={health.devices.blocked} variant={health.devices.blocked === 0 ? 'good' : 'warn'} />
        </MetricCard>
      </div>
    </div>
  );
}
