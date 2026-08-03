'use strict';

/**
 * Plans + cost policy for IndiaOffers E-Mystery.
 * Service fee = what the brand pays us for the audit.
 * Product budget = max we spend buying as a shopper (included / capped).
 */

/** Shared rules shown on pricing, how-it-works, FAQ, book */
const COST_POLICY = {
  title: 'Who pays what — clear rules',
  summary:
    'You pay a fixed service fee for the audit. Product purchase cost is separate: standard plans include a small product budget; Customized plan has ₹0 product budget — seller funds 100% of product (especially non-returnable).',
  rules: [
    {
      q: 'What does the plan price cover?',
      a: 'Only our expert service: secret shopping labour, evidence capture, scorecard, and report. It does not mean unlimited free products.'
    },
    {
      q: 'Who pays the product price on checkout?',
      a: 'Standard plans: we float product up to the plan budget; overage is your deposit. Customized plan: fixed service fee per order only — you pay a full product deposit (item + shipping + COD) before we buy. Non-returnable items are always seller-funded on Customized.'
    },
    {
      q: 'What if the product is non-returnable?',
      a: 'We will not buy a non-returnable SKU unless you (1) pre-approve that SKU in writing on the booking form, and (2) agree that product cost is non-recoverable and paid by you (budget on standard plans, or 100% product deposit on Customized). Beauty samples, innerwear, customised goods, digital codes, and “no return” marketplace items fall here.'
    },
    {
      q: 'How does the Customized plan work?',
      a: 'You pay a fixed per-order service fee (same fee every shop). There is no included product budget. Before we place the order you pay the estimated product cart (and any revision if the real cart is higher). Ideal for non-returnable SKUs, high-ticket items, or when you want full control of product spend.'
    },
    {
      q: 'What happens to the product after the shop?',
      a: 'Returnable plans: we attempt return/refund where the plan includes it; refund (if any) stays with us to offset product spend. Non-returnable or Basic (no buy): no product. Full Journey without return: product is used for unboxing/photos and is not shipped back to the brand unless you request and pay reverse logistics.'
    },
    {
      q: 'Shipping, COD, coupons, failed orders?',
      a: 'Shipping we actually pay is part of the product budget. COD fee counts too. If we use a public coupon, fine. Brand-only “mystery shopper coupons” are not allowed (breaks secrecy). Failed delivery / RTO: we document it in the report; product budget may be reused for one retry if you approve.'
    },
    {
      q: 'High-ticket items (phones, appliances)?',
      a: 'We do not advance large product cost. You either (a) ship a sealed sample to our shopper address, or (b) pay a product deposit (100% of cart estimate) before we order. Service fee is still charged in full.'
    }
  ],
  table: [
    { item: 'Mystery shop service fee (all plans)', who: 'Brand / seller (you)', when: 'At booking / pay page' },
    { item: 'Product + shipping within plan budget (standard plans)', who: 'Included up to cap (we float)', when: 'During secret purchase' },
    { item: 'Product cost above plan budget', who: 'Brand — deposit before buy', when: 'Before we place order' },
    { item: 'Customized plan — all product + shipping', who: 'Seller 100% (product deposit)', when: 'With service fee, before buy' },
    { item: 'Non-returnable product', who: 'Seller (budget or full deposit on Customized)', when: 'Pre-approved at booking' },
    { item: 'Return / refund money from merchant', who: 'IndiaOffers offsets float; Customized deposit reconciled after', when: 'After successful return' },
    { item: 'GST invoice on service fee', who: 'Available on request for businesses', when: 'After payment' }
  ]
};

