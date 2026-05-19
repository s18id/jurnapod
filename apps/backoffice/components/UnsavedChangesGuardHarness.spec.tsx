import { expect, test } from "@playwright/experimental-ct-react";

import { HashGuardHarness, MemoryGuardHarness } from "./UnsavedChangesGuardHarness";

test.describe("UnsavedChangesGuard browser harness", () => {
  test("blocks active hash navigation and completes the pending navigation after confirm", async ({ mount, page }) => {
    await page.evaluate(() => { window.location.hash = "#start"; });
    await mount(<HashGuardHarness />);

    await page.getByLabel("Amount").fill("20.00");
    await page.getByRole("button", { name: "Direct hash target" }).click();

    await expect(page.getByRole("dialog", { name: "Unsaved changes guard" })).toBeVisible();
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#start");

    await page.getByRole("button", { name: "Leave" }).click();

    await expect(page.getByRole("dialog", { name: "Unsaved changes guard" })).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#direct-target");
  });

  test("blocks custom router navigation and resumes it after confirm", async ({ mount, page }) => {
    await mount(<MemoryGuardHarness />);

    await page.getByRole("button", { name: "Custom route target" }).click();

    await expect(page.getByRole("dialog", { name: "Unsaved changes guard" })).toBeVisible();
    await expect(page.getByLabel("Current route")).toHaveText("/current");

    await page.getByRole("button", { name: "Leave" }).click();

    await expect(page.getByRole("dialog", { name: "Unsaved changes guard" })).toHaveCount(0);
    await expect(page.getByLabel("Current route")).toHaveText("/custom-target");
  });

  test("does not block hash navigation after dirty fields are reverted", async ({ mount, page }) => {
    await page.evaluate(() => { window.location.hash = "#revert-start"; });
    await mount(<HashGuardHarness />);

    await page.getByLabel("Amount").fill("20.00");
    await page.getByLabel("Amount").fill("10.00");
    await page.getByRole("link", { name: "Linked hash target" }).click();

    await expect(page.getByRole("dialog", { name: "Unsaved changes guard" })).toHaveCount(0);
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe("#linked-target");
  });
});
