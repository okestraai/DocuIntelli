/**
 * Global Chat API Route
 *
 * POST /api/global-chat — Pro-only cross-document AI chat with SSE streaming
 */

import { Router, Request, Response } from 'express';
import { loadSubscription, requireFeature, checkAIQuestionLimit, incrementAIQuestions } from '../middleware/subscriptionGuard';
import { detectImpersonation } from '../middleware/impersonation';
import {
  parseAtMention,
  retrieveContext,
  buildChatMessages,
  streamChatResponse,
  persistChatMessages,
  loadConversationHistory,
  DocRef,
} from '../services/globalChat';
import { query } from '../services/db';

const router = Router();

router.post(
  '/',
  loadSubscription,
  detectImpersonation,
  requireFeature('global_search'),
  checkAIQuestionLimit,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { question } = req.body;

      if (!question || typeof question !== 'string' || question.trim().length < 2) {
        res.status(400).json({ error: 'Question must be at least 2 characters' });
        return;
      }

      const sanitizedQuestion = question.trim().slice(0, 2000);

      console.log(`[GlobalChat] user=${userId.slice(0, 8)} question="${sanitizedQuestion.slice(0, 60)}"`);

      // ── Step 1: Fetch docs + history in parallel (both are independent DB queries) ──
      const [docsResult, history] = await Promise.all([
        query(
          'SELECT id, name FROM documents WHERE user_id = $1 ORDER BY name',
          [userId]
        ),
        loadConversationHistory(userId, 10),
      ]);

      const documents: DocRef[] = (docsResult.rows || []).map((d: any) => ({ id: d.id, name: d.name }));
      console.log(`[GlobalChat] docs=${documents.length} history=${history.length}`);

      // ── Step 2: Parse @-mention (instant) ──
      const { mentionedDocument, cleanedQuery } = parseAtMention(sanitizedQuestion, documents);
      if (mentionedDocument) {
        console.log(`[GlobalChat] @mention: "${mentionedDocument.name}" cleanedQuery="${cleanedQuery.slice(0, 60)}"`);
      }

      // ── Step 3: Retrieve context chunks (includes embedding generation) ──
      const { chunks, sources } = await retrieveContext(userId, cleanedQuery, mentionedDocument);
      console.log(`[GlobalChat] chunks=${chunks.length} sources=${sources.length}${chunks.length > 0 ? ` top_doc="${chunks[0].document_name}"` : ' (NO CONTEXT)'}`);

      // ── Step 4: Build messages + stream (sequential — depends on above) ──
      const messages = buildChatMessages(chunks, cleanedQuery, history);
      const fullAnswer = await streamChatResponse(res, messages, sources);

      // Persist messages and increment quota (fire-and-forget)
      // Skip entirely when impersonated — admin testing should be invisible to the user
      if (fullAnswer && !req.isImpersonated) {
        persistChatMessages(
          userId,
          sanitizedQuestion,
          fullAnswer,
          sources,
          mentionedDocument?.id
        ).catch(() => {});

        // Increment AI question counter for free tier (fire-and-forget)
        if (req.subscription?.plan === 'free') {
          query(
            'UPDATE user_subscriptions SET ai_questions_used = $1, updated_at = $2 WHERE id = $3',
            [(req.subscription.ai_questions_used || 0) + 1, new Date().toISOString(), req.subscription.id]
          ).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Global chat error:', error);
      // Only send error JSON if headers haven't been sent (SSE not started)
      if (!res.headersSent) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Chat failed',
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Unexpected error' })}\n\n`);
        res.end();
      }
    }
  }
);

export default router;
