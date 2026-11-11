const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../ui/node_modules/typescript');

// Exercise the actual TypeScript helper without adding a separate test runner.
const filename = path.resolve(__dirname, '../ui/lib/checkout.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exported = {};
vm.runInNewContext(compiled, { exports: exported }, { filename });
const { checkoutTotals, cartIssue, paymentQr } = exported;

for (const subtotal of [0, 4, 5, 14, 15, 500, 1090000, 8181818181818181, 8181818181818182]) {
  const vat = (BigInt(subtotal) + 5n) / 10n;
  const result = checkoutTotals(subtotal);
  assert.equal(result.subtotal, subtotal);
  assert.equal(result.vatRate, 10);
  assert.equal(result.vatAmount, Number(vat));
  assert.equal(result.total, Number(BigInt(subtotal) + vat));
}
for (let subtotal = 0; subtotal < 10000; subtotal++) {
  assert.equal(checkoutTotals(subtotal).vatAmount, Number((BigInt(subtotal) + 5n) / 10n));
}
const item = { maHang: 'TB01', tenHang: 'Test', soLuong: 1000000, giaBanLe: 5 };
const basket = [{ maHang: 'TB01', soLuong: 2 }];
assert.equal(cartIssue(basket, [item]), '');
assert.equal(checkoutTotals(item.giaBanLe * 2).vatAmount, 1);
assert.equal(cartIssue(basket, [{ ...item, giaBanLe: -1 }]), 'Giá bán Test không hợp lệ.');
assert.equal(cartIssue(basket, [{ ...item, giaBanLe: NaN }]), 'Giá bán Test không hợp lệ.');
assert.equal(cartIssue(basket, [{ ...item, giaBanLe: 0 }]), '');
assert.match(cartIssue([{ maHang: 'TB01', soLuong: 9000 }], [{ ...item, giaBanLe: 1000000000000 }]), /gồm VAT vượt giới hạn/);
assert.match(cartIssue([{ maHang: 'TB01', soLuong: 10000 }], [{ ...item, giaBanLe: 1000000000000 }]), /vượt giới hạn/);
assert.equal(paymentQr({ id: 'HDtest', total: 1199000 }), '');
exported.PAYMENT_QR_URL = 'https://payments.invalid/qr?amount={amount}&reference={reference}';
assert.equal(paymentQr({ id: 'HD/test', subtotal: 1090000, total: 1199000 }),
  'https://payments.invalid/qr?amount=1199000&reference=HD%2Ftest');
console.log('PASS: frontend VAT matches exact integer rounding; zero, half-dong, large totals, invalid prices and VAT-inclusive limits.');
