'use strict';

const router = require('express').Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const notify = require('../services/notifications');
const { bookingLimiter, payLimiter, trackLimiter } = require('../middleware/rate-limit');
const {
  PLANS, COST_POLICY, SCORE_PILLARS, CUSTOM_RETURN_ADDON,
  getPlan, formatInr, statusMeta
} = require('../data/plans');

// Payment proofs are bank/UPI screenshots — customer financial data. They live
// outside public/ so express.static can never serve them; admins read them
// through the authenticated /admin/proof/:file route instead.
const { UPLOAD_DIR } = require('../config').paths;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const uploadProof = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname).toLowerCase().match(/^\.(jpe?g|png|webp|pdf)$/) || ['.jpg'])[0];
      // Random suffix, not just a timestamp — timestamps are enumerable.
      cb(null, `pay-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, /^(image\/|application\/pdf)/.test(file.mimetype))
}).single('payment_proof');

const orderCode = () => 'IO-MS-' + crypto.randomBytes(3).toString('hex').toUpperCase();
const accessToken = () => crypto.randomBytes(18).toString('hex');

async function loadOrder(code) {
  const rows = await db.query('SELECT * FROM mystery_orders WHERE order_code = ?', [String(code || '').toUpperCase()]);
  return rows[0] || null;
}
async function loadOrderByToken(code, token) {
  const o = await loadOrder(code);
  if (!o || o.access_token !== token) return null;
  return o;
}
async function loadReport(orderId) {
  const rows = await db.query('SELECT * FROM mystery_reports WHERE order_id = ?', [orderId]);
  return rows[0] || null;
}
function parseJson(s, f) {
  try { return s ? JSON.parse(s) : f; } catch { return f; }
}

function locals(extra) {
  return Object.assign({
    plans: PLANS,
    costPolicy: COST_POLICY,
    pillars: SCORE_PILLARS,
    formatInr,
    statusMeta,
    getPlan,
    fullPlan: getPlan('full'),
    customPlan: getPlan('custom'),
    customReturnAddon: CUSTOM_RETURN_ADDON,
    config,
    payment: config.payment,
    testPayEnabled: config.testPayEnabled,
    waUrl: `https://wa.me/${config.support.whatsappDigits}`
  }, extra);
}

// Liveness probe for systemd / uptime monitors / nginx. Touches the DB so a
// 200 means "can actually serve orders", not just "process is alive".
router.get('/healthz', (req, res) => {
  try {
    db.sqlite.prepare('SELECT 1').get();
    res.json({ ok: true, uptime: Math.round(process.uptime()), version: require('../../package.json').version });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    [
      'User-agent: *',
      // Order, pay and report URLs are token-bearing and must never be indexed.
      'Disallow: /admin',
      'Disallow: /order/',
      'Disallow: /pay/',
      'Disallow: /report/',
      'Allow: /',
      '',
      `Sitemap: ${config.siteUrl}/sitemap.xml`,
      ''
    ].join('\n')
  );
});

const PUBLIC_URLS = ['/', '/pricing', '/how-it-works', '/sample-report', '/costs', '/faq', '/book', '/track'];

router.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_URLS.map(
    u => `  <url><loc>${config.siteUrl}${u}</loc><lastmod>${today}</lastmod></url>`
  ).join('\n');
  res.type('application/xml').send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
});

router.get('/', (req, res) => {
  res.render('home', locals({
    title: 'E-Mystery Shopping Expert | IndiaOffers',
    description: 'Secret online store audits by IndiaOffers. Full journey mystery shops for D2C, Shopify & Indian marketplaces.'
  }));
});

router.get('/pricing', (req, res) => {
  res.render('pricing', locals({
    title: 'Plans & Pricing | IndiaOffers E-Mystery',
    description: 'Transparent INR pricing for online mystery shops.'
  }));
});

router.get('/how-it-works', (req, res) => {
  res.render('how', locals({
    title: 'How It Works | IndiaOffers E-Mystery',
    description: 'How IndiaOffers secret-shops your store and delivers a scored report.'
  }));
});

