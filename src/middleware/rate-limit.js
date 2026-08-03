'use strict';

/**
 * Rate limits for the routes that cost us something when abused:
 * admin login (credential brute force), booking (DB + outbound email flood),
 * payment posts (upload flood) and order lookup (order-code guessing).
 *
 * Behind nginx these key off the real client IP — see `trust proxy` in app.js.
 */

const rateLimit = require('express-rate-limit');

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  // Never rate-limit by a spoofable header; express resolves req.ip from the
  // trusted proxy hop only.
  keyGenerator: req => req.ip
};

/** Admin credential stuffing: 10 attempts per 15 min per IP. */
const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Try again in 15 minutes.'
});

/**
 * Booking writes a row and sends 2 emails: 8 per hour per IP.
 *
 * Only *successful* bookings count. A rejected one (missing fields, bad email,
 * unknown plan) writes nothing and sends nothing, so charging it against the
 * quota would let a few typos lock a real customer out — and would make the
 * smoke suite exhaust the limit on validation checks alone.
 */
const bookingLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 8,
  skipFailedRequests: true,
  message: 'Too many booking attempts from this network. Please try again later or WhatsApp support.'
});

/** Payment submissions incl. file uploads: 20 per hour per IP. */
const payLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many payment submissions. Please contact support.'
});

/** Order-code + email guessing on the public tracker: 30 per 15 min per IP. */
const trackLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many lookups. Please try again shortly.'
});

module.exports = { loginLimiter, bookingLimiter, payLimiter, trackLimiter };
