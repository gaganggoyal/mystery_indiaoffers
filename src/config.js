'use strict';

require('dotenv').config();

const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const rootDir = path.join(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');

const config = {
  paths: {
    root: rootDir,
    data: dataDir,
    // Private: payment proofs contain customer bank details. Never under public/.
    UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(dataDir, 'uploads')
  },
  port: parseInt(process.env.PORT || '3100', 10),
  isProd,
  // Production host for this product (subdomain of IndiaOffers)
  host: process.env.SITE_HOST || 'mystery.indiaoffers.in',
  siteUrl:
    process.env.SITE_URL ||
    (isProd ? 'https://mystery.indiaoffers.in' : 'http://localhost:3100'),
  siteName: process.env.SITE_NAME || 'IndiaOffers E-Mystery',
  jwtSecret: process.env.JWT_SECRET || 'dev_only_change_in_production',
  company: {
    name: process.env.COMPANY_NAME || 'IndiaOffers.in',
    url: process.env.COMPANY_URL || 'https://indiaoffers.in',
    tagline: "A product of IndiaOffers.in — India's savings & shopping intelligence brand"
  },
  support: {
    email: process.env.SUPPORT_EMAIL || 'care@indiaoffers.in',
    whatsapp: process.env.SUPPORT_WHATSAPP || '919569608101',
    whatsappDigits: (process.env.SUPPORT_WHATSAPP || '919569608101').replace(/\D/g, '')
  },
  payment: {
    upiId: process.env.MYSTERY_UPI_ID || 'indiaoffers@upi',
    upiName: process.env.MYSTERY_UPI_NAME || 'IndiaOffers',
    bankName: process.env.MYSTERY_BANK_NAME || 'IndiaOffers',
    bankAccount: process.env.MYSTERY_BANK_ACCOUNT || '',
    bankIfsc: process.env.MYSTERY_BANK_IFSC || '',
    bank: process.env.MYSTERY_BANK || ''
  },
  testPayEnabled:
    process.env.NODE_ENV !== 'production' ||
    /^(1|true|yes)$/i.test(process.env.MYSTERY_TEST_PAY || ''),

  // Review each booking before asking for money (default on).
  //
  // The deposit is derived from `approx_cart`, which the client types in — and
  // on Customized they fund 100% of it — so quoting after a human has read the
  // brief avoids under-collecting and lets unsuitable work be declined before
  // any payment. Set MYSTERY_REVIEW_BEFORE_PAY=0 to send clients straight to
  // the pay page with the auto-calculated figures instead.
  reviewBeforePay: !/^(0|false|no)$/i.test(process.env.MYSTERY_REVIEW_BEFORE_PAY || ''),
  reviewSlaHours: parseInt(process.env.MYSTERY_REVIEW_SLA_HOURS || '24', 10),
  mail: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: /^(1|true|yes)$/i.test(process.env.SMTP_SECURE || ''),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from:
      process.env.SMTP_FROM ||
      'IndiaOffers E-Mystery <noreply@indiaoffers.in>',
    // Where replies land. Defaults to the support address, since the
    // transactional copy repeatedly invites the client to reply.
    replyTo: process.env.SMTP_REPLY_TO || process.env.SUPPORT_EMAIL || 'care@indiaoffers.in'
  }
};

// ── Production safety checks ────────────────────────────────────────────
// These run before the server binds. A misconfigured production boot is a
// security incident, not a warning, so anything unsafe exits non-zero and
// lets systemd surface the failure instead of silently serving traffic.

// Secrets that ship in the repo / docs and must never reach production.
const WEAK_SECRETS = new Set([
  'dev_only_change_in_production',
  'dev_local_only_change_for_production',
  'change-me-to-a-long-random-string',
  'changeme',
  'secret'
]);

if (config.isProd) {
  const fatal = [];
  const warn = [];

  const secret = process.env.JWT_SECRET || '';
  if (!secret) {
    fatal.push('JWT_SECRET is not set.');
  } else if (WEAK_SECRETS.has(secret.trim().toLowerCase())) {
    fatal.push('JWT_SECRET is a known placeholder value from .env.example / docs.');
  } else if (secret.length < 32) {
    fatal.push(`JWT_SECRET is too short (${secret.length} chars, need >= 32).`);
  }

  // A localhost SITE_URL in production silently breaks every emailed pay
  // link and report link, so treat it as fatal rather than shipping dead URLs.
  if (!/^https:\/\//i.test(config.siteUrl)) {
    fatal.push(`SITE_URL must be an https:// URL in production (got "${config.siteUrl}").`);
  } else if (/localhost|127\.0\.0\.1/i.test(config.siteUrl)) {
    fatal.push(`SITE_URL still points at localhost (got "${config.siteUrl}").`);
  }

  // Free-order switch. Recoverable only by turning it off, so refuse to boot.
  if (config.testPayEnabled) {
    fatal.push('MYSTERY_TEST_PAY is enabled — anyone could mark an order paid. Unset it.');
  }

  if (!config.payment.upiId || config.payment.upiId === 'indiaoffers@upi') {
    warn.push('MYSTERY_UPI_ID is unset or still the placeholder — the pay page will show a demo UPI ID.');
  }
  if (!config.mail.host) {
    warn.push('No SMTP_HOST — customer emails will only be written to the log, not delivered.');
  }

  for (const w of warn) console.warn('[config] WARNING:', w);
  if (fatal.length) {
    console.error('\n[config] Refusing to start in production:');
    for (const f of fatal) console.error('  ✗', f);
    console.error('\n  Fix these in your .env or systemd EnvironmentFile, then restart.\n');
    process.exit(1);
  }
}

module.exports = config;
