import { useState, useEffect, useCallback } from 'react';
import { ScrollText, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { getAdminAuditLog, type AuditLogEntry } from '../../lib/adminApi';

const ACTION_COLORS: Record<string, string> = {
  impersonate: 'bg-amber-100 text-amber-700',
  update_plan: 'bg-blue-100 text-blue-700',
  reset_ai_questions: 'bg-purple-100 text-purple-700',
  unblock_device: 'bg-green-100 text-green-700',
};

export default function AdminAuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getAdminAuditLog({ page, limit });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">Admin Actions ({total})</h3>
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-48 mx-auto mb-2" />
            <div className="h-4 bg-slate-200 rounded w-64 mx-auto" />
          </div>
        ) : logs.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No admin actions recorded yet</p>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 flex-shrink-0 ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-700'}`}>
                    {log.action.replace('_', ' ')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">
                      <span className="font-medium">{log.adminEmail}</span>
                      {log.targetEmail && (
                        <> &rarr; <span className="font-medium">{log.targetEmail}</span></>
                      )}
                    </p>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
                    {log.ipAddress && <p className="text-xs text-slate-400">{log.ipAddress}</p>}
                  </div>
                </div>
              ))}
            </div>

            {total > limit && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                <p className="text-sm text-slate-600">
                  {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}
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
          </>
        )}
      </div>
    </div>
  );
}
