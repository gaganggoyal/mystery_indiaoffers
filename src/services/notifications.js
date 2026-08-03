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

const orderTotal = order => (order.price_inr || 0) + (order.product_deposit_inr || 0);
const trackUrl = order => `${config.siteUrl}/order/${order.order_code}?t=${order.access_token}`;

function send(args) {
  return sendMail(args).catch(err => {
    console.error('[mail] failed:', args.subject, '-', err && err.message);
  });
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

/** New booking, awaiting first payment. */
async function orderCreated(order, { serviceFee, productDeposit }) {
  const total = serviceFee + productDeposit;
  const payUrl = `${config.siteUrl}/pay/${order.order_code}?t=${order.access_token}`;
  await send({
    to: order.client_email,
    subject: `Order ${order.order_code} — pay to start your IndiaOffers mystery shop`,
    text:
      `Hi ${order.client_name},\n\n` +
      `Order ${order.order_code} (${order.plan_name})\n` +
      `Service fee: ${formatInr(serviceFee)}\n` +
      `Product deposit: ${formatInr(productDeposit)}\n` +
      `Total due: ${formatInr(total)}\n\n` +
      `Pay: ${payUrl}\n\n— IndiaOffers E-Mystery`
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
