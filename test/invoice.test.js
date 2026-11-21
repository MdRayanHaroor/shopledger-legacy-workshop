const assert = require('node:assert/strict');
const test = require('node:test');
const invoice = require('../lib/invoice');
const orders = require('../lib/orders');
const pricing = require('../lib/pricing');

function billedOrder(items, coupon = '') {
  const billed = pricing.computeTotals(items, coupon);
  const db = { nextOrderId: 1, orders: [] };
  const order = orders.add(db, { ...billed, items, coupon, date: '2021-11-15' });
  return { billed, order };
}

test('printed invoice matches the billed total and discounted GST for HSN rice with SAVE10', () => {
  const { order } = billedOrder([
    { name: 'Rice', hsn: '1006', price: 300, qty: 2 }
  ], 'SAVE10');
  const figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    { total: figures.total, tax: figures.tax, lineTax: figures.rows[0].lineTax },
    { total: 567, tax: 27, lineTax: 27 }
  );
  const html = invoice.render(order);
  assert.match(html, /Invoice Total<\/td><td class="r">₹567\.00/);
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹27\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice matches billing for a whole-rupee order at the default rate', () => {
  const items = [{ name: 'Tea', sku: 'TEA', price: 50, qty: 2 }];
  const { order } = billedOrder(items);

  assert.equal(order.total, 118);
  assert.deepEqual(invoice.computeInvoiceFigures(order), {
    subtotal: 100,
    discount: 0,
    tax: 18,
    cgst: 9,
    sgst: 9,
    total: 118,
    rows: [{
      name: 'Tea', sku: 'TEA', hsn: '-', qty: 2, price: 50,
      gstPercent: 18, line: 100, lineTax: 18
    }]
  });
  const html = invoice.render(order);
  assert.match(html, /Invoice Total<\/td><td class="r">₹118\.00/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

const rateCases = [
  { name: 'uses the HSN slab when no rate is stored', hsn: '1006', rate: 5 },
  { name: 'preserves an explicit zero rate', gstRate: 0, rate: 0 },
  { name: 'accepts a decimal rate', gstRate: 0.05, rate: 5 }
];

for (const { name, rate, ...rateFields } of rateCases) {
  test(`invoice ${name}`, () => {
    const { order } = billedOrder([{ name: 'Rice', price: 100, qty: 1, ...rateFields }]);
    const figures = invoice.computeInvoiceFigures(order);

    assert.equal(figures.rows[0].gstPercent, rate);
    assert.equal(figures.rows[0].lineTax, rate);
    assert.equal(figures.tax, rate);
    assert.equal(figures.total, 100 + rate);
  });
}

test('invoice applies the percentage coupon cap before calculating GST on mixed-rate lines', () => {
  const { order } = billedOrder([
    { name: 'Rice', price: 1000, qty: 1, gstRate: 5 },
    { name: 'Ghee', price: 1000, qty: 1, gstRate: 12 }
  ], 'SAVE10');
  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.discount, 150);
  assert.deepEqual(figures.rows.map(row => row.lineTax), [46.25, 111]);
  assert.equal(figures.tax, 157.25);
  assert.equal(figures.cgst, 78.63);
  assert.equal(figures.sgst, 78.62);
  assert.equal(figures.total, 2007.25);

  const html = invoice.render(order);
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹157\.25/);
  assert.match(html, /Coupon Discount \(SAVE10\)<\/td><td[^>]*>-₹150\.00/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹2007\.25/);
  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
});

test('invoice preserves historical billed aggregates even when current pricing differs', () => {
  const order = {
    items: [{ name: 'Tea', price: 1500, qty: 1 }],
    coupon: 'DIWALI20',
    subtotal: 1400,
    discount: 0,
    tax: 0,
    total: 1400
  };
  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, 1400);
  assert.equal(figures.discount, 0);
  assert.equal(figures.tax, 0);
  assert.equal(figures.cgst, 0);
  assert.equal(figures.sgst, 0);
  assert.equal(figures.total, 1400);
  assert.equal(figures.rows[0].gstPercent, null);
  assert.equal(figures.rows[0].lineTax, null);
  assert.match(invoice.render(order), /<td class="r">&mdash;<\/td><td class="r">&mdash;<\/td>/);
});

test('invoice falls back to checkout pricing for missing totals and respects the flat coupon minimum', () => {
  const order = {
    items: [{ name: 'Tea', price: 20, qty: 1 }],
    coupon: 'FLAT50'
  };
  const figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, 20);
  assert.equal(figures.discount, 0);
  assert.equal(figures.tax, 3.60);
  assert.equal(figures.total, 23.60);
});

test('invoice sums rounded line GST like checkout', () => {
  const { order } = billedOrder([
    { name: 'Tea sample', price: 0.03, qty: 1 },
    { name: 'Coffee sample', price: 0.03, qty: 1 }
  ]);
  const figures = invoice.computeInvoiceFigures(order);

  assert.deepEqual(figures.rows.map(row => row.lineTax), [0.01, 0.01]);
  assert.equal(figures.tax, 0.02);
  assert.equal(figures.cgst, 0.01);
  assert.equal(figures.sgst, 0.01);
  assert.equal(figures.total, 0.08);
});
