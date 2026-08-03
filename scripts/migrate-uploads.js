'use strict';

/**
 * One-time migration: move payment proofs out of the public static directory.
 *
 *   node scripts/migrate-uploads.js            # report what would move
 *   node scripts/migrate-uploads.js --apply    # actually move them
 *
 * Before this change, proofs were written to public/uploads/ and served by
 * express.static to anyone who guessed the filename (a base36 timestamp).
 * Any file already there is publicly reachable until it is moved.
 *
 * Safe to run repeatedly; it only touches pay-*.{jpg,jpeg,png,webp,pdf}.
 */

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const db = require('../src/db');

const PUBLIC_DIR = path.join(config.paths.root, 'public', 'uploads');
const PRIVATE_DIR = config.paths.UPLOAD_DIR;
const PROOF_RE = /^pay-[\w.-]+\.(jpe?g|png|webp|pdf)$/i;

const apply = process.argv.includes('--apply');

function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.log(`No ${PUBLIC_DIR} — nothing to migrate.`);
    return;
  }

  const files = fs.readdirSync(PUBLIC_DIR).filter(f => PROOF_RE.test(f));
  if (!files.length) {
    console.log('✓ No payment proofs in the public directory. Nothing to do.');
    return;
  }

  console.log(
    `Found ${files.length} payment proof(s) in public/uploads/.\n` +
    `These are PUBLICLY READABLE until moved.\n`
  );

  if (!apply) {
    for (const f of files) console.log('  would move:', f);
    console.log(`\nRe-run with --apply to move them to ${PRIVATE_DIR}`);
    return;
  }

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  let moved = 0;
  let skipped = 0;

  for (const f of files) {
    const from = path.join(PUBLIC_DIR, f);
    const to = path.join(PRIVATE_DIR, f);
    if (fs.existsSync(to)) {
      console.log('  skip (already private):', f);
      fs.unlinkSync(from);
      skipped++;
      continue;
    }
    fs.renameSync(from, to);
    console.log('  moved:', f);
    moved++;
  }

  // Older rows stored "/uploads/pay-x.jpg"; normalise to the bare filename so
  // the admin proof route resolves them without the legacy split() fallback.
  const rows = db.sqlite
    .prepare("SELECT id, payment_proof FROM mystery_orders WHERE payment_proof LIKE '/uploads/%'")
    .all();
  const update = db.sqlite.prepare('UPDATE mystery_orders SET payment_proof = ? WHERE id = ?');
  for (const r of rows) update.run(path.basename(r.payment_proof), r.id);

  console.log(
    `\n✓ Moved ${moved} file(s), removed ${skipped} duplicate(s), ` +
    `normalised ${rows.length} database row(s).`
  );
  console.log('  Proofs are now served only via /admin/proof/:file behind admin auth.');
}

try {
  main();
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
}
