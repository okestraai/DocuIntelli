// Engagement engine hooks — ported from web
import { useState, useEffect, useCallback } from 'react';
import {
  fetchTodayFeed,
  fetchWeeklyAudit,
  fetchDocumentHealth,
  updateDocumentMetadata,
  setReviewCadence,
  dismissGapSuggestion,
  TodayFeedResponse,
  WeeklyAuditData,
  DocumentHealthResponse,
} from '../lib/engagementApi';

export function useTodayFeed() {
  const [data, setData] = useState<TodayFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchTodayFeed();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load today feed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export function useWeeklyAudit() {
  const [data, setData] = useState<WeeklyAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchWeeklyAudit();
      setData(result.audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export function useDocumentHealth(documentId: string | null) {
  const [data, setData] = useState<DocumentHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!documentId) return;
    try {
      setLoading(true);
      setError(null);
      const result = await fetchDocumentHealth(documentId);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document health');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}

export function useEngagementActions() {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const updateMeta = async (documentId: string, metadata: {
    tags?: string[];
    issuer?: string;
    ownerName?: string;
    effectiveDate?: string;
    expirationDate?: string;
  }) => {
    setActionLoading('metadata');
    try {
      return await updateDocumentMetadata(documentId, metadata);
    } finally {
      setActionLoading(null);
    }
  };

  const setCadence = async (documentId: string, cadenceDays: number) => {
    setActionLoading('cadence');
    try {
      return await setReviewCadence(documentId, cadenceDays);
    } finally {
      setActionLoading(null);
    }
  };

  const dismissGap = async (key: string, sourceCategory: string, markedAsUploaded: boolean = false) => {
    setActionLoading('gap');
    try {
      return await dismissGapSuggestion(key, sourceCategory, markedAsUploaded);
    } finally {
      setActionLoading(null);
    }
  };

  return { actionLoading, updateMetadata: updateMeta, setCadence, dismissGap };
}
