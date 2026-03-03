import { useState, useEffect, useRef } from 'react';
import {
  Server, Mail, Database, CreditCard, Landmark, Smartphone,
  RefreshCw, CheckCircle, AlertTriangle, XCircle, FileWarning,
  Clock, Play, Loader2, ChevronDown, ChevronUp, Search, User, Globe
} from 'lucide-react';
import {
  getAdminSystemHealth, getAdminProblemDocuments, reprocessDocument, triggerCronJobs, getAdminUsers,
  type SystemHealth, type ProblemDocuments, type ProblemDocument, type CronJobResult, type AdminUser
} from '../../lib/adminApi';

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

function MetricCard({ title, icon: Icon, badge, actions, children }: {
  title: string; icon: React.ElementType; badge?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {badge}
        {actions && <div className="ml-auto">{actions}</div>}
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

function ProblemDocTable({ docs, processing, onReprocess, label }: {
  docs: ProblemDocument[];
  processing: Set<string>;
  onReprocess: (id: string) => void;
  label: string;
}) {
  const [expanded, setExpanded] = useState(docs.length <= 5);

  if (docs.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2 hover:text-slate-900"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {label} ({docs.length})
      </button>
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Document</th>
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">User</th>
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Type</th>
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Uploaded</th>
                {docs[0]?.totalChunks !== undefined && (
                  <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Chunks</th>
                )}
                <th className="text-right py-1.5 px-2 text-slate-500 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-1.5 px-2 text-slate-900 font-medium max-w-[200px] truncate">{doc.name}</td>
                  <td className="py-1.5 px-2 text-slate-600 max-w-[150px] truncate">{doc.userEmail}</td>
                  <td className="py-1.5 px-2 text-slate-600">{doc.type?.split('/').pop() || '-'}</td>
                  <td className="py-1.5 px-2 text-slate-600">{new Date(doc.createdAt).toLocaleDateString()}</td>
                  {doc.totalChunks !== undefined && (
                    <td className="py-1.5 px-2 text-slate-600">
                      <span className="text-red-600">{doc.nullEmbeddings}</span>/{doc.totalChunks}
                    </td>
                  )}
                  <td className="py-1.5 px-2 text-right">
                    <button
                      onClick={() => onReprocess(doc.id)}
                      disabled={processing.has(doc.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processing.has(doc.id) ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Processing</>
                      ) : (
                        <><RefreshCw className="h-3 w-3" /> Reprocess</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CRON_JOB_LABELS: Record<string, string> = {
  'ai-questions-reset': 'AI Questions Reset',
  'preparedness-snapshots': 'Preparedness Snapshots',
  'data-cleanup': 'Data Cleanup',
  'life-event-readiness': 'Life Event Readiness',
  'goal-deadline-check': 'Goal Deadline Check',
  'stripe-billing-sync': 'Stripe Billing Sync',
  'dunning-escalation': 'Dunning Escalation',
  'expiration-notifications': 'Expiration Notifications',
  'review-cadence-reminders': 'Review Cadence Reminders',
  'weekly-audit-email': 'Weekly Audit Email',
  'stuck-docs-processing': 'Stuck Docs Processing',
};

// Jobs that always run globally regardless of user selection
const GLOBAL_ONLY_JOBS_UI = new Set(['dunning-escalation', 'data-cleanup']);

export default function AdminSystemHealth() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [problems, setProblems] = useState<ProblemDocuments | null>(null);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [cronResults, setCronResults] = useState<CronJobResult[] | null>(null);
  const [cronRunning, setCronRunning] = useState(false);
  const [cronSingleRunning, setCronSingleRunning] = useState<string | null>(null);
  const [cronUserId, setCronUserId] = useState<string | undefined>(undefined);
  const [cronUserSearch, setCronUserSearch] = useState('');
  const [cronUserResults, setCronUserResults] = useState<AdminUser[]>([]);
  const [cronUserSearching, setCronUserSearching] = useState(false);
  const [cronUserLabel, setCronUserLabel] = useState('All Users');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadHealth(); loadProblems(); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  async function loadProblems() {
    try {
      setProblemsLoading(true);
      const data = await getAdminProblemDocuments();
      setProblems(data);
    } catch (err) {
      console.error('Failed to load problem documents:', err);
    } finally {
      setProblemsLoading(false);
    }
  }

  async function handleReprocess(documentId: string) {
    setProcessing((prev) => new Set(prev).add(documentId));
    try {
      await reprocessDocument(documentId);
      // Reload problems list after successful reprocess
      await loadProblems();
    } catch (err) {
      console.error('Reprocess failed:', err);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  }

  async function handleReprocessAll() {
    if (!problems) return;
    const allDocs = [...problems.unprocessed, ...problems.noChunks, ...problems.missingEmbeddings];
    // Deduplicate by id
    const seen = new Set<string>();
    const unique = allDocs.filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true; });
    for (const doc of unique) {
      await handleReprocess(doc.id);
    }
  }

  async function handleTriggerAllCron() {
    setCronRunning(true);
    setCronResults(null);
    try {
      const data = await triggerCronJobs(undefined, cronUserId);
      setCronResults(data.results);
    } catch (err) {
      console.error('Failed to trigger cron jobs:', err);
    } finally {
      setCronRunning(false);
    }
  }

  async function handleTriggerSingleCron(jobName: string) {
    setCronSingleRunning(jobName);
    try {
      const data = await triggerCronJobs(jobName, cronUserId);
      // Merge single result into existing results
      setCronResults((prev) => {
        if (!prev) return data.results;
        const updated = prev.filter((r) => r.job !== jobName);
        return [...updated, ...data.results];
      });
    } catch (err) {
      console.error(`Failed to trigger ${jobName}:`, err);
    } finally {
      setCronSingleRunning(null);
    }
  }

  async function handleCronUserSearch(searchTerm: string) {
    setCronUserSearch(searchTerm);
    if (searchTerm.length < 2) {
      setCronUserResults([]);
      return;
    }
    setCronUserSearching(true);
    try {
      const data = await getAdminUsers({ search: searchTerm, limit: 10 });
      setCronUserResults(data.users);
    } catch (err) {
      console.error('User search failed:', err);
    } finally {
      setCronUserSearching(false);
    }
  }

  function selectCronUser(user: AdminUser | null) {
    if (user) {
      setCronUserId(user.id);
      setCronUserLabel(user.email);
    } else {
      setCronUserId(undefined);
      setCronUserLabel('All Users');
    }
    setCronUserSearch('');
    setCronUserResults([]);
    setShowUserDropdown(false);
    setCronResults(null); // Clear previous results when user changes
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-white rounded-xl border border-slate-200" />)}
      </div>
    );
  }

  if (!health) return null;

  const totalProblems = problems?.summary.total || 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { loadHealth(); loadProblems(); }}
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

      {/* Document Issues */}
      <MetricCard
        title="Document Issues"
        icon={FileWarning}
        badge={
          totalProblems > 0 ? (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
              {totalProblems}
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">
              All clear
            </span>
          )
        }
        actions={
          totalProblems > 0 ? (
            <button
              onClick={handleReprocessAll}
              disabled={processing.size > 0}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {processing.size > 0 ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Processing...</>
              ) : (
                <><RefreshCw className="h-3 w-3" /> Reprocess All</>
              )}
            </button>
          ) : undefined
        }
      >
        {problemsLoading ? (
          <div className="flex items-center justify-center py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...
          </div>
        ) : !problems || totalProblems === 0 ? (
          <div className="flex items-center justify-center py-6 text-sm text-slate-500">
            <CheckCircle className="h-4 w-4 text-green-500 mr-2" /> All documents are properly processed
          </div>
        ) : (
          <div>
            <div className="flex gap-4 mb-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-slate-600">Unprocessed: {problems.summary.unprocessed}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-slate-600">No Chunks: {problems.summary.noChunks}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-slate-600">Missing Embeddings: {problems.summary.missingEmbeddings}</span>
              </div>
            </div>
            <ProblemDocTable docs={problems.unprocessed} processing={processing} onReprocess={handleReprocess} label="Unprocessed" />
            <ProblemDocTable docs={problems.noChunks} processing={processing} onReprocess={handleReprocess} label="No Chunks" />
            <ProblemDocTable docs={problems.missingEmbeddings} processing={processing} onReprocess={handleReprocess} label="Missing Embeddings" />
          </div>
        )}
      </MetricCard>

      {/* Cron Jobs */}
      <MetricCard
        title="Cron Jobs"
        icon={Clock}
        actions={
          <button
            onClick={handleTriggerAllCron}
            disabled={cronRunning}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {cronRunning ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Running All...</>
            ) : (
              <><Play className="h-3 w-3" /> Run All Jobs</>
            )}
          </button>
        }
      >
        {/* User scope selector */}
        <div className="mb-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-600 mb-1.5">
            <User className="h-3.5 w-3.5" />
            <span className="font-medium">Run scope:</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              cronUserId ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {cronUserId ? <User className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
              {cronUserLabel}
            </span>
            {cronUserId && (
              <button
                onClick={() => selectCronUser(null)}
                className="text-slate-400 hover:text-slate-600 text-xs underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative" ref={userDropdownRef}>
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={cronUserSearch}
                  onChange={(e) => handleCronUserSearch(e.target.value)}
                  onFocus={() => setShowUserDropdown(true)}
                  placeholder="Search by email to scope jobs to a user..."
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
                {cronUserSearching && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-blue-500 animate-spin" />
                )}
              </div>
            </div>
            {showUserDropdown && cronUserResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {cronUserResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => selectCronUser(user)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 border-b border-slate-50 last:border-0"
                  >
                    <span className="font-medium text-slate-900">{user.email}</span>
                    {user.displayName && (
                      <span className="text-slate-500 ml-1.5">({user.displayName})</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Job</th>
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Status</th>
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Duration</th>
                <th className="text-left py-1.5 px-2 text-slate-500 font-medium">Result</th>
                <th className="text-right py-1.5 px-2 text-slate-500 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CRON_JOB_LABELS).map(([key, label]) => {
                const result = cronResults?.find((r) => r.job === key);
                const isRunning = cronRunning || cronSingleRunning === key;
                const isGlobalOnly = GLOBAL_ONLY_JOBS_UI.has(key);
                return (
                  <tr key={key} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 px-2 text-slate-900 font-medium">
                      {label}
                      {cronUserId && isGlobalOnly && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700" title="This job always runs globally">
                          <Globe className="h-2.5 w-2.5" /> Global
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1 text-blue-600">
                          <Loader2 className="h-3 w-3 animate-spin" /> Running
                        </span>
                      ) : result ? (
                        result.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3 w-3" /> Success
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <XCircle className="h-3 w-3" /> Error
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {result ? `${(result.duration / 1000).toFixed(1)}s` : '-'}
                    </td>
                    <td className="py-2 px-2 text-slate-600 max-w-[200px] truncate">
                      {result?.status === 'success' && result.result
                        ? Object.entries(result.result).map(([k, v]) => `${k}: ${v}`).join(', ')
                        : result?.error || '-'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => handleTriggerSingleCron(key)}
                        disabled={isRunning}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cronSingleRunning === key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Run
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cronResults && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 text-xs">
            <span className="text-slate-500">Last run summary:</span>
            <span className="text-green-600 font-medium">
              {cronResults.filter((r) => r.status === 'success').length} succeeded
            </span>
            {cronResults.filter((r) => r.status === 'error').length > 0 && (
              <span className="text-red-600 font-medium">
                {cronResults.filter((r) => r.status === 'error').length} failed
              </span>
            )}
            <span className="text-slate-500">
              Total: {(cronResults.reduce((sum, r) => sum + r.duration, 0) / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </MetricCard>
    </div>
  );
}
