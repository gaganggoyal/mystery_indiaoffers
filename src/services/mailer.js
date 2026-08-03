'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (!config.mail.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined
    });
  }
  return transporter;
}

// Order links in email bodies carry a live access token. The no-SMTP fallback
// writes bodies to the console/journal, so strip tokens there — in production a
// missing SMTP_HOST must not turn the system log into a store of working
// credentials. Dev keeps them so links stay clickable from the terminal.
const redactTokens = body =>
  config.isProd ? String(body || '').replace(/([?&]t=)[A-Za-z0-9]+/g, '$1REDACTED') : body;

async function sendMail({ to, subject, text, html, attachments, replyTo }) {
  const t = getTransporter();
  if (!t) {
    console.log(
      '\n[mail:log]',
      {
        to,
        subject,
        text: redactTokens(text).slice(0, 400),
        attachments: (attachments || []).map(a => a.filename).join(', ') || undefined
      },
      '\n'
    );
    return { logged: true };
  }
  return t.sendMail({
    from: config.mail.from,
    // Client mail is usually sent from a noreply@ address for deliverability,
    // but the copy actively asks people to reply (a corrected UTR, a changed
    // SKU). Route those to the monitored support inbox instead of a black hole.
    replyTo: replyTo || config.mail.replyTo,
    to,
    subject,
    text,
    html,
    attachments
  });
}

module.exports = { sendMail };
