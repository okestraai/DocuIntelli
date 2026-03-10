/**
 * LLM Routing Service
 *
 * Routes AI chat requests to the correct LLM provider based on user plan tier:
 *   - free:    local vLLM instance (Meta-Llama-3.1-8B)
 *   - starter: Together AI  (Qwen3-Next-80B)
 *   - pro:     Together AI  (Kimi-K2.5)
 */

// ── Environment ──────────────────────────────────────────────────────────────

const vllmChatUrl = process.env.VLLM_CHAT_URL || 'https://vllm-chat.docuintelli.com';
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID || '';
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET || '';
const togetherApiKey = process.env.TOGETHER_API_KEY || '';

const TOGETHER_BASE_URL = 'https://api.together.xyz';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LLMConfig {
  baseUrl: string;
  model: string;
  maxTokens: number;
  headers: Record<string, string>;
  /** Provider-specific params merged into the chat completion body */
  extraParams?: Record<string, any>;
}

// ── Token budget limits per plan (monthly) ───────────────────────────────────

export const TOKEN_LIMITS: Record<string, number> = {
  free: 50_000,
  starter: 500_000,
  pro: 2_000_000,
};

// ── Per-tier rate limits ─────────────────────────────────────────────────────

export interface RateLimitTier {
  perMinute: number;
  perHour: number;
  perDay: number;
}

export const RATE_LIMITS: Record<string, RateLimitTier> = {
  free:    { perMinute: 10, perHour: 50,  perDay: 200 },
  starter: { perMinute: 10, perHour: 50,  perDay: 200 },
  pro:     { perMinute: 20, perHour: 100, perDay: 1000 },
};

// ── Router ───────────────────────────────────────────────────────────────────

/**
 * Returns the LLM configuration for a given plan tier.
 * Throws if Together AI key is missing for paid tiers.
 */
export function getLLMConfig(plan: 'free' | 'starter' | 'pro'): LLMConfig {
  switch (plan) {
    case 'starter':
      if (!togetherApiKey) {
        console.error('[LLMRouter] TOGETHER_API_KEY not configured — falling back to vLLM');
        return freeTierConfig();
      }
      return {
        baseUrl: TOGETHER_BASE_URL,
        model: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
        maxTokens: 1024,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${togetherApiKey}`,
        },
      };

    case 'pro':
      if (!togetherApiKey) {
        console.error('[LLMRouter] TOGETHER_API_KEY not configured — falling back to vLLM');
        return freeTierConfig();
      }
      return {
        baseUrl: TOGETHER_BASE_URL,
        model: 'Qwen/Qwen3-Next-80B-A3B-Instruct',
        maxTokens: 3000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${togetherApiKey}`,
        },
      };

    case 'free':
    default:
      return freeTierConfig();
  }
}

function freeTierConfig(): LLMConfig {
  return {
    baseUrl: vllmChatUrl,
    model: 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
    maxTokens: 512,
    headers: {
      'Content-Type': 'application/json',
      'CF-Access-Client-Id': cfAccessClientId,
      'CF-Access-Client-Secret': cfAccessClientSecret,
    },
    extraParams: {
      repetition_penalty: 1.15,
    },
  };
}

/**
 * Estimate token count from a string.
 * Uses the ~4 chars per token heuristic (industry standard for English text).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