const PLANS = [
  {
    id: 'basic',
    name: 'Basic UX Audit',
    tagline: 'Browse + checkout friction (no purchase)',
    price: 1499,
    compareAt: 2499,
    badge: 'Starter',
    turnaroundDays: 3,
    color: '#6366f1',
    popular: false,
    buysProduct: false,
    productBudget: 0,
    includesReturn: false,
    sellerFundsProduct: false,
    costBreakdown: {
      serviceFee: 1499,
      productBudget: 0,
      productBudgetLabel: '₹0 — no product bought',
      youAlsoPay: 'Nothing for product. Only service fee.',
      nonReturnable: 'N/A — we never reach a paid order.',
      afterShop: 'No parcel. Report only.'
    },
    includes: [
      'Anonymous browse of your store / product page',
      'Mobile + desktop first-impression notes',
      'Checkout flow mapped up to payment screen (we do not pay)',
      'Trust signals & listing honesty checklist',
      'Partial scorecard: Discovery, PDP, Checkout',
      'Written report + top 5 fixes'
    ],
    note: 'No product purchase. Best when you only need conversion/UX feedback.',
    idealFor: 'New D2C stores fixing conversion before heavy ad spend'
  },
  {
    id: 'full',
    name: 'Full Journey Shop',
    tagline: 'Real secret purchase → delivery → unboxing',
    price: 3499,
    compareAt: 4999,
    badge: 'Most popular',
    turnaroundDays: 7,
    color: '#0ea5e9',
    popular: true,
    buysProduct: true,
    productBudget: 1500,
    includesReturn: false,
    sellerFundsProduct: false,
    costBreakdown: {
      serviceFee: 3499,
      productBudget: 1500,
      productBudgetLabel: 'Up to ₹1,500 product + shipping included',
      youAlsoPay: 'Any cart total above ₹1,500 (deposit before we buy). Non-returnable SKUs only if you pre-approve and cover cost.',
      nonReturnable: 'We buy only if you tick approval on booking and accept that cost won’t come back via return.',
      afterShop: 'We keep product for evidence (or dispose). Not returned to brand by default. Return flow is a separate plan.'
    },
    includes: [
      'Everything in Basic UX Audit',
      'Real paid order as a secret customer',
      'Shipping promise vs reality timeline',
      'Packaging & unboxing photo evidence',
      'Product quality vs listing claims',
      'One post-order support test (chat/email)',
      'Full 7-pillar scorecard (returns pillar N/A or policy-only)'
    ],
    note: 'Service ₹3,499 + product float up to ₹1,500. Over ₹1,500 → you fund the difference before purchase. Return/refund stress test is NOT included (see Return Audit).',
    idealFor: 'Brands that want the full “would a real buyer trust us?” truth'
  },
  {
    id: 'return',
    name: 'Return & Refund Audit',
    tagline: 'Full journey + return/refund stress test',
    price: 5999,
    compareAt: 8999,
    badge: 'Deep dive',
    turnaroundDays: 12,
    color: '#f59e0b',
    popular: false,
    buysProduct: true,
    productBudget: 2000,
    includesReturn: true,
    sellerFundsProduct: false,
    costBreakdown: {
      serviceFee: 5999,
      productBudget: 2000,
      productBudgetLabel: 'Up to ₹2,000 product + shipping included',
      youAlsoPay: 'Cart above ₹2,000 as deposit. If item is non-returnable, this plan cannot fully execute — switch to Full Journey + policy review, or approve a returnable SKU.',
      nonReturnable: 'We refuse pure non-returnable SKUs for this plan (return test would be fake). Choose a returnable variant or downgrade plan.',
      afterShop: 'We file a real return. Merchant refund offsets our product float. If merchant denies return, we document it — product cost stays absorbed per budget/deposit rules.'
    },
    includes: [
      'Everything in Full Journey Shop',
      'Real return initiated as a customer',
      'Policy clarity, pickup/drop, hidden fees',
      'Refund timeline & support quality',
      'Would-I-buy-again verdict',
      'Full returns pillar scored'
    ],
    note: 'Requires a returnable product. Service ₹5,999 + product float up to ₹2,000. Non-returnable goods → we will not book this plan without a returnable substitute SKU.',
    idealFor: 'Stores with high return rates or weak post-purchase ratings'
  },
  {
    id: 'competitor',
    name: 'Competitor Pack',
    tagline: 'You + 2 competitors, same scorecard',
    price: 9999,
    compareAt: 14999,
    badge: 'Strategy',
    turnaroundDays: 14,
    color: '#10b981',
    popular: false,
    buysProduct: true,
    productBudget: 3500,
    includesReturn: false,
    sellerFundsProduct: false,
    costBreakdown: {
      serviceFee: 9999,
      productBudget: 3500,
      productBudgetLabel: 'Up to ₹3,500 total product float (your store + 2 competitors combined)',
      youAlsoPay: 'Split suggested: ~₹1,500 your SKU + ~₹1,000 each competitor light buy — or Basic-only on competitors if you want zero competitor product cost (tell us in brief).',
      nonReturnable: 'Same rules per SKU. Competitor non-returnable: we may do UX-only on that competitor and still score what we can.',
      afterShop: 'Side-by-side PDF. Products not returned to you.'
    },
    includes: [
      'Full Journey on your store (within shared product budget)',
      'Light journey on 2 competitors (browse + optional low-cost buy)',
      'Side-by-side comparison table',
      'Where they win & how to beat them',
      'Board-ready summary'
    ],
    note: 'Service ₹9,999. Combined product budget ₹3,500 across all three shops. Prefer returnable, low-mid ticket SKUs for clean comparison.',
    idealFor: 'Founders preparing pricing, ads, or product refreshes'
  },
  {
    id: 'marketplace',
    name: 'Marketplace ASIN Shop',
    tagline: 'Amazon / Flipkart / Meesho / Myntra listing audit',
    price: 2999,
    compareAt: 4499,
    badge: 'India marketplaces',
    turnaroundDays: 7,
    color: '#ec4899',
    popular: false,
    buysProduct: true,
    productBudget: 1500,
    includesReturn: false,
    sellerFundsProduct: false,
    costBreakdown: {
      serviceFee: 2999,
      productBudget: 1500,
      productBudgetLabel: 'Up to ₹1,500 product + shipping included',
      youAlsoPay: 'ASIN price above ₹1,500 → deposit first. Fake/duplicate listing risk is part of the report, not a free replacement product.',
      nonReturnable: 'Marketplace “non-returnable” badges: we only buy with your written OK; cost is non-recoverable within budget/deposit.',
      afterShop: 'Optional return add-on: +₹1,999 service if you want a real return test on the same order (quoted after booking).'
    },
    includes: [
      'Buy as a normal marketplace customer',
      'Listing honesty & image vs reality',
      'Seller reliability signals',
      'Packaging & counterfeit-risk notes',
      'Return window & policy traps (policy review; full return test optional)',
      'Marketplace-specific scorecard'
    ],
    note: 'Service ₹2,999 + product float up to ₹1,500. Full return stress test is optional add-on, not default.',
    idealFor: 'Amazon / Flipkart sellers and brand owners on marketplaces'
  },
  {
    id: 'retainer',
    name: 'Monthly Retainer',
    tagline: '2 Full Journey shops every month',
    price: 5999,
    compareAt: 9999,
    badge: 'Ongoing',
    turnaroundDays: 30,
    color: '#8b5cf6',
    popular: false,
    billing: 'monthly',
    buysProduct: true,
    productBudget: 3000,
    includesReturn: false,
    sellerFundsProduct: false,
    costBreakdown: {
      serviceFee: 5999,
      productBudget: 3000,
      productBudgetLabel: 'Up to ₹3,000 product float / month (for 2 shops combined)',
      youAlsoPay: 'Product overage per shop same as Full Journey. Extra shops or Return Audits billed separately.',
      nonReturnable: 'Same as Full Journey per shop.',
      afterShop: 'Unused product budget does not roll as cash; unused shop slots expire after 45 days.'
    },
    includes: [
      '2× Full Journey mystery shops / month',
      'Priority scheduling',
      'Score trend over time',
      'WhatsApp updates',
      'Quarterly 30-min strategy call',
      '15% off Competitor Packs'
    ],
    note: '₹5,999/mo service + up to ₹3,000/mo product float for both shops. Unused shops don’t roll past 45 days.',
    idealFor: 'Growing D2C brands shipping frequent releases'
  },
  {
    id: 'custom',
    name: 'Customized Plan',
    tagline: 'Fixed fee per order · seller funds 100% of product',
    price: 2499,
    compareAt: 3999,
    badge: 'Flexible',
    turnaroundDays: 10,
    color: '#0f766e',
    popular: false,
    buysProduct: true,
    productBudget: 0,
    includesReturn: false,
    /** Seller pays all product costs via deposit; service fee is fixed per order */
    sellerFundsProduct: true,
    allowReturnAddon: true,
    costBreakdown: {
      serviceFee: 2499,
      productBudget: 0,
      productBudgetLabel: '₹0 included — seller pays product 100%',
      youAlsoPay:
        'Full product deposit = estimated cart (item + shipping + COD) paid with the service fee. If real cart is higher, you top up before we buy. Non-returnable: always fully seller-funded and non-recoverable.',
      nonReturnable:
        'Designed for this. You pre-approve SKU and pay full product deposit. No return = no merchant refund expected.',
      afterShop:
        'Optional return test: +₹1,999 service add-on only if the SKU is returnable. Product refunds (if any) reconcile against your deposit after the shop.'
    },
    includes: [
      'Fixed service fee per mystery order (same every time)',
      'You choose any SKU — returnable or non-returnable',
      'You fund product + shipping in full (deposit before buy)',
      'Secret purchase, unboxing evidence & support test',
      'Full scorecard tailored to your brief',
      'Ideal for high-ticket, beauty, custom, or marketplace non-returnables'
    ],
    note:
      'Service ₹2,499 / order only. Product price is NEVER included — seller pays product deposit (and top-ups). Perfect when product is non-returnable or expensive.',
    idealFor: 'Sellers with non-returnable catalogues, high ASP, or multi-SKU custom audits'
  }
];

