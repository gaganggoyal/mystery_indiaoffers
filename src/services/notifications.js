'use strict';

/**
 * Transactional emails shared by the public and admin routes.
 *
 * Voice: we're a research firm writing to a founder or marketplace seller, not
 * a consumer brand. Lead with what they need to know, name specifics, explain
 * the reason behind any wait, and never manufacture enthusiasm. Every message
 * should answer "what happens next, and what do I owe" without being asked.
 *
 * Internal (support@) copies stay terse and scannable — different reader,
 * different job: they're work-queue items, not correspondence.
 *
 * Every send is best-effort: a bounced notification must never roll back an
 * order state change the client already completed, so callers get a resolved
 * promise either way and failures are logged.
 */

const config = require('../config');
const { sendMail } = require('./mailer');
const { formatInr, getPlan } = require('../data/plans');
const upi = require('./upi');

const esc = s =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const orderTotal = order => (order.price_inr || 0) + (order.product_deposit_inr || 0);
const trackUrl = order => `${config.siteUrl}/order/${order.order_code}?t=${order.access_token}`;
const payUrlFor = order => `${config.siteUrl}/pay/${order.order_code}?t=${order.access_token}`;

function send(args) {
  return sendMail(args).catch(err => {
    console.error('[mail] failed:', args.subject, '-', err && err.message);
  });
}

