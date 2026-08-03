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
| Runtime | Node.js 18+ |
| Framework | Express + EJS |
| Database | SQLite (`better-sqlite3`) |
| Auth | JWT cookies (admin) |

---

## Quick start

```bash
git clone <your-repo-url> indiaoffers-emystery
cd indiaoffers-emystery
cp .env.example .env
npm install
npm run seed
npm run dev
```

Open **http://localhost:3100**

**Admin:** `/admin/login`  

Create the first admin with `npm run seed`. Credentials are taken from env (see `.env.example`) — **do not commit real passwords**. Set your own:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='your-strong-password' npm run seed
```

If those env vars are unset, the seed script prints a one-time local default to the terminal only (not documented here for security).

---

## Environment

Copy `.env.example` → `.env`. Never commit `.env`.

| Variable | Description |
|----------|-------------|
| `SITE_URL` | Public base URL (prod: `https://mystery.indiaoffers.in`) |
| `SITE_HOST` | `mystery.indiaoffers.in` |
| `JWT_SECRET` | Required in production (long random string) |
| `MYSTERY_UPI_ID` | UPI ID shown on pay page |
| `MYSTERY_TEST_PAY` | `1` = allow demo “test payment” (off in prod) |
| `SMTP_*` | Optional; without SMTP, emails log to the console |

---

## Domain & deploy

| | |
|--|--|
| **Production** | `https://mystery.indiaoffers.in` |
| **Parent brand** | `https://indiaoffers.in` |

**DNS:** `A` record `mystery` → your server IP (zone: `indiaoffers.in`).

```bash
# Production
export NODE_ENV=production
export SITE_URL=https://mystery.indiaoffers.in
export SITE_HOST=mystery.indiaoffers.in
export JWT_SECRET="$(openssl rand -hex 32)"

npm install --omit=dev
npm run seed   # once
npm start      # port 3100
```

Samples:

- Nginx: [`deploy/nginx-mystery.indiaoffers.in.conf`](deploy/nginx-mystery.indiaoffers.in.conf)  
- systemd: [`deploy/mystery-indiaoffers.service`](deploy/mystery-indiaoffers.service)

```bash
sudo certbot --nginx -d mystery.indiaoffers.in
```

---

## Project layout

```
src/
  app.js              # Express app
  server.js           # HTTP listen
  config.js
  data/plans.js       # Pricing & cost policy
  routes/public.js    # Site + booking + pay
  routes/admin.js     # Admin panel
  views/              # EJS templates
  db/                 # SQLite schema + seed
public/css/site.css
deploy/               # nginx + systemd
```

---

## Scripts

| Command | |
|---------|--|
| `npm run dev` | Nodemon on port 3100 |
| `npm start` | Production server |
| `npm run seed` | Create default admin |

---

## Security notes

- Do not commit `.env`, SQLite DBs, or `public/uploads/*`  
- Set a strong `JWT_SECRET` in production  
- Disable `MYSTERY_TEST_PAY` in production  
- Change default admin credentials immediately  

---

## License

MIT — see [LICENSE](LICENSE).  
Brand name **IndiaOffers** remains yours; use of the trademark is not granted by the license alone.
