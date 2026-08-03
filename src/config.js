'use strict';

require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const config = {
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
  mail: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: /^(1|true|yes)$/i.test(process.env.SMTP_SECURE || ''),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from:
      process.env.SMTP_FROM ||
      'IndiaOffers E-Mystery <noreply@indiaoffers.in>'
  }
};

if (config.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev_only_change_in_production')) {
  console.error('[config] Set JWT_SECRET in production.');
  process.exit(1);
}

module.exports = config;
