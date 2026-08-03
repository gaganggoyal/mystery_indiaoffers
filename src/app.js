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
app.set('trust proxy', true);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(config.isProd ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

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
