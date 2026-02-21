import { useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown,
  Minus, FileText, ArrowRight, X, Lightbulb, Shield
} from 'lucide-react';
import { useTodayFeed, useEngagementActions } from '../hooks/useEngagement';
import type { TodayFeedItem } from '../lib/engagementApi';

interface TodayFeedProps {
  onNavigateToDocument?: (documentId: string) => void;
  onNavigateToAudit?: () => void;
  onAddDocument?: () => void;
}

export function TodayFeed({ onNavigateToDocument, onNavigateToAudit }: TodayFeedProps) {
  const { data, loading, error, refresh } = useTodayFeed();
  const { dismissGap } = useEngagementActions();
  const [showTooltip, setShowTooltip] = useState(false);

  if (loading) return <TodayFeedSkeleton />;
  if (error) return (
    <div className="text-center py-6">
      <p className="text-red-600 mb-2 text-sm">Failed to load today's feed</p>
      <button onClick={refresh} className="text-emerald-600 hover:text-emerald-700 font-medium text-sm">Retry</button>
    </div>
  );
  if (!data) return null;

  const { feed, preparedness } = data;
  const displayedFeed = feed.slice(0, 5);

  const handleDismissGap = async (key: string) => {
    await dismissGap(key, 'unknown');
    refresh();
  };

  const trendIcon = preparedness.trend === 'up'
    ? <TrendingUp className="h-3.5 w-3.5 text-green-600" />
    : preparedness.trend === 'down'
    ? <TrendingDown className="h-3.5 w-3.5 text-red-600" />
    : <Minus className="h-3.5 w-3.5 text-slate-400" />;

  const scoreColor = preparedness.score >= 75 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : preparedness.score >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';

  const barColor = preparedness.score >= 75 ? 'bg-emerald-500'
    : preparedness.score >= 50 ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
      {/* Header: Title + Preparedness Score Badge */}
      <div className="p-4 sm:p-5 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" />
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900">Today's Actions</h2>
            {displayedFeed.length > 0 && (
              <span className="text-xs text-slate-400 font-medium">{displayedFeed.length}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Preparedness Score — compact badge with tooltip */}
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-sm font-semibold ${scoreColor} transition-colors`}
              >
                <Shield className="h-3.5 w-3.5" />
                {preparedness.score}
                {trendIcon}
              </button>

              {showTooltip && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 text-white rounded-xl p-3 shadow-xl z-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-semibold">Vault Preparedness</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-2.5">
                    Score based on metadata completeness, expiration coverage, review freshness, and document health.
                  </p>
                  <div className="w-full bg-slate-700 rounded-full h-1.5 mb-2">
                    <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${preparedness.score}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{preparedness.score}/100</span>
                    <span>{preparedness.trend === 'up' ? 'Improving' : preparedness.trend === 'down' ? 'Declining' : 'Stable'} vs last week</span>
                  </div>
                  <div className="absolute -top-1.5 right-4 w-3 h-3 bg-slate-900 rotate-45" />
                </div>
              )}
            </div>

            {onNavigateToAudit && (
              <button
                onClick={onNavigateToAudit}
                className="text-emerald-600 hover:text-emerald-700 text-sm font-medium flex items-center gap-1"
              >
                Audit <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feed Items */}
      <div className="divide-y divide-slate-100">
        {displayedFeed.length === 0 ? (
          <div className="p-8 sm:p-10 text-center">
            <div className="relative w-14 h-14 mx-auto mb-4">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full" />
              <div className="relative bg-white rounded-full shadow-sm border border-emerald-200 w-full h-full flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-emerald-500" strokeWidth={1.5} />
              </div>
            </div>
            <p className="text-slate-800 font-semibold text-sm mb-1">All clear for today</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">Your vault is in good shape. We'll surface action items here when something needs your attention.</p>
          </div>
        ) : (
          displayedFeed.map((item, idx) => (
            <FeedRow
              key={idx}
              item={item}
              onAction={() => {
                if (item.type === 'gap' && item.gapKey) {
                  handleDismissGap(item.gapKey);
                } else if (item.documentId && onNavigateToDocument) {
                  onNavigateToDocument(item.documentId);
                }
              }}
              onNavigate={() => item.documentId && onNavigateToDocument?.(item.documentId)}
            />
          ))
        )}
      </div>

      {/* "View more" link if there are more than 5 items */}
      {feed.length > 5 && onNavigateToAudit && (
        <div className="p-3 border-t border-slate-100 text-center">
          <button
            onClick={onNavigateToAudit}
            className="text-emerald-600 hover:text-emerald-700 text-xs font-medium"
          >
            {feed.length - 5} more items — View Full Audit
          </button>
        </div>
      )}
    </div>
  );
}

function FeedRow({ item, onAction, onNavigate }: {
  item: TodayFeedItem;
  onAction: () => void;
  onNavigate: () => void;
}) {
  const icon = {
    critical: <AlertTriangle className="h-4 w-4 text-red-500" />,
    warning: <Clock className="h-4 w-4 text-amber-500" />,
    info: <Lightbulb className="h-4 w-4 text-emerald-500" />,
  };

  return (
    <div className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex-shrink-0">{icon[item.severity]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 font-medium truncate">{item.title}</p>
        {item.documentName && (
          <button
            onClick={onNavigate}
            className="text-xs text-slate-500 hover:text-emerald-600 truncate flex items-center gap-1 mt-0.5"
          >
            <FileText className="h-3 w-3 flex-shrink-0" /> {item.documentName}
          </button>
        )}
      </div>
      <div className="flex-shrink-0">
        {item.type === 'action' && item.actionType === 'update_metadata' && (
          <button
            onClick={onNavigate}
            className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-medium px-2.5 py-1 rounded-md transition-colors"
          >
            Update
          </button>
        )}
        {item.type === 'gap' && (
          <button
            onClick={onAction}
            className="text-slate-400 hover:text-slate-600"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {item.type === 'risk' && item.documentId && (
          <button
            onClick={onNavigate}
            className="text-xs text-slate-500 hover:text-emerald-600 font-medium"
          >
            View
          </button>
        )}
      </div>
    </div>
  );
}

function TodayFeedSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 animate-pulse">
      <div className="p-4 sm:p-5 border-b border-slate-100">
        <div className="h-5 bg-slate-200 rounded w-32" />
      </div>
      <div className="divide-y divide-slate-100">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="h-4 w-4 bg-slate-200 rounded" />
            <div className="flex-1">
              <div className="h-4 bg-slate-200 rounded w-48 mb-1" />
              <div className="h-3 bg-slate-200 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
