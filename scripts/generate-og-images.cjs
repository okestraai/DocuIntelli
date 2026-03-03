#!/usr/bin/env node
/**
 * OG Image Generator for DocuIntelli AI
 *
 * Generates Open Graph images (1200x630) as PNG files for social sharing.
 * Uses SVG → PNG conversion via sharp (if available) or outputs SVGs as fallback.
 *
 * Usage: node scripts/generate-og-images.js
 *
 * If sharp is not installed: npm install sharp --save-dev
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'og');

const BRAND = {
  emerald: '#059669',
  teal: '#0d9488',
  slate900: '#0f172a',
  slate600: '#475569',
  slate400: '#94a3b8',
  white: '#ffffff',
  bg: '#f8fafc',
  bgGreen: '#ecfdf5',
};

function createSvg(title, subtitle, features) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${BRAND.bg}"/>
      <stop offset="100%" stop-color="${BRAND.bgGreen}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${BRAND.emerald}"/>
      <stop offset="100%" stop-color="${BRAND.teal}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="6" fill="url(#accent)"/>
  <rect x="80" y="180" width="80" height="80" rx="16" fill="url(#accent)"/>
  <path d="M102 200h30l14 14v42a7 7 0 01-7 7H102a7 7 0 01-7-7V207a7 7 0 017-7z" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M132 200v14h14" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="190" y="215" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="700" fill="${BRAND.slate900}">DocuIntelli</text>
  <text x="610" y="215" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="700" fill="${BRAND.emerald}"> AI</text>
  <text x="190" y="260" font-family="system-ui, -apple-system, sans-serif" font-size="28" fill="${BRAND.slate600}">${title}</text>
  ${subtitle ? `<text x="190" y="330" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="${BRAND.slate400}">${subtitle}</text>` : ''}
  ${features ? `<text x="190" y="380" font-family="system-ui, -apple-system, sans-serif" font-size="18" fill="${BRAND.slate400}">${features}</text>` : ''}
  <text x="190" y="560" font-family="system-ui, -apple-system, sans-serif" font-size="20" fill="${BRAND.slate400}">docuintelli.com</text>
</svg>`;
}

const images = {
  'default.svg': createSvg(
    'AI-Powered Document Management',
    'Organize, understand, and act on your important documents.',
    'Secure Vault  ·  AI Chat  ·  Smart Reminders  ·  Financial Insights'
  ),
  'home.svg': createSvg(
    'AI-Powered Document Management for Families',
    'Store, understand, and manage all your legal and financial documents in one secure place.',
    'Secure Vault  ·  AI Chat  ·  Smart Reminders  ·  Financial Insights'
  ),
  'pricing.svg': createSvg(
    'Simple, Transparent Pricing',
    'Free · Starter $9/mo · Pro $19/mo',
    'Start free with 3 documents. Upgrade anytime for more storage and features.'
  ),
  'features.svg': createSvg(
    'Powerful Features for Document Management',
    'Secure Vault · AI Chat · Expiration Reminders · Financial Insights',
    'Bank-level encryption · OCR scanning · Auto-tagging · Life events planning'
  ),
  'logo.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <path d="M160 128h128l64 64v192a32 32 0 01-32 32H160a32 32 0 01-32-32V160a32 32 0 0132-32z" fill="none" stroke="white" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M288 128v64h64" fill="none" stroke="white" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M192 288h128M192 224h128M192 352h80" fill="none" stroke="white" stroke-width="20" stroke-linecap="round"/>
</svg>`,
};

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Write SVG files
for (const [filename, svg] of Object.entries(images)) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, svg);
  console.log(`  Created ${filepath}`);
}

// Try to convert to PNG using sharp
async function convertToPng() {
  try {
    const sharp = require('sharp');
    for (const filename of Object.keys(images)) {
      const svgPath = path.join(OUTPUT_DIR, filename);
      const pngName = filename.replace('.svg', '.png');
      const pngPath = path.join(OUTPUT_DIR, pngName);
      await sharp(svgPath).png().toFile(pngPath);
      console.log(`  Converted ${pngName}`);
    }
    console.log('\nPNG images generated successfully!');
  } catch (err) {
    console.log('\nNote: sharp is not installed. SVG files created as templates.');
    console.log('To generate PNG versions: npm install sharp && node scripts/generate-og-images.js');
    console.log('Or convert manually using any image editor (1200x630px for OG, 512x512 for logo).');
  }
}

convertToPng();
