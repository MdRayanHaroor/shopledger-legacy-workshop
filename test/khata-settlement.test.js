const assert = require('node:assert/strict');
const test = require('node:test');
const ledger = require('../lib/ledger');

function meeraAccount() {
  return {
    customers: [{
      id: 1,
      name: 'Meera Joshi',
      openingBalance: 450,
      totalBilled: 1982.01,
      totalSettled: 1200
    }],
    settlements: [],
    nextSettlementId: 501
  };
}

test('the settlement form amount is added numerically to the settled total', () => {
  const db = meeraAccount();
  assert.equal(ledger.listCustomers(db)[0].balance, 1232.01);

  const result = ledger.recordSettlement(db, '1', '500', 'upi', 'Counter payment');

  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(ledger.listCustomers(db)[0].balance, 732.01);
  assert.deepEqual(db.settlements, [result.settlement]);
  assert.equal(result.settlement.customerId, 1);
  assert.equal(result.settlement.amount, 500);
});

test('a numeric settlement updates the settled total and balance arithmetically', () => {
  const db = meeraAccount();

  const result = ledger.recordSettlement(db, '1', 500);

  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(ledger.listCustomers(db)[0].balance, 732.01);
  assert.deepEqual(db.settlements, [result.settlement]);
  assert.equal(result.settlement.amount, 500);
});

test('a settlement adds to an existing total stored as text', () => {
  const db = meeraAccount();
  db.customers[0].totalSettled = '1200';

  const result = ledger.recordSettlement(db, '1', '500');

  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
});

test('an invalid settlement amount leaves the account and settlement history intact', () => {
  const db = meeraAccount();

  assert.equal(ledger.recordSettlement(db, '1', 'invalid').ok, false);
  assert.deepEqual(db, meeraAccount());
});
