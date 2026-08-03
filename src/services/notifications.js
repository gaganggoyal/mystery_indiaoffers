'use strict';

/**
 * Transactional emails shared by the public and admin routes.
 *
 * Every send is best-effort: a bounced notification must never roll back an
 * order state change the client already completed, so callers get a resolved
 * promise either way and failures are logged.
 */

const config = require('../config');
const { sendMail } = require('./mailer');
const { formatInr } = require('../data/plans');
const upi = require('./upi');

const esc = s =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const orderTotal = order => (order.price_inr || 0) + (order.product_deposit_inr || 0);
const trackUrl = order => `${config.siteUrl}/order/${order.order_code}?t=${order.access_token}`;

function send(args) {
  return sendMail(args).catch(err => {
    console.error('[mail] failed:', args.subject, '-', err && err.message);
  });
}

/**
 * HTML body for the pay-now email. Table layout and inline styles because
 * Gmail/Outlook strip <style> blocks and ignore most modern CSS.
 */
function payHtml({ order, serviceFee, productDeposit, total, payUrl, qrHtml }) {
  const row = (label, value, bold) =>
    `<tr>` +
    `<td style="padding:7px 0;font:14px/1.5 system-ui,sans-serif;color:#475569">${esc(label)}</td>` +
    `<td style="padding:7px 0;text-align:right;font:${bold ? '700' : '400'} 14px/1.5 system-ui,sans-serif;color:#0f172a">${esc(value)}</td>` +
    `</tr>`;

  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f8fafc">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px">
  <tr><td style="padding:26px 26px 0">
    <p style="margin:0 0 4px;font:700 19px/1.3 system-ui,sans-serif;color:#0f172a">Hi ${esc(order.client_name)},</p>
    <p style="margin:0;font:14px/1.6 system-ui,sans-serif;color:#475569">
      Your mystery shop is booked. Pay below and we'll get started.
    </p>
  </td></tr>

  <tr><td style="padding:18px 26px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px">
      ${row('Order', order.order_code)}
      ${row('Plan', order.plan_name)}
      ${row('Service fee', formatInr(serviceFee))}
      ${productDeposit > 0 ? row('Product deposit', formatInr(productDeposit)) : ''}
      <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:4px"></td></tr>
      ${row('Total due', formatInr(total), true)}
    </table>
  </td></tr>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto">
    ${qrHtml}
  </table>

  <tr><td style="padding:6px 26px 26px;text-align:center">
    <a href="${esc(payUrl)}"
       style="display:inline-block;padding:12px 22px;background:#4f46e5;color:#fff;border-radius:9px;
              font:700 15px system-ui,sans-serif;text-decoration:none">Pay &amp; confirm online</a>
    <p style="margin:14px 0 0;font:13px/1.6 system-ui,sans-serif;color:#64748b">
      After paying, enter your UTR / reference on that page so our team can verify it
      against the bank statement and queue your shop.
    </p>
    <p style="margin:16px 0 0;font:12px/1.5 system-ui,sans-serif;color:#94a3b8">
      IndiaOffers E-Mystery · a product of IndiaOffers.in<br>Private research only
    </p>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Client submitted a UTR / screenshot. This is an unverified claim — the copy
 * deliberately promises verification, not a started shop.
 */
async function paymentClaimed(order, { ref, proof, method } = {}) {
  const total = orderTotal(order);
  await send({
    to: order.client_email,
    subject: `Payment details received — ${order.order_code}`,
    text:
      `Hi ${order.client_name},\n\n` +
      `We have your payment details for ${order.order_code} (${formatInr(total)}).\n` +
      `Our team is matching them against our bank statement — this usually takes a few working hours.\n` +
      `You'll get another email the moment it's confirmed and your shop is queued.\n\n` +
      `Track: ${trackUrl(order)}\n\n— IndiaOffers E-Mystery`
  });
  await send({
    to: config.support.email,
    subject: `[E-Mystery] VERIFY PAYMENT ${order.order_code} — ${formatInr(total)}`,
    text:
      `${order.plan_name}\n` +
      `Service ${formatInr(order.price_inr)} + deposit ${formatInr(order.product_deposit_inr || 0)} = ${formatInr(total)}\n` +
      `Method: ${method || '—'}\nRef: ${ref || '(none)'}\nProof: ${proof ? 'uploaded' : 'none'}\n` +
      `${order.brand_url}\n\n` +
      `ACTION: match this against the bank statement, then confirm in admin.\n` +
      `${config.siteUrl}/admin/orders/${order.id}`
  });
}

/** An admin matched the money against the bank statement (or dev test pay). */
async function paymentConfirmed(order) {
  const total = orderTotal(order);
  await send({
    to: order.client_email,
    subject: `Payment confirmed — ${order.order_code} is queued`,
    text:
      `Hi ${order.client_name},\n\n` +
      `Payment for ${order.order_code} is confirmed (total ${formatInr(total)}).\n` +
      `Service ${formatInr(order.price_inr)} + product deposit ${formatInr(order.product_deposit_inr || 0)}.\n` +
      `Our shopper will begin shortly.\n` +
      `Track: ${trackUrl(order)}\n\n— IndiaOffers E-Mystery`
  });
  await send({
    to: config.support.email,
    subject: `[E-Mystery] CONFIRMED ${order.order_code} — ${formatInr(total)}`,
    text: `${order.plan_name}\n${order.brand_url}\nQueued for shopping.`
  });
}

/** Payment claim didn't match the statement. */
async function paymentRejected(order, reason) {
  await send({
    to: order.client_email,
    subject: `Payment not confirmed — ${order.order_code}`,
    text:
      `Hi ${order.client_name},\n\n` +
      `We couldn't match a payment for ${order.order_code} against our records.\n` +
      (reason ? `\nNote from our team: ${reason}\n` : '') +
      `\nIf you have paid, reply with the exact UTR / reference and the paying account — we'll re-check.\n` +
      `If not, you can still pay here: ${config.siteUrl}/pay/${order.order_code}?t=${order.access_token}\n\n` +
      `— IndiaOffers E-Mystery`
  });
}

/**
 * New booking, awaiting first payment.
 *
 * Includes a UPI QR for the exact amount. Scanning it prefills payee and
 * amount, so the client can't mistype either — which in turn means far fewer
 * payment claims that don't reconcile against the statement.
 */
async function orderCreated(order, { serviceFee, productDeposit }) {
  const total = serviceFee + productDeposit;
  const payUrl = `${config.siteUrl}/pay/${order.order_code}?t=${order.access_token}`;

  // Only attach a QR when a real payee VPA is configured; a QR built from the
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
        `<tr><td style="padding:20px 0;text-align:center">` +
        `<p style="margin:0 0 10px;font:600 15px/1.4 system-ui,sans-serif;color:#0f172a">` +
        `Scan to pay ${esc(formatInr(total))}</p>` +
        `<img src="cid:upiqr@indiaoffers" alt="UPI QR code for ${esc(formatInr(total))}" ` +
        `width="220" height="220" style="display:block;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px">` +
        `<p style="margin:10px 0 0;font:13px/1.5 system-ui,sans-serif;color:#475569">` +
        `Any UPI app — GPay, PhonePe, Paytm, BHIM<br>` +
        `UPI ID: <b>${esc(config.payment.upiId)}</b></p>` +
        `<p style="margin:8px 0 0"><a href="${esc(upi.buildUri({ amount: total, orderCode: order.order_code }))}" ` +
        `style="font:600 14px system-ui,sans-serif;color:#4f46e5">Open in a UPI app ↗</a></p>` +
        `</td></tr>`;
      qrText =
        `\nScan the attached QR (upi-${order.order_code}.png) in any UPI app to pay ${formatInr(total)}.\n` +
        `Or pay this UPI ID directly: ${config.payment.upiId}\n`;
    } catch (err) {
      console.error('[upi] QR generation failed for', order.order_code, '-', err.message);
    }
  }

  await send({
    to: order.client_email,
    subject: `Order ${order.order_code} — pay to start your IndiaOffers mystery shop`,
    text:
      `Hi ${order.client_name},\n\n` +
      `Order ${order.order_code} (${order.plan_name})\n` +
      `Service fee: ${formatInr(serviceFee)}\n` +
      `Product deposit: ${formatInr(productDeposit)}\n` +
      `Total due: ${formatInr(total)}\n` +
      qrText +
      `\nPay online: ${payUrl}\n\n` +
      `After paying, enter your UTR / reference on that page so we can verify it.\n\n` +
      `— IndiaOffers E-Mystery`,
    html: payHtml({ order, serviceFee, productDeposit, total, payUrl, qrHtml }),
    attachments
  });
  await send({
    to: config.support.email,
    subject: `[E-Mystery] New ${order.order_code} ${order.plan_name} total ${formatInr(total)}`,
    text:
      `${order.client_name} <${order.client_email}>\n${order.brand_url}\n` +
      `Service ${formatInr(serviceFee)} + deposit ${formatInr(productDeposit)}\n${payUrl}`
  });
}

/** Report published to the client. */
async function reportPublished(order, report) {
  await send({
    to: order.client_email,
    subject: `Your mystery shop report is ready — ${order.order_code}`,
    text:
      `Hi ${order.client_name},\n\n` +
      `Score: ${report.overall_score}/100\n${report.verdict || ''}\n\n` +
      `View: ${config.siteUrl}/report/${order.order_code}?t=${order.access_token}\n\n— IndiaOffers E-Mystery`
  });
}

module.exports = {
  orderCreated,
  paymentClaimed,
  paymentConfirmed,
  paymentRejected,
  reportPublished
};