function parseJson(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

// ── HTML building blocks ──────────────────────────────────────────────────
// Table layout and inline styles throughout: Gmail and Outlook strip <style>
// blocks and ignore most modern CSS.

const INK = '#0f172a';
const MUTED = '#475569';
const FAINT = '#94a3b8';
const LINE = '#e2e8f0';
const BRAND = '#4f46e5';
const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';

/** Key/value summary block — order details, cost breakdown. */
function summary(rows) {
  const cells = rows
    .filter(Boolean)
    .map(
      ([label, value, strong]) =>
        `<tr>` +
        `<td style="padding:7px 0;font:14px/1.5 ${FONT};color:${MUTED};white-space:nowrap">${esc(label)}</td>` +
        `<td style="padding:7px 0 7px 16px;text-align:right;font:${strong ? '700' : '400'} 14px/1.5 ${FONT};color:${INK};word-break:break-word">${esc(value)}</td>` +
        `</tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
    style="border:1px solid ${LINE};border-radius:10px;padding:12px 16px">${cells}</table>`;
}

/** Tinted callout for the one thing we most want read. */
function callout(title, body, tone) {
  const tones = {
    violet: ['#f5f3ff', '#ddd6fe', '#5b21b6', '#4c1d95'],
    amber: ['#fffbeb', '#fde68a', '#92400e', '#78350f'],
    green: ['#f0fdf4', '#bbf7d0', '#166534', '#14532d'],
    slate: ['#f8fafc', LINE, INK, '#334155']
  };
  const [bg, border, head, text] = tones[tone] || tones.slate;
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="background:${bg};border:1px solid ${border};border-radius:10px">
    <tr><td style="padding:15px 17px">
      ${title ? `<p style="margin:0 0 7px;font:700 14px ${FONT};color:${head}">${title}</p>` : ''}
      <p style="margin:0;font:14px/1.65 ${FONT};color:${text}">${body}</p>
    </td></tr></table>`;
}

function button(url, label, secondary) {
  return secondary
    ? `<a href="${esc(url)}" style="display:inline-block;padding:11px 21px;border:1px solid #cbd5e1;
         color:${INK};border-radius:9px;font:600 14px ${FONT};text-decoration:none">${label}</a>`
    : `<a href="${esc(url)}" style="display:inline-block;padding:13px 24px;background:${BRAND};color:#fff;
         border-radius:9px;font:700 15px ${FONT};text-decoration:none">${label}</a>`;
}

/**
 * Page shell. `sections` is an array of HTML strings, each rendered with
 * consistent horizontal padding and vertical rhythm.
 */
function shell({ greeting, lede, sections = [], cta, footnote }) {
  const body = sections
    .filter(Boolean)
    .map(s => `<tr><td style="padding:18px 26px 0">${s}</td></tr>`)
    .join('');

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:24px 12px;background:#f1f5f9">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
  style="max-width:540px;margin:0 auto;background:#fff;border:1px solid ${LINE};border-radius:14px">
  <tr><td style="padding:28px 26px 0">
    <p style="margin:0 0 6px;font:700 19px/1.3 ${FONT};color:${INK}">${esc(greeting)}</p>
    <p style="margin:0;font:15px/1.65 ${FONT};color:${MUTED}">${lede}</p>
  </td></tr>
  ${body}
  ${
    cta
      ? `<tr><td style="padding:22px 26px 0;text-align:center">${cta}</td></tr>`
      : ''
  }
  <tr><td style="padding:22px 26px 26px;border-top:1px solid ${LINE};margin-top:10px">
    ${footnote ? `<p style="margin:0 0 12px;font:13px/1.6 ${FONT};color:${MUTED}">${footnote}</p>` : ''}
    <p style="margin:0;font:12px/1.6 ${FONT};color:${FAINT}">
      <b style="color:${MUTED}">IndiaOffers E-Mystery</b> — independent mystery shopping<br>
      A product of ${esc(config.company.name)} · Private research, shared only with you
    </p>
  </td></tr>
</table>
</body></html>`;
}

// ── Client-facing emails ──────────────────────────────────────────────────

/**
 * Booking received, going into human review.
 *
 * Quotes no amount on purpose. The figures on the booking form come from a
 * client-typed cart estimate; committing to them before anyone has read the
 * brief is how you under-collect on Customized orders. The copy reframes that
 * wait as the accuracy check it actually is.
 */
async function bookingReceived(order, { serviceFee, productDeposit }) {
  const hours = config.reviewSlaHours;
  const indicative = serviceFee + productDeposit;

  await send({
    to: order.client_email,
    subject: `${order.order_code} — your mystery shop request is with our team`,
    text:
      `Hi ${order.client_name},\n\n` +
      `We have your request to shop ${order.brand_url}.\n\n` +
      `Before we quote, a researcher reads the brief properly — the SKU you've pointed ` +
      `us at, where it ships, and whether it can actually be returned. That check is what ` +
      `keeps the figure we send you accurate, the product budget especially.\n\n` +
      `You'll have a confirmed quote and a payment link within ${hours} working hours.\n\n` +
      `  Order   ${order.order_code}\n` +
      `  Plan    ${order.plan_name}\n` +
      `  Store   ${order.brand_url}\n\n` +
      `Nothing is payable yet, and nothing is committed until you decide to pay. ` +
      `Based on what you entered we'd expect around ${formatInr(indicative)}, though the ` +
      `confirmed figure can move once we've seen the real cart price.\n\n` +
      `If anything has changed — a different SKU, another delivery city, a deadline we ` +
      `should work to — reply to this email and we'll build it in before quoting.\n\n` +
      `Track this order: ${trackUrl(order)}\n\n` +
      `— IndiaOffers E-Mystery`,
    html: shell({
      greeting: `Hi ${order.client_name},`,
      lede: `We have your request to shop <b style="color:${INK}">${esc(order.brand_url)}</b>.`,
      sections: [
        summary([
          ['Order', order.order_code],
          ['Plan', order.plan_name],
          ['Store', order.brand_url]
        ]),
        callout(
          `Before we quote you`,
          `A researcher reads the brief properly — the SKU you've pointed us at, where it ` +
            `ships, and whether it can actually be returned. That check is what keeps the ` +
            `figure we send you accurate, the product budget especially.<br><br>` +
            `You'll have a confirmed quote and a payment link <b>within ${esc(hours)} working hours</b>.`,
          'violet'
        ),
        `<p style="margin:0;font:15px/1.7 ${FONT};color:${MUTED}">
           <b style="color:${INK}">Nothing is payable yet</b>, and nothing is committed until you
           decide to pay. Based on what you entered we'd expect around
           <b style="color:${INK}">${esc(formatInr(indicative))}</b> — the confirmed figure can
           move once we've seen the real cart price.
         </p>`
      ],
      cta: button(trackUrl(order), 'Track this order', true),
      footnote:
        `Something changed — a different SKU, another delivery city, a deadline we should ` +
        `work to? Reply to this email and we'll build it in before quoting.`
    })
  });

  await send({
    to: config.support.email,
    subject: `[E-Mystery] REVIEW ${order.order_code} — ${order.plan_name} (~${formatInr(indicative)})`,
    text:
      `REVIEW REQUIRED — ${hours}h SLA\n\n` +
      `${order.client_name} <${order.client_email}>\n` +
      `${order.brand_url}\n` +
      `Plan: ${order.plan_name}\n\n` +
      `Indicative: service ${formatInr(serviceFee)} + deposit ${formatInr(productDeposit)} = ${formatInr(indicative)}\n` +
      `The deposit came from the client's own cart estimate — check it against the real\n` +
      `product page before sending the link.\n\n` +
      `Set the figures and release the payment link:\n${config.siteUrl}/admin/orders/${order.id}`
  });
}

