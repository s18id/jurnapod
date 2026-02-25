#!/usr/bin/env node
// Quick test for payment method default flags
import assert from "node:assert";

const API_BASE = process.env.API_BASE || "http://localhost:3001";

async function apiRequest(path, options = {}, token = null) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`API Error: ${data.error?.message || response.statusText}`);
  }
  return data;
}

async function login() {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      company_code: "JP",
      email: "ahmad@signal18.id",
      password: "ChangeMe123!"
    })
  });
  return data.access_token;
}

async function main() {
  console.log("🔐 Logging in...");
  const token = await login();
  console.log("✅ Logged in successfully");

  // Use outlet ID 1 (from seed data)
  const outletId = 1;
  console.log(`📍 Using outlet ID: ${outletId}`);

  // Fetch current payment method mappings
  console.log("\n📥 Fetching payment method mappings...");
  const mappingsResp = await apiRequest(
    `/outlet-payment-method-mappings?outlet_id=${outletId}`,
    {},
    token
  );
  console.log(`✅ Found ${mappingsResp.mappings.length} payment method mappings`);
  console.log("Current mappings:", JSON.stringify(mappingsResp.mappings, null, 2));

  // Check for invoice_default
  const invoiceDefault = mappingsResp.mappings.find((m) => m.is_invoice_default);
  
  console.log("\n📌 Default payment method:");
  console.log("  Invoice default:", invoiceDefault?.method_code || "None");

  // Test updating with defaults
  if (mappingsResp.mappings.length > 0) {
    console.log("\n🔄 Testing update with invoice default flag...");
    const firstMapping = mappingsResp.mappings[0];
    const updatedMappings = mappingsResp.mappings.map((m, idx) => ({
      method_code: m.method_code,
      account_id: m.account_id,
      label: m.label,
      is_invoice_default: idx === 0 // Set first as invoice default
    }));

    await apiRequest(
      "/outlet-payment-method-mappings",
      {
        method: "PUT",
        body: JSON.stringify({
          outlet_id: outletId,
          mappings: updatedMappings
        })
      },
      token
    );
    console.log("✅ Updated payment method mappings with defaults");

    // Verify the update
    const verifyResp = await apiRequest(
      `/outlet-payment-method-mappings?outlet_id=${outletId}`,
      {},
      token
    );
    const newInvoiceDefault = verifyResp.mappings.find((m) => m.is_invoice_default);

    console.log("\n✅ Verification:");
    console.log("  Invoice default:", newInvoiceDefault?.method_code);

    assert(newInvoiceDefault, "Invoice default should be set");
    console.log("\n🎉 All tests passed!");
  } else {
    console.log("\n⚠️  No payment methods configured, skipping update test");
  }

  // Test validation: try to set multiple invoice defaults (should fail)
  if (mappingsResp.mappings.length >= 2) {
    console.log("\n🧪 Testing validation: multiple invoice defaults (should fail)...");
    try {
      const invalidMappings = mappingsResp.mappings.map((m) => ({
        method_code: m.method_code,
        account_id: m.account_id,
        label: m.label,
        is_invoice_default: true // All set to true (invalid!)
      }));

      await apiRequest(
        "/outlet-payment-method-mappings",
        {
          method: "PUT",
          body: JSON.stringify({
            outlet_id: outletId,
            mappings: invalidMappings
          })
        },
        token
      );
      console.log("❌ Should have failed but didn't!");
      process.exit(1);
    } catch (error) {
      console.log("✅ Correctly rejected multiple invoice defaults:", error.message);
    }
  }

  console.log("\n✅ All tests completed successfully!");
}

main().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
