/**
 * Server-side SEO meta tag injection middleware.
 *
 * Reads the built index.html once at startup and replaces the
 * <!-- SEO_META_START --> ... <!-- SEO_META_END --> block with
 * per-route meta tags, Open Graph, Twitter Card, and JSON-LD.
 */

import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { getSeoForRoute, RouteSeoConfig } from '../config/seoConfig';

const BASE_URL = 'https://docuintelli.com';

// Cached index.html content — read once, reused for every request
let cachedHtml: string | null = null;

function getIndexHtml(distPath: string): string {
  if (!cachedHtml) {
    cachedHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8');
  }
  return cachedHtml;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMetaTags(seo: RouteSeoConfig): string {
  const canonicalUrl = `${BASE_URL}${seo.canonicalPath}`;
  const ogImage = seo.ogImage || `${BASE_URL}/og/default.png`;
  const ogType = seo.ogType || 'website';
  const twitterCard = seo.twitterCard || 'summary';
  const robotsContent = seo.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1';

  let tags = `<!-- SEO_META_START -->\n`;
  tags += `    <title>${escapeHtml(seo.title)}</title>\n`;
  tags += `    <meta name="description" content="${escapeHtml(seo.description)}" />\n`;
  tags += `    <meta name="robots" content="${robotsContent}" />\n`;
  tags += `    <link rel="canonical" href="${canonicalUrl}" />\n`;
  tags += `\n`;
  tags += `    <!-- Open Graph -->\n`;
  tags += `    <meta property="og:type" content="${ogType}" />\n`;
  tags += `    <meta property="og:title" content="${escapeHtml(seo.title)}" />\n`;
  tags += `    <meta property="og:description" content="${escapeHtml(seo.description)}" />\n`;
  tags += `    <meta property="og:url" content="${canonicalUrl}" />\n`;
  tags += `    <meta property="og:site_name" content="DocuIntelli AI" />\n`;
  tags += `    <meta property="og:image" content="${ogImage}" />\n`;
  tags += `    <meta property="og:image:width" content="1200" />\n`;
  tags += `    <meta property="og:image:height" content="630" />\n`;
  tags += `\n`;
  tags += `    <!-- Twitter Card -->\n`;
  tags += `    <meta name="twitter:card" content="${twitterCard}" />\n`;
  tags += `    <meta name="twitter:site" content="@docuintelli" />\n`;
  tags += `    <meta name="twitter:title" content="${escapeHtml(seo.title)}" />\n`;
  tags += `    <meta name="twitter:description" content="${escapeHtml(seo.description)}" />\n`;
  tags += `    <meta name="twitter:image" content="${ogImage}" />\n`;

  // JSON-LD structured data
  if (seo.jsonLd && seo.jsonLd.length > 0) {
    tags += `\n`;
    for (const schema of seo.jsonLd) {
      tags += `    <script type="application/ld+json">${JSON.stringify(schema)}</script>\n`;
    }
  }

  tags += `    <!-- SEO_META_END -->`;
  return tags;
}

export function createSeoMiddleware(distPath: string) {
  return (req: Request, res: Response, _next: NextFunction) => {
    const seo = getSeoForRoute(req.path);
    const html = getIndexHtml(distPath);

    // Replace the SEO meta block between the comment markers
    const metaBlockRegex = /<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/;
    const injectedHtml = html.replace(metaBlockRegex, buildMetaTags(seo));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(injectedHtml);
  };
}