router.get('/sample-report', (req, res) => {
  const sampleScores = {
    discovery: 7, product_page: 14, checkout: 10, fulfillment: 11,
    product: 15, support: 7, returns: 6
  };
  const overall = Object.values(sampleScores).reduce((a, b) => a + b, 0);
  res.render('sample-report', locals({
    title: 'Sample Report | IndiaOffers E-Mystery',
    description: 'See what an IndiaOffers e-mystery shopping scorecard looks like.',
    sampleScores,
    overall,
    sampleFixes: [
      'Reveal shipping cost before the last checkout step.',
      'Add a clear size chart with body measurements.',
      'Photos show navy; delivered item was black — fix variant accuracy.',
      'Support replied in 9 hours; aim for under 2 on order days.',
      'Link return policy on PDP and order confirmation emails.'
    ]
  }));
});

router.get('/faq', (req, res) => {
  res.render('faq', locals({
    title: 'FAQ | IndiaOffers E-Mystery',
    description: 'Product cost, non-returnable items, who pays — clear answers from IndiaOffers E-Mystery.'
  }));
});

router.get('/costs', (req, res) => {
  res.render('costs', locals({
    title: 'Who Pays What — Product Cost Rules | IndiaOffers E-Mystery',
    description: 'Service fee vs product budget, non-returnable products, deposits, and refunds explained.'
  }));
});

router.get('/book', (req, res) => {
  const plan = getPlan(req.query.plan) || getPlan('full');
  res.render('book', locals({
    title: `Book ${plan.name} | IndiaOffers E-Mystery`,
    description: `Book ${plan.name} for ${formatInr(plan.price)}.`,
    plan,
    form: {},
    error: null
  }));
});