/**
 * Review complete — the quote and the payment link.
 *
 * Carries a UPI QR for the exact amount. Scanning prefills payee and amount so
 * neither can be mistyped, which is what makes payments reconcile cleanly
 * against the statement later.
 */
async function orderCreated(order, { serviceFee, productDeposit, reviewNote }) {
  const total = serviceFee + productDeposit;
  const payUrl = payUrlFor(order);
  const plan = getPlan(order.plan_id);
  const days = plan && plan.turnaroundDays;

  // Only attach a QR when a real payee VPA is configured; one built from the
  // placeholder would send money nowhere.
  let attachments;
  let qrHtml = '';
  let qrText = '';
  if (upi.isConfigured()) {
    try {
      const png = await upi.qrPngBuffer({ amount: total, orderCode: order.order_code });
      attachments = [
        { filename: `upi-${order.order_code}.png`, content: png, cid: 'upiqr@indiaoffers' }
      ];
      qrHtml =
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid ${LINE};border-radius:10px">
          <tr><td style="padding:20px;text-align:center">
            <p style="margin:0 0 12px;font:600 15px ${FONT};color:${INK}">
              Scan to pay ${esc(formatInr(total))}</p>
            <img src="cid:upiqr@indiaoffers" alt="UPI QR code for ${esc(formatInr(total))}"
                 width="200" height="200"
                 style="display:block;margin:0 auto;border:1px solid ${LINE};border-radius:10px">
            <p style="margin:12px 0 0;font:13px/1.6 ${FONT};color:${MUTED}">
              Any UPI app — GPay, PhonePe, Paytm, BHIM<br>
              or pay <b style="color:${INK}">${esc(config.payment.upiId)}</b> directly
            </p>
          </td></tr></table>`;
      qrText =
        `\nScan the attached QR (upi-${order.order_code}.png) in any UPI app — payee and ` +
        `amount are already filled in.\nOr pay ${config.payment.upiId} directly.\n`;
    } catch (err) {
      console.error('[upi] QR generation failed for', order.order_code, '-', err.message);
    }
  }

  await send({
    to: order.client_email,
    subject: `${order.order_code} — your quote is confirmed (${formatInr(total)})`,
    text:
      `Hi ${order.client_name},\n\n` +
      `Your brief checks out. Here's what it costs to run it.\n\n` +
      `  Service fee      ${formatInr(serviceFee)}\n` +
      (productDeposit > 0 ? `  Product budget   ${formatInr(productDeposit)}\n` : '') +
      `  Total            ${formatInr(total)}\n\n` +
      (reviewNote ? `From the researcher who reviewed it: ${reviewNote}\n\n` : '') +
      qrText +
      `\nPay online: ${payUrl}\n\n` +
      `Once you've paid, add the UTR or reference number on that page. We match every ` +
      `payment against our bank statement before assigning a shopper — that's usually ` +
      `done within a few working hours, and you'll get an email the moment it clears.\n\n` +
      (days ? `Your scorecard follows about ${days} days after that.\n\n` : '') +
      `— IndiaOffers E-Mystery`,
    html: shell({
      greeting: `Hi ${order.client_name},`,
      lede: `Your brief checks out. Here's what it costs to run it.`,
      sections: [
        summary([
          ['Order', order.order_code],
          ['Plan', order.plan_name],
          ['Service fee', formatInr(serviceFee)],
          productDeposit > 0 ? ['Product budget', formatInr(productDeposit)] : null,
          ['Total', formatInr(total), true]
        ]),
        reviewNote
          ? callout('From the researcher who reviewed your brief', esc(reviewNote), 'slate')
          : null,
        qrHtml,
        `<p style="margin:0;font:15px/1.7 ${FONT};color:${MUTED}">
           Once you've paid, add the <b style="color:${INK}">UTR or reference number</b> on the
           payment page. We match every payment against our bank statement before assigning a
           shopper — usually within a few working hours, and you'll get an email the moment it
           clears.${days ? ` Your scorecard follows about ${esc(days)} days after that.` : ''}
         </p>`
      ],
      cta: button(payUrl, 'Pay & confirm online'),
      footnote: `Prefer bank transfer, or need a GST invoice first? Reply and we'll sort it out.`
    }),
    attachments
  });
}

