'use strict';

/**
 * Admin account management.
 *
 *   node scripts/admin.js list
 *   node scripts/admin.js create  <email> [name]     # prompts / generates password
 *   node scripts/admin.js passwd  <email>            # reset a password
 *   node scripts/admin.js delete  <email>
 *
 * Passwords are read from ADMIN_PASSWORD if set, otherwise generated and
 * printed once. There is no password-change screen in the panel, so this is
 * the supported way to rotate credentials or remove a stale account.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const [, , cmd, email, ...rest] = process.argv;

const usage = () => {
  console.log(`
Admin management — IndiaOffers E-Mystery

  node scripts/admin.js list
  node scripts/admin.js create <email> [name]
  node scripts/admin.js passwd <email>
  node scripts/admin.js delete <email>

Set ADMIN_PASSWORD to choose the password; otherwise one is generated.
`);
};

function genPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function list() {
  const rows = db.sqlite
    .prepare('SELECT email, name, created_at, last_login FROM admins ORDER BY created_at')
    .all();
  if (!rows.length) {
    console.log('No admins. Create one:  node scripts/admin.js create you@example.com');
    return;
  }
  console.log(`\n${rows.length} admin account(s):\n`);
  for (const r of rows) {
    console.log(`  ${r.email}`);
    console.log(`      name       : ${r.name}`);
    console.log(`      created    : ${r.created_at}`);
    console.log(`      last login : ${r.last_login || 'never'}\n`);
  }
}

async function create() {
  if (!email) return usage(), process.exit(1);
  const existing = db.sqlite.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  if (existing) {
    console.error(`Admin ${email} already exists. Use "passwd" to reset the password.`);
    process.exit(1);
  }
  const password = (process.env.ADMIN_PASSWORD || '').trim() || genPassword();
  const generated = !process.env.ADMIN_PASSWORD;
  const hash = await bcrypt.hash(password, 12);
  db.sqlite
    .prepare('INSERT INTO admins (id, name, email, password_hash, created_at) VALUES (?,?,?,?,?)')
    .run(db.uid('adm'), rest.join(' ') || 'IndiaOffers Admin', email, hash, db.nowSql());

  console.log('\n✓ Created admin');
  console.log('  Email    :', email);
  console.log('  Password :', password);
  if (generated) console.log('  (generated — save it now, it is not recoverable)');
  console.log('  Login    : /admin/login\n');
}

async function passwd() {
  if (!email) return usage(), process.exit(1);
  const existing = db.sqlite.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  if (!existing) {
    console.error(`No admin with email ${email}.`);
    process.exit(1);
  }
  const password = (process.env.ADMIN_PASSWORD || '').trim() || genPassword();
  const generated = !process.env.ADMIN_PASSWORD;
  const hash = await bcrypt.hash(password, 12);
  db.sqlite.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, existing.id);

  console.log('\n✓ Password reset for', email);
  console.log('  Password :', password);
  if (generated) console.log('  (generated — save it now, it is not recoverable)');
  console.log('\n  Existing login sessions stay valid for up to 7 days.');
  console.log('  To force everyone out, rotate JWT_SECRET and restart.\n');
}

async function remove() {
  if (!email) return usage(), process.exit(1);
  const existing = db.sqlite.prepare('SELECT id FROM admins WHERE email = ?').get(email);
  if (!existing) {
    console.error(`No admin with email ${email}.`);
    process.exit(1);
  }
  const count = db.sqlite.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (count <= 1) {
    console.error('Refusing to delete the only admin — you would lock yourself out.');
    console.error('Create the replacement account first.');
    process.exit(1);
  }
  db.sqlite.prepare('DELETE FROM admins WHERE id = ?').run(existing.id);
  console.log(`\n✓ Deleted admin ${email}`);
  console.log('  Their session cookie stays valid until it expires (max 7 days).');
  console.log('  Rotate JWT_SECRET and restart to revoke it immediately.\n');
}

const commands = { list, create, passwd, delete: remove };

(async () => {
  const fn = commands[cmd];
  if (!fn) {
    usage();
    process.exit(cmd ? 1 : 0);
  }
  try {
    await fn();
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
