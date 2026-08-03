'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

const cookieOpts = extra => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  ...extra
});

function adminAuth(req, res, next) {
  const token = req.cookies && req.cookies.em_admin;
  if (!token) return res.redirect('/admin/login');
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    res.locals.admin = req.admin;
    next();
  } catch {
    res.clearCookie('em_admin', cookieOpts());
    res.redirect('/admin/login');
  }
}

function signAdmin(admin) {
  return jwt.sign(
    { id: admin.id, name: admin.name, email: admin.email },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

module.exports = { adminAuth, signAdmin, cookieOpts };