/** Client submitted a UTR / screenshot. Unverified — say so without alarming them. */
async function paymentClaimed(order, { ref, proof, method } = {}) {
  const total = orderTotal(order);

  await send({
    to: order.client_email,
    subject: `${order.order_code} — payment details received, verifying now`,
    text:
      `Hi ${order.client_name},\n\n` +
      `Your payment details for ${order.order_code} are logged and we're matching them ` +
      `against our bank statement.\n\n` +
      `  Amount      ${formatInr(total)}\n` +
      (ref ? `  Reference   ${ref}\n` : '') +
      (proof ? `  Screenshot  received\n` : '') +
      `\nThat reconciliation is done by a person, on purpose — it's how we make sure no ` +
      `shop begins on a payment that hasn't actually landed. It usually takes a few ` +
      `working hours.\n\n` +
      `We'll email you the moment it clears and your shop joins the queue. Nothing more ` +
      `is needed from you.\n\n` +
      `Track this order: ${trackUrl(order)}\n\n` +
      `— IndiaOffers E-Mystery`,
    html: shell({
      greeting: `Hi ${order.client_name},`,
      lede: `Your payment details are logged. We're matching them against our bank statement now.`,
      sections: [
        summary([
          ['Order', order.order_code],
          ['Amount', formatInr(total)],
          ref ? ['Reference', ref] : null,
          proof ? ['Screenshot', 'Received'] : null,
          method ? ['Method', method === 'bank' ? 'Bank transfer' : 'UPI'] : null
        ]),
        callout(
          null,
          `That reconciliation is done by a person, on purpose — it's how we make sure no shop ` +
            `begins on a payment that hasn't actually landed. It usually takes a few working ` +
            `hours, and <b>nothing more is needed from you</b>.`,
          'amber'
        )
      ],
      cta: button(trackUrl(order), 'Track this order', true),
      footnote: `We'll email you the moment it clears and your shop joins the queue.`
    })
  });

  await send({
    to: config.support.email,
    subject: `[E-Mystery] VERIFY PAYMENT ${order.order_code} — ${formatInr(total)}`,
    text:
      `PAYMENT CLAIMED — needs matching against the statement\n\n` +
      `${order.plan_name}\n${order.brand_url}\n\n` +
      `Service ${formatInr(order.price_inr)} + deposit ${formatInr(order.product_deposit_inr || 0)} = ${formatInr(total)}\n` +
      `Method: ${method || '—'}\nRef: ${ref || '(none given)'}\nProof: ${proof ? 'uploaded' : 'none'}\n\n` +
      `Client-entered, so unverified. Confirm only against a real credit:\n` +
      `${config.siteUrl}/admin/orders/${order.id}`
  });
}

