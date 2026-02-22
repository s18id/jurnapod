import { expect, test } from "@playwright/test";

const companyCode = process.env.E2E_COMPANY_CODE ?? process.env.JP_COMPANY_CODE;
const email = process.env.E2E_OWNER_EMAIL ?? process.env.JP_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD ?? process.env.JP_OWNER_PASSWORD;

test.describe("real API sync pull", () => {
  test.skip(!companyCode || !email || !password, "Set E2E_COMPANY_CODE/E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD or JP_* env vars");

  test("login then sync pull succeeds without auth errors", async ({ page }) => {
    await page.goto("/");

    await page.getByPlaceholder("Company code").fill(companyCode ?? "");
    await page.getByPlaceholder("Email").fill(email ?? "");
    await page.getByPlaceholder("Password").fill(password ?? "");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page.getByText("Auth token ready")).toBeVisible();

    await page.getByRole("button", { name: "Sync pull now" }).click();

    await expect(page.locator("text=/Sync pull applied|Sync pull failed/")).toBeVisible();
    await expect(page.getByText("UNAUTHORIZED", { exact: false })).toHaveCount(0);
    await expect(page.getByText("FORBIDDEN", { exact: false })).toHaveCount(0);
  });
});
