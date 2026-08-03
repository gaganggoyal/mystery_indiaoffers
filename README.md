# IndiaOffers E-Mystery

**Product URL:** [https://mystery.indiaoffers.in](https://mystery.indiaoffers.in)

Secret **online mystery shopping** for D2C, Shopify, Amazon, Flipkart & Indian marketplaces.
A product of **[IndiaOffers.in](https://indiaoffers.in)** — standalone app (not part of the main deals site).

---

## Features

- Marketing pages: home, pricing, how it works, sample report, cost policy, FAQ
- Paid plans (Basic → Retainer + **Customized** fixed fee / seller funds product)
- Booking flow + UPI / bank payment + product deposits
- Order tracking (private link or code + email)
- Scorecard reports (7 pillars, 0–100)
- Admin: manage orders, write reports, publish & email clients

---

## Stack

| | |
|--|--|
| Runtime | Node.js 18+ (tested on 18, 20, 22) |
| Framework | Express + EJS |
| Database | SQLite (`better-sqlite3`), WAL mode |
| Auth | JWT in an HttpOnly cookie (admin) |
| Process | systemd behind nginx |

---

## Quick start

```bash
git clone https://github.com/gaganggoyal/mystery_indiaoffers.git
cd mystery_indiaoffers
cp .env.example .env
npm install
npm run seed          # creates the first admin
npm run dev
```

Open **http://localhost:3100** · Admin at **/admin/login**

Create the first admin with your own credentials:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='your-strong-password' npm run seed
```

If those env vars are unset, `npm run seed` generates a random password and
prints it once to the terminal. Save it — it is not recoverable.

---

## Testing

```bash
npm test        # end-to-end smoke test against a running server
```

Runs 35 checks: every public page, booking validation, the full booking →
pay → track flow, order-token access control, admin auth, and security
headers. Point it anywhere:

```bash
BASE=https://mystery.indiaoffers.in npm test

# include the admin panel
BASE=https://mystery.indiaoffers.in \
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' npm test
```

It is safe against production — it books a Basic (no-purchase) plan and never
marks anything paid.

CI runs the same suite on every push, plus template compilation, a dependency
audit, and a check that no `.env` or database file was ever committed.

---

## Environment

Copy `.env.example` → `.env`. Never commit `.env`.

| Variable | Description |
|----------|-------------|
| `SITE_URL` | Public base URL. **Must be `https://…` in production** — it is baked into emailed pay/report links |
| `SITE_HOST` | `mystery.indiaoffers.in` |
| `JWT_SECRET` | **Required in production**, ≥32 chars. `openssl rand -hex 32` |
| `MYSTERY_UPI_ID` | UPI ID shown on the pay page — set the real one before taking orders |
| `MYSTERY_TEST_PAY` | `1` = instant fake payment. **Production refuses to boot while this is on** |
| `SMTP_*` | Optional. Without `SMTP_HOST`, emails only go to the log — nobody receives pay links |
| `DATA_DIR` | Optional. Move the DB + uploads to a backed-up volume |

The app **validates these on boot in production and exits non-zero** rather
than serving traffic with a weak secret, a localhost URL, or free orders
enabled. If systemd reports a failed start, run
`journalctl -u mystery-indiaoffers -n 30` — the reason is printed there.

---

## Deploy to `mystery.indiaoffers.in`

**DNS:** `A` record `mystery` → your server IP (zone: `indiaoffers.in`).

### 1. Server prep

```bash
# better-sqlite3 needs a toolchain if no prebuilt binary matches your platform
sudo apt update && sudo apt install -y nodejs npm nginx python3 g++ make sqlite3

sudo useradd --system --home /var/www/indiaoffers-emystery --shell /usr/sbin/nologin emystery
sudo mkdir -p /var/www/indiaoffers-emystery
sudo chown emystery:emystery /var/www/indiaoffers-emystery

sudo -u emystery git clone https://github.com/gaganggoyal/mystery_indiaoffers.git \
  /var/www/indiaoffers-emystery
cd /var/www/indiaoffers-emystery
sudo -u emystery npm ci --omit=dev
```

### 2. Configure

```bash
sudo -u emystery ./scripts/setup-production.sh
```

This creates `.env` from [`deploy/production.env.example`](deploy/production.env.example)
already pointed at `https://mystery.indiaoffers.in`, generates a `JWT_SECRET`,
moves any publicly-exposed payment proofs out of the static directory, and
lists what you still need to fill in — the real `MYSTERY_UPI_ID` and `SMTP_*`.

```bash
sudo -u emystery nano .env
```

### 3. First admin

```bash
sudo -u emystery npm run admin create you@indiaoffers.in
```

`npm run admin` also does `list`, `passwd <email>` and `delete <email>`.

### 4. Service + TLS

```bash
sudo cp deploy/mystery-indiaoffers.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mystery-indiaoffers
sudo systemctl status mystery-indiaoffers

sudo cp deploy/nginx-mystery.indiaoffers.in.conf \
        /etc/nginx/sites-available/mystery.indiaoffers.in
sudo ln -s /etc/nginx/sites-available/mystery.indiaoffers.in /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d mystery.indiaoffers.in
```

### 5. Verify

```bash
curl https://mystery.indiaoffers.in/healthz
BASE=https://mystery.indiaoffers.in ./scripts/smoke-test.sh
```

### 6. Backups

```bash
sudo -u emystery crontab -e
# 0 2 * * * cd /var/www/indiaoffers-emystery && ./scripts/backup-db.sh >> /var/log/emystery-backup.log 2>&1
```

`scripts/backup-db.sh` uses SQLite's online-backup API (safe while running),
gzips the DB, archives payment proofs, and prunes anything older than 30 days.

### Later deploys

```bash
cd /var/www/indiaoffers-emystery && ./scripts/deploy.sh
```

Backs up the DB, pulls, reinstalls, restarts, health-checks — and rolls back
automatically if the new revision fails to come up.

---

## Project layout

```
src/
  app.js                  # Express app, helmet/CSP, static
  server.js               # HTTP listen + graceful shutdown
  config.js               # env + production safety checks
  data/plans.js           # Pricing & cost policy
  routes/public.js        # Site, booking, pay, track, report, healthz
  routes/admin.js         # Admin panel + payment-proof serving
  middleware/auth.js      # JWT cookie auth
  middleware/rate-limit.js
  views/                  # EJS templates
  db/                     # SQLite schema + seed
public/css/site.css
scripts/                  # smoke-test, deploy, backup-db
deploy/                   # nginx + systemd
data/                     # SQLite DB, uploads, backups (all gitignored)
```

---

## Scripts

| Command | |
|---------|--|
| `npm run dev` | Nodemon on port 3100 |
| `npm start` | Production server |
| `npm run seed` | Create the first admin |
| `npm run admin` | `list` / `create` / `passwd` / `delete` admin accounts |
| `npm test` | End-to-end smoke test (43 checks) |
| `npm run setup:production` | First-run VPS setup for mystery.indiaoffers.in |
| `npm run migrate:uploads` | Move legacy payment proofs out of `public/` |
| `npm run backup` | Consistent DB + uploads backup |
| `scripts/deploy.sh` | Pull + restart + health check, with rollback |

---

## How payment works

Payment is **self-reported** — the client types a UTR or uploads a screenshot.
That is a claim, not proof, so orders do not go straight to `paid`:

```
pending_payment  →  payment_review  →  paid  →  in_progress  →  completed
   client pays      client submitted    admin matched it     shopper works
                    UTR / screenshot    to the statement
```

`paid` is the state that authorises a shopper to start spending the product
budget, so only an admin can set it, via **Confirm payment received** on the
order page. That action records who verified it and how much actually landed;
`amount_paid` and `paid_at` stay null until then, so revenue reporting never
counts money that hasn't arrived.

If a claim doesn't match the statement, **Reject claim** returns the order to
`pending_payment`, emails the client, and writes an audit note.

Each claim emails support with subject `[E-Mystery] VERIFY PAYMENT <code>` —
treat that inbox as your work queue.

---

## Security notes

- **Money** never moves state on a client's say-so — see
  [How payment works](#how-payment-works).
- **Payment proofs** (bank/UPI screenshots) are stored in `data/uploads/`,
  outside the static root, and served only via `/admin/proof/:file` behind
  admin auth. They are never publicly reachable.
- **Order pages** require a 36-char random token; there is no listing endpoint.
- **Access tokens are redacted** from app logs, nginx logs, and the no-SMTP
  mail fallback, so a log file never becomes a set of working credentials.
- **Rate limits:** admin login 10/15 min, booking 8/hr, payment 20/hr,
  tracking 30/15 min — per IP, with a second layer in nginx.
- **CSRF:** admin POSTs require a double-submit token on top of `SameSite=Lax`.
- **CSP** allows self-hosted assets only; `frame-ancestors 'none'`.
- Login uses a constant-time path for unknown emails, so response timing
  doesn't reveal which admin accounts exist.
- Cookies are `HttpOnly` + `SameSite=Lax` + `Secure` in production.
- `trust proxy` is `1`, so `X-Forwarded-For` can't be spoofed past rate limits.
- Never commit `.env`, `data/*.db`, or `data/uploads/*` — CI fails if you do.
- Rotate `JWT_SECRET` to revoke every admin session immediately (deleting an
  admin leaves their cookie valid until it expires, up to 7 days).

---

## License

MIT — see [LICENSE](LICENSE).
Brand name **IndiaOffers** remains yours; use of the trademark is not granted
by the license alone.
