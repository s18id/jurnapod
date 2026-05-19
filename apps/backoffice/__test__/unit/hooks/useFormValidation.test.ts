import { describe, expect, it } from "vitest";

import { hasValidationErrors, moneyFieldValidator, validateFields, type ValidationRules } from "@/hooks/useFormValidation";

interface InvoiceForm {
  amount: string;
  tax: string;
  total: string;
  supplierId?: string;
}

describe("useFormValidation helpers", () => {
  it("rejects negative money and zero amounts when rules prohibit zero", async () => {
    const rules: ValidationRules<InvoiceForm> = {
      fields: { amount: [moneyFieldValidator({ label: "Invoice amount" })] },
    };

    expect((await validateFields({ amount: "-1", tax: "0", total: "-1" }, rules))[0].message).toBe("Invoice amount cannot be negative.");
    expect((await validateFields({ amount: "0", tax: "0", total: "0" }, rules))[0].message).toBe("Invoice amount must be greater than zero.");
  });

  it("runs cross-field validation for interdependent totals", async () => {
    const rules: ValidationRules<InvoiceForm> = {
      crossField: [(values) => {
        const amount = Number(values.amount);
        const tax = Number(values.tax);
        const total = Number(values.total);
        return amount + tax === total ? undefined : [{ field: "total", message: "Total must equal amount plus tax." }];
      }],
    };

    const issues = await validateFields({ amount: "100", tax: "10", total: "111" }, rules);
    expect(issues).toEqual([{ field: "total", message: "Total must equal amount plus tax.", severity: "error" }]);
    expect(hasValidationErrors(issues)).toBe(true);
  });

  it("re-validates restored draft data against current rules", async () => {
    const restored = { amount: "100", tax: "10", total: "110" };
    const stricterRules: ValidationRules<InvoiceForm> = {
      fields: {
        supplierId: [() => "Supplier is required under current rules."],
      },
    };

    expect((await validateFields(restored, stricterRules))[0]).toMatchObject({ field: "supplierId", message: "Supplier is required under current rules." });
  });

  it("awaits async validation so pending checks can block section completion", async () => {
    const rules: ValidationRules<InvoiceForm> = {
      fields: {
        supplierId: [async (_value) => "Supplier is inactive."],
      },
    };

    const issues = await validateFields({ amount: "100", tax: "10", total: "110", supplierId: "S-1" }, rules, ["supplierId"]);
    expect(issues).toEqual([{ field: "supplierId", message: "Supplier is inactive.", severity: "error" }]);
  });
});
