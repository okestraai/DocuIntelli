import { useState, useEffect } from 'react';
import { Clock, BarChart3, AlertTriangle, RefreshCw } from 'lucide-react';
import { getAdminActivity, type ActivityData } from '../../lib/adminApi';

const TIME_RANGES = [
  { value: 24, label: 'Last 24h' },
  { value: 168, label: 'Last 7d' },
  { value: 720, label: 'Last 30d' },
];

export default function AdminActivity() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  useEffect(() => { loadActivity(); }, [hours]);

  async function loadActivity() {
    try {
      setLoading(true);
      const result = await getAdminActivity({ hours });
      setData(result);
    } catch (err) {
      console.error('Failed to load activity:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {TIME_RANGES.map(range => (
            <button
              key={range.value}
              onClick={() => setHours(range.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                hours === range.value
                  ? 'bg-red-50 text-red-600'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        <button
          onClick={loadActivity}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !data ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-48 bg-white rounded-xl border border-slate-200" />
          <div className="h-48 bg-white rounded-xl border border-slate-200" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Feature Usage Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Feature Usage</h3>
            </div>
            <div className="p-4">
              {Object.keys(data.featureBreakdown).length === 0 ? (
                <p className="text-sm text-slate-500">No activity in this period</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(data.featureBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([feature, count]) => {
                      const maxCount = Math.max(...Object.values(data.featureBreakdown));
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <div key={feature} className="flex items-center gap-3">
                          <span className="text-sm text-slate-700 w-36 truncate">{feature}</span>
                          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-medium text-slate-900 w-12 text-right">{count}</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Limit Violations */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900">Limit Violations ({data.violations.length})</h3>
            </div>
            {data.violations.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No violations in this period</p>
            ) : (
              <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                {data.violations.map((v, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-900 truncate">{v.email}</p>
                      <p className="text-xs text-slate-500">{v.limitType} ({v.currentValue}/{v.limitValue})</p>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">{new Date(v.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-900">Recent Activity ({data.recentActivity.length})</h3>
            </div>
            {data.recentActivity.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No activity in this period</p>
            ) : (
              <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                {data.recentActivity.map((act, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-900 truncate">{act.email}</p>
                      <p className="text-xs text-slate-500">{act.feature}</p>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">{new Date(act.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
