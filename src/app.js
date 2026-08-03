'use strict';

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const config = require('./config');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Exactly one proxy hop (nginx on the same VPS). `true` would trust any
// client-supplied X-Forwarded-For and let attackers spoof IPs past rate limits.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    // Self-hosted CSS/JS only, plus inline styles the EJS templates already use.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
  })
);
// Order/pay/report URLs carry a private access token in ?t=. Logging it verbatim
// would put a working credential into journald and any log shipper, so redact
// the query string before morgan ever formats the line.
morgan.token('url', req => {
  const url = req.originalUrl || req.url;
  const q = url.indexOf('?');
  if (q === -1) return url;
  const params = new URLSearchParams(url.slice(q + 1));
  if (params.has('t')) params.set('t', 'REDACTED');
  const rest = params.toString();
  return url.slice(0, q) + (rest ? '?' + rest : '');
});
app.use(morgan(config.isProd ? 'combined' : 'dev'));
// Bound request bodies; nothing here legitimately posts more than a few KB.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProd ? '7d' : 0,
    // Uploads moved out of public/, but stay explicit in case a stray file lands.
    dotfiles: 'ignore'
  })
);

const { getPlan, formatInr: fmtInr } = require('./data/plans');
app.use((req, res, next) => {
  res.locals.siteName = config.siteName;
  res.locals.siteUrl = config.siteUrl;
  res.locals.siteHost = config.host;
  res.locals.company = config.company;
  res.locals.support = config.support;
  res.locals.path = req.path;
  res.locals.year = new Date().getFullYear();
  // Safe defaults for footer / fab (public routes also set these)
  if (!res.locals.formatInr) res.locals.formatInr = fmtInr;
  if (!res.locals.fullPlan) res.locals.fullPlan = getPlan('full');
  next();
});

app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page not found',
    config,
    plans: require('./data/plans').PLANS
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong. Please try again or WhatsApp support.');
});

module.exports = app;
