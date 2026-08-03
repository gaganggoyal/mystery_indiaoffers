'use strict';

/**
 * UPI payment links and QR codes.
 *
 * A UPI QR is just a QR encoding of a `upi://pay?…` deep link. Scanning it in
 * any UPI app (GPay, PhonePe, Paytm, BHIM…) opens a prefilled payment screen,
 * so the client cannot mistype the VPA or the amount — which also means far
 * fewer payment claims that don't match the bank statement.
 *
 * We set `tr` (transaction reference) to the order code so the order shows up
 * in the payee's statement narration, making admin verification much easier.
 */

const QRCode = require('qrcode');
const config = require('../config');

/** True when a real payee VPA is configured (not the shipped placeholder). */
function isConfigured() {
  const id = (config.payment.upiId || '').trim();
  return Boolean(id) && id !== 'indiaoffers@upi' && /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(id);
}

/**
 * Build the `upi://pay` deep link for an order.
 * Amount is fixed to the exact total so the client cannot underpay by typo.
 */
function buildUri({ amount, orderCode, note }) {
  const params = new URLSearchParams({
    pa: config.payment.upiId,
    pn: config.payment.upiName || 'IndiaOffers',
    cu: 'INR'
  });
  if (amount > 0) params.set('am', String(amount));
  if (orderCode) params.set('tr', orderCode);
  params.set('tn', note || `IndiaOffers E-Mystery ${orderCode || ''}`.trim());

  // URLSearchParams encodes spaces as '+', which some UPI apps mis-parse in
  // the note field. %20 is universally accepted.
  return 'upi://pay?' + params.toString().replace(/\+/g, '%20');
}

/** QR as a PNG buffer — for email attachments and the pay page image route. */
async function qrPngBuffer(opts) {
  return QRCode.toBuffer(buildUri(opts), {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320
  });
}

/** QR as a data: URI — handy for server-rendered pages without an extra request. */
async function qrDataUri(opts) {
  return QRCode.toDataURL(buildUri(opts), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320
  });
}

module.exports = { isConfigured, buildUri, qrPngBuffer, qrDataUri };
