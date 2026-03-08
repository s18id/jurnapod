// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";
import { E2E_SELECTORS } from "./selectors.js";

const ACCESS_TOKEN_STORAGE_KEY = "jurnapod_pos_access_token";
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const companyCode = process.env.E2E_COMPANY_CODE ?? process.env.JP_COMPANY_CODE;
const email = process.env.E2E_OWNER_EMAIL ?? process.env.JP_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD ?? process.env.JP_OWNER_PASSWORD;

function requireEnv(value: string | undefined, key: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing ${key}. Set E2E_COMPANY_CODE/E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD (or JP_* equivalents) before running qa:e2e:real.`
    );
  }

  return value;
}

test.describe("real API sync pull", () => {
  test("login then sync pull succeeds without auth errors", async ({ page, request }) => {
    test.skip(!companyCode || !email || !password, "Set E2E_COMPANY_CODE/E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD or JP_* env vars");
    const resolvedCompanyCode = requireEnv(companyCode, "E2E_COMPANY_CODE");
    const resolvedEmail = requireEnv(email, "E2E_OWNER_EMAIL");
    const resolvedPassword = requireEnv(password, "E2E_OWNER_PASSWORD");

    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.locator(E2E_SELECTORS.login.companyCode).fill(resolvedCompanyCode);
    await page.locator(E2E_SELECTORS.login.email).fill(resolvedEmail);
    await page.locator(E2E_SELECTORS.login.password).fill(resolvedPassword);

    await expect(page.locator(E2E_SELECTORS.login.submit)).toBeEnabled();
    const loginRequestPromise = page.waitForRequest(
      (request) => request.url().includes("/api/auth/login") && request.method() === "POST"
    );
    await page.locator(E2E_SELECTORS.login.submit).click();
    const loginRequest = await loginRequestPromise;
    const loginResponse = await loginRequest.response();

    if (!loginResponse || !loginResponse.ok()) {
      const apiLoginResponse = await request.post(`${apiBaseUrl}/api/auth/login`, {
        headers: {
          "content-type": "application/json"
        },
        data: {
          company_code: resolvedCompanyCode,
          email: resolvedEmail,
          password: resolvedPassword
        }
      });

      expect(apiLoginResponse.ok(), "UI login failed and API fallback login also failed").toBeTruthy();
      const payload = (await apiLoginResponse.json()) as
        | { success: true; data: { access_token: string } }
        | { success: false; data?: { message?: string } };

      if (!payload || payload.success !== true || typeof payload.data?.access_token !== "string") {
        throw new Error("API fallback login did not return a valid access token");
      }

      await page.evaluate(
        ([storageKey, token]) => {
          localStorage.setItem(storageKey, token);
        },
        [ACCESS_TOKEN_STORAGE_KEY, payload.data.access_token] as const
      );
      await page.goto("/settings");
    } else {
      await expect(page).toHaveURL(/\/(products|service-mode|settings|tables|cart|checkout)$/);
      await page.goto("/settings");
    }
    const pullResponsePromise = page.waitForResponse((response) => response.url().includes("/api/sync/pull"));
    await page.locator(E2E_SELECTORS.sync.pullNow).click();
    const pullResponse = await pullResponsePromise;
    expect([200, 304]).toContain(pullResponse.status());

    await expect(page.getByText("UNAUTHORIZED", { exact: false })).toHaveCount(0);
    await expect(page.getByText("FORBIDDEN", { exact: false })).toHaveCount(0);
  });
});