/** Fixed per-order service fee for customized (exported for UI copy) */
const CUSTOM_SERVICE_FEE = 2499;
const CUSTOM_RETURN_ADDON = 1999;

const SCORE_PILLARS = [
  { key: 'discovery', label: 'Discovery & first impression', max: 10 },
  { key: 'product_page', label: 'Product page honesty', max: 20 },
  { key: 'checkout', label: 'Checkout experience', max: 15 },
  { key: 'fulfillment', label: 'Fulfillment & shipping', max: 15 },
  { key: 'product', label: 'Product quality', max: 20 },
  { key: 'support', label: 'Customer support', max: 10 },
  { key: 'returns', label: 'Returns & refunds', max: 10 }
];

/**
 * Order lifecycle.
 *
 * Two human checkpoints, at the two places this business can lose money:
 *
 *   awaiting_review — the brief and the quote. `approx_cart` is typed by the
 *     client, and on Customized they fund 100% of it, so a lowballed estimate
 *     means under-collecting. Review is where we confirm scope and set the
 *     real figures before asking for anything.
 *
 *   payment_review — the money. Payment is self-reported: the client enters a
 *     UTR or uploads a screenshot, which is a *claim*, not proof. Nothing may
 *     reach `paid` — the state that tells a shopper to start spending the
 *     product budget — until a human matches it against the bank statement.
 */
