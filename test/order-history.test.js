const assert = require('node:assert/strict');
const test = require('node:test');
const orders = require('../lib/orders');

const history = [
  { id: 1001, date: '28/12/2021' },
  { id: 1004, date: '30/01/2022' },
  { id: 1007, date: '04/03/2022' },
  { id: 1008, date: '15/03/2022' }
];

test('order history sorts by calendar date across months and years, newest first', () => {
  const listed = orders.list({ orders: history });

  assert.deepEqual(listed.map(order => order.id), [1008, 1007, 1004, 1001]);
});

test('a January picker range includes only January orders and both endpoints', () => {
  const db = {
    orders: [
      ...history,
      { id: 1010, date: '01/01/2022' },
      { id: 1011, date: '31/01/2022' }
    ]
  };
  const listed = orders.list(db, { from: '2022-01-01', to: '2022-01-31' });

  assert.deepEqual(listed.map(order => order.id), [1011, 1004, 1010]);
});

test('date range includes both endpoints within the same month', () => {
  const listed = orders.list({ orders: history }, { from: '2022-03-04', to: '2022-03-15' });

  assert.deepEqual(listed.map(order => order.id), [1008, 1007]);
});

test('same-day orders retain newest entry first across date formats', () => {
  const db = { orders: [{ id: 1007, date: '04/03/2022' }, { id: 1008, date: '2022-03-04' }] };

  assert.deepEqual(orders.list(db, { from: '04/03/2022', to: '2022-03-04' }).map(order => order.id), [1008, 1007]);
});
