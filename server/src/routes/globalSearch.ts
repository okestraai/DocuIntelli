/**
 * Global Search API Route
 *
 * POST /api/search — Pro-only hybrid search across all user documents
 */

import { Router, Request, Response } from 'express';
import { loadSubscription, requireFeature } from '../middleware/subscriptionGuard';
import { executeGlobalSearch } from '../services/globalSearch';

const router = Router();

router.post(
  '/',
  loadSubscription,
  requireFeature('global_search'),
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { query, category, tags, limit } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length < 2) {
        res.status(400).json({ error: 'Query must be at least 2 characters' });
        return;
      }

      // Sanitize inputs
      const sanitizedQuery = query.trim().slice(0, 500);
      const sanitizedCategory = typeof category === 'string' ? category : undefined;
      const sanitizedTags = Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string') : undefined;
      const sanitizedLimit = typeof limit === 'number' ? Math.min(Math.max(1, limit), 50) : 20;

      const result = await executeGlobalSearch(userId, sanitizedQuery, {
        category: sanitizedCategory,
        tags: sanitizedTags,
        limit: sanitizedLimit,
      });

      res.json(result);
    } catch (error) {
      console.error('Global search error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Search failed',
      });
    }
  }
);

export default router;
