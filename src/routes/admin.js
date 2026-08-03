'use strict';

const router = require('express').Router();
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const { sendMail } = require('../services/mailer');
const { adminAuth, signAdmin, cookieOpts } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rate-limit');
const { PLANS, SCORE_PILLARS, ORDER_STATUSES, getPlan, formatInr, statusMeta } = require('../data/plans');

function parseJson(s, f) {
  try { return s ? JSON.parse(s) : f; } catch { return f; }
}

router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login', error: null, config });
});

router.post('/login', loginLimiter, async (req, res) => {
  const rows = await db.query('SELECT * FROM admins WHERE email = ?', [req.body.email || '']);
  if (!rows.length || !(await bcrypt.compare(req.body.password || '', rows[0].password_hash))) {
    return res.status(401).render('admin/login', { title: 'Admin Login', error: 'Invalid credentials', config });
  }
  await db.query('UPDATE admins SET last_login = ? WHERE id = ?', [db.nowSql(), rows[0].id]);
  res.cookie('em_admin', signAdmin(rows[0]), cookieOpts({ maxAge: 7 * 864e5 }));
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  res.clearCookie('em_admin', cookieOpts());
  res.redirect('/admin/login');
});

router.use(adminAuth);

// Payment proofs (customer bank/UPI screenshots) — admin-only, served from the
// private upload dir. basename() strips any path so `../` cannot escape it.
router.get('/proof/:file', (req, res) => {
  const name = path.basename(String(req.params.file || ''));
  if (!/^pay-[\w.-]+\.(jpe?g|png|webp|pdf)$/i.test(name)) return res.status(404).send('Not found');
  res.sendFile(path.join(config.paths.UPLOAD_DIR, name), err => {
    if (err && !res.headersSent) res.status(404).send('Proof not found');
  });
});

router.get('/', async (req, res, next) => {
  try {
    const counts = {};
    for (const s of ORDER_STATUSES) {
      const r = await db.query('SELECT COUNT(*) AS c FROM mystery_orders WHERE status = ?', [s.id]);
      counts[s.id] = r[0].c;
    }
    const recent = await db.query('SELECT * FROM mystery_orders ORDER BY created_at DESC LIMIT 10');
    res.render('admin/dashboard', {
      title: 'Dashboard', section: 'dashboard', admin: req.admin,
      counts, recent, ORDER_STATUSES, statusMeta, formatInr, config
    });
  } catch (err) { next(err); }
});

router.get('/orders', async (req, res, next) => {
  try {
    const status = req.query.status || '';
    let sql = 'SELECT * FROM mystery_orders';
    const params = [];
    if (status) { sql += ' WHERE status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT 300';
    const orders = await db.query(sql, params);
    res.render('admin/orders', {
      title: 'Orders', section: 'orders', admin: req.admin,
      orders, status, ORDER_STATUSES, statusMeta, formatInr, config
    });
  } catch (err) { next(err); }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM mystery_orders WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.redirect('/admin/orders');
    const order = rows[0];
    const reportRows = await db.query('SELECT * FROM mystery_reports WHERE order_id = ?', [order.id]);
    const report = reportRows[0] || null;
    res.render('admin/order', {
      title: order.order_code, section: 'orders', admin: req.admin,
      order, report, plan: getPlan(order.plan_id),
      competitors: parseJson(order.competitor_urls, []),
      scores: parseJson(report && report.scores_json, {}),
      sections: parseJson(report && report.sections_json, {}),
      fixes: parseJson(report && report.top_fixes, []),
      pillars: SCORE_PILLARS, ORDER_STATUSES, statusMeta, formatInr, PLANS, config,
      saved: req.query.saved === '1',
      published: req.query.published === '1'
    });
  } catch (err) { next(err); }
});