/** An admin matched the money against the statement (or dev test pay). */
async function paymentConfirmed(order) {
  const total = orderTotal(order);
  const plan = getPlan(order.plan_id);
  const days = plan && plan.turnaroundDays;

  await send({
    to: order.client_email,
    subject: `${order.order_code} — payment confirmed, your shop is underway`,
    text:
      `Hi ${order.client_name},\n\n` +
      `Payment matched and confirmed. ${order.order_code} is with a researcher now.\n\n` +
      `  Paid          ${formatInr(total)}\n` +
      (order.eta_date ? `  Report due    ${order.eta_date}\n` : days ? `  Report due    about ${days} days\n` : '') +
      `\nFrom here we shop ${order.brand_url} exactly as a real customer would — finding ` +
      `it, reading the product page, checking out, waiting on delivery, unboxing, ` +
      `contacting support, and testing returns where your plan covers it. At no point do ` +
      `we identify ourselves, and we never use brand-supplied coupons or accounts.\n\n` +
      `You'll hear from us once, when the scorecard is ready. If anything changes the ` +
      `scope along the way — the item goes out of stock, delivery fails — we'll check ` +
      `with you before spending anything further.\n\n` +
      `Track this order: ${trackUrl(order)}\n\n` +
      `— IndiaOffers E-Mystery`,
    html: shell({
      greeting: `Hi ${order.client_name},`,
      lede: `Payment matched and confirmed. <b style="color:${INK}">${esc(order.order_code)}</b> is with a researcher now.`,
      sections: [
        summary([
          ['Paid', formatInr(total)],
          ['Plan', order.plan_name],
          order.eta_date
            ? ['Report due', order.eta_date]
            : days
              ? ['Report due', `about ${days} days`]
              : null
        ]),
        callout(
          'What happens now',
          `We shop <b>${esc(order.brand_url)}</b> exactly as a real customer would — finding it, ` +
            `reading the product page, checking out, waiting on delivery, unboxing, contacting ` +
            `support, and testing returns where your plan covers it.<br><br>` +
            `At no point do we identify ourselves, and we never use brand-supplied coupons or ` +
            `accounts. That's the whole value of the exercise.`,
          'green'
        ),
        `<p style="margin:0;font:15px/1.7 ${FONT};color:${MUTED}">
           You'll hear from us once, when the scorecard is ready. If anything changes the scope
           along the way — the item goes out of stock, delivery fails — we'll check with you
           before spending anything further.
         </p>`
      ],
      cta: button(trackUrl(order), 'Track this order', true)
    })
  });

  await send({
    to: config.support.email,
    subject: `[E-Mystery] CONFIRMED ${order.order_code} — ${formatInr(total)} — assign a shopper`,
    text:
      `${order.plan_name}\n${order.brand_url}\n` +
      `Paid ${formatInr(total)}${order.payment_verified_by ? ` (verified by ${order.payment_verified_by})` : ''}\n` +
      `ETA ${order.eta_date || '—'}\n\n` +
      `${config.siteUrl}/admin/orders/${order.id}`
  });
}

/**
 * Payment claim didn't match the statement.
 *
 * The likeliest causes are benign, so name them — it heads off both a support
 * round-trip and, more importantly, a client paying twice.
 */
async function paymentRejected(order, reason) {
  await send({
    to: order.client_email,
    subject: `${order.order_code} — we couldn't match your payment yet`,
    text:
      `Hi ${order.client_name},\n\n` +
      `We've checked our statement for ${order.order_code} and can't find a matching ` +
      `credit yet.\n\n` +
      (reason ? `Note from our team: ${reason}\n\n` : '') +
      `In our experience this is usually one of three things:\n\n` +
      `  • The transfer is still settling. UPI can lag by a few hours and NEFT often\n` +
      `    lands the next working morning.\n` +
      `  • The reference was mistyped, so it didn't match the credit we can see.\n` +
      `  • The payment didn't complete at the bank's end, and the amount will return\n` +
      `    to your account on its own.\n\n` +
      `Please don't pay again yet. If you have paid, reply with the exact UTR and the ` +
      `account it went from and we'll re-check straight away.\n\n` +
      `If you'd rather start the payment over, your link is still live:\n${payUrlFor(order)}\n\n` +
      `— IndiaOffers E-Mystery`,
    html: shell({
      greeting: `Hi ${order.client_name},`,
      lede: `We've checked our statement for <b style="color:${INK}">${esc(order.order_code)}</b> and can't find a matching credit yet.`,
      sections: [
        reason ? callout('Note from our team', esc(reason), 'slate') : null,
        callout(
          `Please don't pay again yet`,
          `In our experience this is usually one of three things:<br><br>` +
            `<b>1.</b> The transfer is still settling — UPI can lag by a few hours, NEFT often ` +
            `lands the next working morning.<br>` +
            `<b>2.</b> The reference was mistyped, so it didn't match the credit we can see.<br>` +
            `<b>3.</b> The payment didn't complete at the bank's end, in which case the amount ` +
            `returns to your account on its own.`,
          'amber'
        ),
        `<p style="margin:0;font:15px/1.7 ${FONT};color:${MUTED}">
           If you have paid, reply to this email with the exact <b style="color:${INK}">UTR</b>
           and the account it went from — we'll re-check straight away.
         </p>`
      ],
      cta: button(payUrlFor(order), 'Start the payment over', true),
      footnote: `Your payment link stays live, so nothing is lost either way.`
    })
  });
}