router.post('/book', bookingLimiter, async (req, res, next) => {
  try {
    const plan = getPlan(req.body.plan_id);
    if (!plan) {
      return res.status(400).render('book', locals({
        title: 'Book', description: '', plan: getPlan('full'), form: req.body,
        error: 'Please pick a valid plan.'
      }));
    }
    const client_name = String(req.body.client_name || '').trim().slice(0, 120);
    const client_email = String(req.body.client_email || '').trim().toLowerCase().slice(0, 150);
    const brand_url = String(req.body.brand_url || '').trim().slice(0, 500);
    if (!client_name || !client_email || !brand_url) {
      return res.status(400).render('book', locals({
        title: `Book ${plan.name}`, description: '', plan, form: req.body,
        error: 'Name, email and store/product URL are required.'
      }));
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client_email)) {
      return res.status(400).render('book', locals({
        title: `Book ${plan.name}`, description: '', plan, form: req.body,
        error: 'Enter a valid email address.'
      }));
    }

    if (plan.buysProduct && req.body.accept_cost_policy !== '1') {
      return res.status(400).render('book', locals({
        title: `Book ${plan.name}`, description: '', plan, form: req.body,
        error: 'Please accept the cost policy (service fee vs product budget) to continue.'
      }));
    }
    if (plan.includesReturn && req.body.is_returnable === 'no') {
      return res.status(400).render('book', locals({
        title: `Book ${plan.name}`, description: '', plan, form: req.body,
        error: 'Return & Refund Audit needs a returnable product. Pick a returnable SKU or choose Full Journey / Basic instead.'
      }));
    }
    if (plan.buysProduct && req.body.is_returnable === 'no' && req.body.approve_non_returnable !== '1') {
      return res.status(400).render('book', locals({
        title: `Book ${plan.name}`, description: '', plan, form: req.body,
        error: 'Non-returnable SKU requires the pre-approval checkbox (you accept non-recoverable product cost).'
      }));
    }

    // Product deposit calculation
    // Customized: seller pays 100% of estimated cart as deposit (required)
    // Standard buy plans: deposit = max(0, approx_cart - productBudget)
    const approxCart = Math.max(0, parseInt(req.body.approx_cart, 10) || 0);
    let productDeposit = 0;
    let returnAddon = 0;
    let serviceFee = plan.price;

    if (plan.sellerFundsProduct) {
      if (!approxCart || approxCart < 1) {
        return res.status(400).render('book', locals({
          title: `Book ${plan.name}`, description: '', plan, form: req.body,
          error: 'Customized plan requires estimated product cart (₹). Seller funds 100% of product cost.'
        }));
      }
      productDeposit = approxCart;
      if (req.body.return_addon === '1') {
        if (req.body.is_returnable === 'no') {
          return res.status(400).render('book', locals({
            title: `Book ${plan.name}`, description: '', plan, form: req.body,
            error: 'Return add-on needs a returnable product. Uncheck return add-on or pick a returnable SKU.'
          }));
        }
        returnAddon = 1;
        serviceFee = plan.price + CUSTOM_RETURN_ADDON;
      }
    } else if (plan.buysProduct && approxCart > (plan.productBudget || 0)) {
      productDeposit = approxCart - (plan.productBudget || 0);
    }

    const competitors = [req.body.competitor_1, req.body.competitor_2]
      .map(s => String(s || '').trim()).filter(Boolean);
    const id = db.uid('ms');
    const code = orderCode();
    const token = accessToken();
    const eta = new Date();
    eta.setDate(eta.getDate() + (plan.turnaroundDays || 7));

    const productNotes = [
      String(req.body.product_notes || '').trim(),
      approxCart ? `Approx cart: ₹${approxCart}` : '',
      req.body.is_returnable ? `Returnable: ${req.body.is_returnable}` : '',
      req.body.approve_non_returnable === '1' ? 'Non-returnable pre-approved by client' : '',
      plan.sellerFundsProduct
        ? 'CUSTOMIZED: seller funds 100% product (no included budget)'
        : (plan.productBudget != null ? `Plan product budget: ₹${plan.productBudget}` : ''),
      productDeposit ? `Product deposit due: ₹${productDeposit}` : '',
      returnAddon ? `Return add-on selected (+₹${CUSTOM_RETURN_ADDON})` : ''
    ].filter(Boolean).join('\n').slice(0, 2000) || null;

    const specialBrief = [
      String(req.body.special_brief || '').trim(),
      req.body.accept_cost_policy === '1' ? 'Client accepted cost policy (service vs product).' : '',
      plan.sellerFundsProduct ? 'Client accepts: fixed service fee per order; product price paid fully by seller as deposit.' : ''
    ].filter(Boolean).join('\n').slice(0, 2000) || null;

    await db.query(
      `INSERT INTO mystery_orders (
        id, order_code, plan_id, plan_name, price_inr, status,
        client_name, client_email, client_phone, client_company, brand_url,
        competitor_urls, platform, category, product_notes, special_brief,
        shipping_city, shipping_pincode, product_deposit_inr, return_addon,
        access_token, eta_date, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, code, plan.id, plan.name, serviceFee, 'pending_payment',
        client_name, client_email,
        String(req.body.client_phone || '').replace(/\D/g, '').slice(0, 15) || null,
        String(req.body.client_company || '').trim().slice(0, 150) || null,
        brand_url, JSON.stringify(competitors),
        String(req.body.platform || '').slice(0, 40) || null,
        String(req.body.category || '').slice(0, 80) || null,
        productNotes,
        specialBrief,
        String(req.body.shipping_city || 'Delhi NCR').slice(0, 80),
        String(req.body.shipping_pincode || '').replace(/\D/g, '').slice(0, 6) || null,
        productDeposit,
        returnAddon,
        token, eta.toISOString().slice(0, 10), db.nowSql(), db.nowSql()
      ]
    );

    await notify.orderCreated(
      {
        id, order_code: code, access_token: token, plan_name: plan.name,
        client_name, client_email, brand_url
      },
      { serviceFee, productDeposit }
    );

    res.redirect(`/pay/${code}?t=${token}`);
  } catch (err) { next(err); }
});

router.get('/pay/:code', async (req, res, next) => {
  try {
    const order = await loadOrderByToken(req.params.code, req.query.t);
    if (!order) return res.status(404).render('404', locals({ title: 'Order not found' }));
    if (order.status !== 'pending_payment') {
      return res.redirect(`/order/${order.order_code}?t=${order.access_token}`);
    }
    const plan = getPlan(order.plan_id);
    const productDeposit = order.product_deposit_inr || 0;
    const totalDue = (order.price_inr || 0) + productDeposit;
    res.render('pay', locals({
      title: `Pay ${order.order_code}`,
      description: '',
      order,
      plan,
      productDeposit,
      totalDue,
      error: req.query.err || null
    }));
  } catch (err) { next(err); }
});

router.post('/pay/:code', payLimiter, (req, res) => {
  uploadProof(req, res, async err => {
    try {
      const token = req.query.t || req.body.t;
      if (err) {
        return res.redirect(`/pay/${req.params.code}?t=${token}&err=` + encodeURIComponent('Upload failed (max 5MB)'));
      }
      const order = await loadOrderByToken(req.params.code, token);
      if (!order) return res.status(404).render('404', locals({ title: 'Order not found' }));
      if (order.status !== 'pending_payment') {
        return res.redirect(`/order/${order.order_code}?t=${order.access_token}`);
      }

      const method = String(req.body.payment_method || 'upi');
      const ref = String(req.body.payment_ref || '').trim().slice(0, 80);
      // Store the bare filename; the admin route resolves it inside UPLOAD_DIR.
      const proof = req.file ? req.file.filename : null;

      const totalDue = (order.price_inr || 0) + (order.product_deposit_inr || 0);

      // Dev-only shortcut. Skips verification precisely because it is fake
      // money; config.js refuses to boot production while this is enabled.
      if (method === 'test' && config.testPayEnabled) {
        await db.query(
          `UPDATE mystery_orders SET status='paid', payment_method='test', payment_ref=?, paid_at=?, amount_paid=?, updated_at=? WHERE id=?`,
          ['TEST-' + Date.now().toString(36), db.nowSql(), totalDue, db.nowSql(), order.id]
        );
        await notify.paymentConfirmed(order);
        return res.redirect(`/order/${order.order_code}?t=${order.access_token}&paid=1`);
      }

      if (!ref && !proof) {
        return res.redirect(`/pay/${order.order_code}?t=${order.access_token}&err=` + encodeURIComponent('Enter UTR/UPI ref or upload screenshot'));
      }

      // A typed UTR is a *claim*, not proof — anyone can invent one. Park the
      // order in payment_review; only an admin who matched it against the bank
      // statement may move it to 'paid'. amount_paid and paid_at stay null
      // until then so revenue reporting never counts unverified money.
      await db.query(
        `UPDATE mystery_orders SET status='payment_review', payment_method=?, payment_ref=?, payment_proof=?,
           payment_claimed_at=?, updated_at=? WHERE id=?`,
        [method === 'bank' ? 'bank' : 'upi', ref || null, proof, db.nowSql(), db.nowSql(), order.id]
      );
      await notify.paymentClaimed(order, { ref, proof, method });
      res.redirect(`/order/${order.order_code}?t=${order.access_token}&submitted=1`);
    } catch (e) {
      console.error(e);
      res.redirect(`/pay/${req.params.code}?t=${req.query.t || ''}&err=Server+error`);
    }
  });
});


router.get('/order/:code', async (req, res, next) => {
  try {
    const order = await loadOrderByToken(req.params.code, req.query.t);
    if (!order) return res.status(404).render('404', locals({ title: 'Order not found' }));
    const report = await loadReport(order.id);
    res.render('order', locals({
      title: `Order ${order.order_code}`,
      description: '',
      order,
      plan: getPlan(order.plan_id),
      report,
      competitors: parseJson(order.competitor_urls, []),
      paidFlash: req.query.paid === '1',
      submittedFlash: req.query.submitted === '1'
    }));
  } catch (err) { next(err); }
});

router.get('/track', (req, res) => {
  res.render('track', locals({ title: 'Track Order', description: '', error: null, form: {} }));
});

router.post('/track', trackLimiter, async (req, res, next) => {
  try {
    const code = String(req.body.order_code || '').trim().toUpperCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const rows = await db.query(
      'SELECT * FROM mystery_orders WHERE order_code = ? AND lower(client_email) = lower(?)',
      [code, email]
    );
    if (!rows.length) {
      return res.render('track', locals({
        title: 'Track Order', description: '',
        error: 'No order found for that code + email.',
        form: req.body
      }));
    }
    res.redirect(`/order/${rows[0].order_code}?t=${rows[0].access_token}`);
  } catch (err) { next(err); }
});

router.get('/report/:code', async (req, res, next) => {
  try {
    const order = await loadOrderByToken(req.params.code, req.query.t);
    if (!order) return res.status(404).render('404', locals({ title: 'Not found' }));
    const report = await loadReport(order.id);
    if (!report || !report.is_published) {
      return res.redirect(`/order/${order.order_code}?t=${order.access_token}`);
    }
    res.render('report', locals({
      title: `Report ${order.order_code} — ${report.overall_score}/100`,
      description: '',
      order,
      plan: getPlan(order.plan_id),
      report,
      scores: parseJson(report.scores_json, {}),
      sections: parseJson(report.sections_json, {}),
      fixes: parseJson(report.top_fixes, [])
    }));
  } catch (err) { next(err); }
});

module.exports = router;
