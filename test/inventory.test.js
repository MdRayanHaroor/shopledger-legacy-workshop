const assert = require('node:assert/strict');
const test = require('node:test');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

const ghee = { id: 1, sku: 'DRY-001', name: 'A2 Gir Cow Ghee 500ml' };
const chilli = { id: 2, sku: 'SPC-001', name: 'Byadgi Kashmiri Chilli Powder 500g' };

for (const product of [
  { ...ghee, stock: 1, reserved: 0 },
  { ...chilli, stock: 4, reserved: 3 },
  { ...ghee, stock: 5, reserved: 2 }
]) {
  test(`accepts the exact sellable quantity of ${product.sku} (stock ${product.stock}, reserved ${product.reserved})`, () => {
    const sellable = product.stock - product.reserved;
    assert.equal(inventory.getSellableStock(product), sellable);
    assert.deepEqual(inventory.check([product], [{ id: product.id, qty: sellable }]), { ok: true });
    const products = [{ ...product }];
    inventory.reserve(products, [{ id: product.id, qty: sellable }]);
    assert.equal(products[0].stock, product.reserved);
    assert.equal(products[0].reserved, product.reserved);
    assert.equal(inventory.getSellableStock(products[0]), 0);
  });
}

test('stock check accepts less than the sellable quantity and rejects more', () => {
  const product = { ...ghee, stock: 5, reserved: 2 };
  assert.deepEqual(inventory.check([product], [{ id: product.id, qty: 2 }]), { ok: true });
  assert.deepEqual(inventory.check([product], [{ id: product.id, qty: 4 }]), {
    ok: false,
    msg: `${product.name} is out of stock (3 sellable available)`
  });
});

test('stock check compares the combined quantity of repeated lines to sellable stock', () => {
  const product = { ...chilli, stock: 5, reserved: 3 };
  const line = { id: product.id, qty: 1 };
  assert.deepEqual(inventory.check([product], [line, line]), { ok: true });
  assert.deepEqual(inventory.check([product], [line, line, line]), {
    ok: false,
    msg: `${product.name} is out of stock (2 sellable available)`
  });
});

test('cancelling a pending ghee and sunflower oil order restores both stock deductions once', () => {
  const db = {
    nextOrderId: 1007,
    orders: [],
    products: [
      { ...ghee, stock: 3, reserved: 0 },
      { id: 3, name: 'Sunflower Oil', stock: 8, reserved: 1 }
    ]
  };
  const items = [{ id: ghee.id, qty: 2 }, { id: 3, qty: 2 }];
  const stockLevels = () => db.products.map(product => ({
    physical: product.stock,
    reserved: product.reserved,
    sellable: inventory.getSellableStock(product)
  }));

  assert.deepEqual(inventory.check(db.products, items), { ok: true });
  inventory.reserve(db.products, items);
  const order = orders.add(db, { status: 'pending', date: '2021-11-15', items });
  const deductedLevels = [
    { physical: 1, reserved: 0, sellable: 1 },
    { physical: 6, reserved: 1, sellable: 5 }
  ];
  assert.deepEqual(stockLevels(), deductedLevels);

  assert.deepEqual(orders.cancel(db, '1007', 'Cancelled at counter'), { ok: true, order });
  assert.equal(orders.get(db, 1007).status, 'cancelled');
  const restoredLevels = [
    { physical: 3, reserved: 0, sellable: 3 },
    { physical: 8, reserved: 1, sellable: 7 }
  ];
  assert.deepEqual(stockLevels(), restoredLevels);
  assert.equal(orders.cancel(db, '1007').ok, false);
  assert.deepEqual(stockLevels(), restoredLevels);
});

test('release accepts legacy productId lines and restores physical units without consuming reservations', () => {
  const product = { ...chilli, stock: 4, reserved: 3 };

  inventory.release([product], [{ productId: product.id, qty: 2 }]);

  assert.equal(product.stock, 6);
  assert.equal(product.reserved, 3);
  assert.equal(inventory.getSellableStock(product), 3);
});
