'use strict';

/**
 * Double-submit-cookie CSRF protection for the admin panel.
 *
 * SameSite=Lax on the session cookie already blocks the common cross-site form
 * POST, but it is a single control and it does not cover a compromised or
 * attacker-controlled page on another *.indiaoffers.in host. Admin actions here
 * move money state and email clients, so they get a second, independent check.
 *
 * The token is a random value stored in its own cookie and echoed in a hidden
 * form field; an attacker on another origin can trigger a request but cannot
 * read the cookie to populate the field.
 */

const crypto = require('crypto');
const config = require('../config');

const COOKIE = 'em_csrf';
const FIELD = '_csrf';

function issueToken(req, res) {
  let token = req.cookies && req.cookies[COOKIE];
  if (!token || !/^[a-f0-9]{32}$/.test(token)) {
    token = crypto.randomBytes(16).toString('hex');
    res.cookie(COOKIE, token, {
      // Readable by the template layer only — the value is echoed into forms,
      // never read by client JS, so keep it HttpOnly.
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 7 * 864e5
    });
  }
  res.locals.csrfToken = token;
  return token;
}

/** Issues a token on every render so forms can embed it. */
function csrfToken(req, res, next) {
  issueToken(req, res);
  next();
}

/** Rejects state-changing requests whose form token doesn't match the cookie. */
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cookieToken = req.cookies && req.cookies[COOKIE];
  const formToken = (req.body && req.body[FIELD]) || req.get('x-csrf-token');

  const ok =
    cookieToken &&
    formToken &&
    cookieToken.length === formToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(formToken));

  if (!ok) {
    console.warn('[csrf] rejected %s %s from %s', req.method, req.originalUrl, req.ip);
    return res.status(403).send('Session expired or invalid request. Go back, reload the page, and try again.');
  }
  next();
}

module.exports = { csrfToken, csrfProtect, COOKIE, FIELD };