const ORDER_STATUSES = [
  { id: 'awaiting_review', label: 'Reviewing your brief', color: '#8b5cf6' },
  { id: 'pending_payment', label: 'Awaiting payment', color: '#f59e0b' },
  { id: 'payment_review', label: 'Verifying payment', color: '#d97706' },
  { id: 'paid', label: 'Paid — in queue', color: '#0ea5e9' },
  { id: 'in_progress', label: 'Shop in progress', color: '#6366f1' },
  { id: 'completed', label: 'Report ready', color: '#059669' },
  { id: 'cancelled', label: 'Cancelled', color: '#94a3b8' }
];

/** Statuses where the client has done their part and we owe them a response. */
const ACTIVE_STATUSES = ['awaiting_review', 'payment_review', 'paid', 'in_progress'];

/** Statuses in which no money has been collected yet. */
const UNPAID_STATUSES = ['awaiting_review', 'pending_payment', 'payment_review'];

function getPlan(id) {
  return PLANS.find(p => p.id === String(id || '').toLowerCase()) || null;
}

function formatInr(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function statusMeta(id) {
  return ORDER_STATUSES.find(s => s.id === id) || { id, label: id, color: '#64748b' };
}

module.exports = {
  PLANS,
  COST_POLICY,
  CUSTOM_SERVICE_FEE,
  CUSTOM_RETURN_ADDON,
  SCORE_PILLARS,
  ORDER_STATUSES,
  ACTIVE_STATUSES,
  UNPAID_STATUSES,
  getPlan,
  formatInr,
  statusMeta
};
