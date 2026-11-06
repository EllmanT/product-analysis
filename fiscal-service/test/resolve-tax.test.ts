import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveTaxIds, validateRequest, type DeviceRules } from "../src/engine/validate.js";
import type { SubmitRequest } from "../src/engine/types.js";

const rules: DeviceRules = {
  vatPayer: true,
  taxes: [{ taxID: 1, taxPercent: null }, { taxID: 2, taxPercent: 0 }, { taxID: 517, taxPercent: 15.5 }, { taxID: 9, taxPercent: 15.5 }],
};
const base = (taxPercent: number | null, taxId?: number): SubmitRequest => ({
  tenantId: "t", invoiceNo: "A-1", currency: "USD",
  lines: [{ name: "x", unitPrice: "1.00", quantity: 1, taxId, taxPercent, hsCode: "99001000" }],
  payments: [{ moneyType: "Cash", amount: "1.00" }],
});

test("a percent with one match gets its tax id", () => {
  assert.equal(resolveTaxIds(base(0), rules).lines[0]!.taxId, 2);
  assert.equal(resolveTaxIds(base(null), rules).lines[0]!.taxId, 1);
});
test("an ambiguous percent is left for validation to report", () => {
  const r = resolveTaxIds(base(15.5), rules);
  assert.equal(r.lines[0]!.taxId, undefined);
  assert.ok(validateRequest(r, rules).some((p) => p.code === "TAX_UNKNOWN"));
});
test("a given tax id is never changed, and the input is not mutated", () => {
  const req = base(15.5, 517);
  assert.equal(resolveTaxIds(req, rules), req);
  const open = base(0);
  resolveTaxIds(open, rules);
  assert.equal(open.lines[0]!.taxId, undefined);
});
