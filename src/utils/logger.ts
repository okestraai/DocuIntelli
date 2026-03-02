/**
 * Development-only logger. All calls are no-ops in production builds.
 * Vite statically replaces import.meta.env.DEV at build time,
 * so the entire function body is tree-shaken in production.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  error: (...args: unknown[]) => { if (isDev) console.error(...args); },
};