router.post('/orders/:id', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM mystery_orders WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.redirect('/admin/orders');
    const order = rows[0];
    const action = req.body.action || 'save_order';

    if (action === 'save_order') {
      await db.query(
        `UPDATE mystery_orders SET status=?, assigned_to=?, admin_notes=?, eta_date=?, payment_ref=?, updated_at=? WHERE id=?`,
        [
          String(req.body.status || order.status),
          String(req.body.assigned_to || '').trim() || null,
          String(req.body.admin_notes || '').trim() || null,
          String(req.body.eta_date || '').trim() || null,
          String(req.body.payment_ref || '').trim() || order.payment_ref,
          db.nowSql(), order.id
        ]
      );
      if (req.body.status === 'paid' && order.status === 'pending_payment') {
        await db.query(
          'UPDATE mystery_orders SET paid_at = COALESCE(paid_at, ?), amount_paid = COALESCE(amount_paid, ?) WHERE id = ?',
          [db.nowSql(), order.price_inr, order.id]
        );
      }
      return res.redirect(`/admin/orders/${order.id}?saved=1`);
    }

    if (action === 'save_report') {
      const scores = {};
      let total = 0;
      for (const p of SCORE_PILLARS) {
        const v = parseInt(req.body['score_' + p.key], 10);
        if (!Number.isNaN(v)) {
          scores[p.key] = Math.max(0, Math.min(p.max, v));
          total += scores[p.key];
        }
      }
      let overall = parseInt(req.body.overall_score, 10);
      if (Number.isNaN(overall)) overall = total;

      const sections = {};
      for (const p of SCORE_PILLARS) sections[p.key] = String(req.body['section_' + p.key] || '').trim();
      sections.extra = String(req.body.section_extra || '').trim();

      const fixes = String(req.body.top_fixes || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 15);
      const wba = req.body.would_buy_again;
      const would_buy = wba === '1' ? 1 : (wba === '0' ? 0 : null);

      const existing = await db.query('SELECT id FROM mystery_reports WHERE order_id = ?', [order.id]);
      if (existing.length) {
        await db.query(
          `UPDATE mystery_reports SET overall_score=?, verdict=?, executive_summary=?, top_fixes=?,
            scores_json=?, sections_json=?, evidence_notes=?, would_buy_again=?, updated_at=? WHERE order_id=?`,
          [
            overall,
            String(req.body.verdict || '').trim() || null,
            String(req.body.executive_summary || '').trim() || null,
            JSON.stringify(fixes), JSON.stringify(scores), JSON.stringify(sections),
            String(req.body.evidence_notes || '').trim() || null,
            would_buy, db.nowSql(), order.id
          ]
        );
      } else {
        await db.query(
          `INSERT INTO mystery_reports (id, order_id, overall_score, verdict, executive_summary, top_fixes,
            scores_json, sections_json, evidence_notes, would_buy_again, is_published, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)`,
          [
            db.uid('msr'), order.id, overall,
            String(req.body.verdict || '').trim() || null,
            String(req.body.executive_summary || '').trim() || null,
            JSON.stringify(fixes), JSON.stringify(scores), JSON.stringify(sections),
            String(req.body.evidence_notes || '').trim() || null,
            would_buy, db.nowSql(), db.nowSql()
          ]
        );
      }
      if (req.body.set_in_progress === '1' && order.status === 'paid') {
        await db.query(`UPDATE mystery_orders SET status='in_progress', updated_at=? WHERE id=?`, [db.nowSql(), order.id]);
      }
      return res.redirect(`/admin/orders/${order.id}?saved=1`);
    }

    if (action === 'publish_report') {
      const reportRows = await db.query('SELECT * FROM mystery_reports WHERE order_id = ?', [order.id]);
      if (!reportRows.length) return res.redirect(`/admin/orders/${order.id}`);
      await db.query(
        `UPDATE mystery_reports SET is_published=1, published_at=?, updated_at=? WHERE order_id=?`,
        [db.nowSql(), db.nowSql(), order.id]
      );
      await db.query(`UPDATE mystery_orders SET status='completed', updated_at=? WHERE id=?`, [db.nowSql(), order.id]);
      const reportUrl = `${config.siteUrl}/report/${order.order_code}?t=${order.access_token}`;
      await sendMail({
        to: order.client_email,
        subject: `Your mystery shop report is ready — ${order.order_code}`,
        text: `Hi ${order.client_name},\n\nScore: ${reportRows[0].overall_score}/100\n${reportRows[0].verdict || ''}\n\nView: ${reportUrl}\n\n— IndiaOffers E-Mystery`
      }).catch(() => {});
      return res.redirect(`/admin/orders/${order.id}?published=1`);
    }

    res.redirect(`/admin/orders/${order.id}`);
  } catch (err) { next(err); }
});

module.exports = router;
