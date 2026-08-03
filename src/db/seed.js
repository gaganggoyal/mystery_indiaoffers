'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim() || 'admin@localhost';
  let password = (process.env.ADMIN_PASSWORD || '').trim();
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }

  const existing = await db.query('SELECT id FROM admins WHERE email = ?', [email]);
  if (existing.length) {
    console.log('Admin already exists:', email);
    console.log('  Login: /admin/login');
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await db.query(
    'INSERT INTO admins (id, name, email, password_hash, created_at) VALUES (?,?,?,?,?)',
    [db.uid('adm'), 'IndiaOffers Admin', email, hash, db.nowSql()]
  );

  console.log('Created admin');
  console.log('  Email   :', email);
  console.log('  Password:', password);
  if (generated) {
    console.log('  (password was auto-generated — save it now; it is not stored in plain text)');
  }
  console.log('  Login   : /admin/login');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