/** Report published — the deliverable. Make it land. */
async function reportPublished(order, report) {
  const url = `${config.siteUrl}/report/${order.order_code}?t=${order.access_token}`;
  const fixes = parseJson(report.top_fixes, []).slice(0, 3);

  const fixesText = fixes.length
    ? `\nThe three we'd act on first:\n\n` + fixes.map((f, i) => `  ${i + 1}. ${f}`).join('\n') + '\n'
    : '';

  await send({
    to: order.client_email,
    subject: `${order.order_code} — your mystery shop report is ready (${report.overall_score}/100)`,
    text:
      `Hi ${order.client_name},\n\n` +
      `We've finished shopping ${order.brand_url}. Your scorecard is ready.\n\n` +
      `  Overall   ${report.overall_score}/100\n` +
      (report.verdict ? `  Verdict   ${report.verdict}\n` : '') +
      fixesText +
      `\nThe full report scores seven pillars of the journey — discovery, product page, ` +
      `checkout, fulfilment, the product itself, support and returns — with our notes and ` +
      `evidence at each step, plus the complete list of fixes in priority order.\n\n` +
      `Read it here: ${url}\n\n` +
      `That link is private to you. There's no login, so treat it the way you'd treat a ` +
      `password.\n\n` +
      `Once you've made changes, we can re-shop the same journey and show you the movement ` +
      `pillar by pillar — reply and we'll set it up at a returning-client rate.\n\n` +
      `— IndiaOffers E-Mystery`,
    html: shell({
      greeting: `Hi ${order.client_name},`,
      lede: `We've finished shopping <b style="color:${INK}">${esc(order.brand_url)}</b>. Your scorecard is ready.`,
      sections: [
        `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid ${LINE};border-radius:10px">
          <tr><td style="padding:22px;text-align:center">
            <p style="margin:0;font:800 44px/1 ${FONT};color:${INK}">${esc(report.overall_score)}<span
               style="font:600 20px ${FONT};color:${FAINT}">/100</span></p>
            ${
              report.verdict
                ? `<p style="margin:10px 0 0;font:15px/1.5 ${FONT};color:${MUTED}">${esc(report.verdict)}</p>`
                : ''
            }
          </td></tr></table>`,
        fixes.length
          ? callout(
              `The three we'd act on first`,
              fixes
                .map(
                  (f, i) =>
                    `<b>${i + 1}.</b> ${esc(f)}`
                )
                .join('<br><br>'),
              'amber'
            )
          : null,
        `<p style="margin:0;font:15px/1.7 ${FONT};color:${MUTED}">
           The full report scores seven pillars of the journey — discovery, product page,
           checkout, fulfilment, the product itself, support and returns — with our notes and
           evidence at each step, plus every fix in priority order.
         </p>`
      ],
      cta: button(url, 'Read the full report'),
      footnote:
        `This link is private to you — there's no login, so treat it the way you'd treat a ` +
        `password. Once you've made changes we can re-shop the same journey and show you the ` +
        `movement pillar by pillar; reply and we'll set it up at a returning-client rate.`
    })
  });
}

module.exports = {
  bookingReceived,
  orderCreated,
  paymentClaimed,
  paymentConfirmed,
  paymentRejected,
  reportPublished
};
