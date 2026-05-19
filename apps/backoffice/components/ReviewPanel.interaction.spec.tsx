import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";

import { ReviewPanelFeatureFlagHarness, ReviewPanelFixture, ReviewPanelModalHarness } from "./ReviewPanelInteractionHarness";

async function tabUntilFocused(page: Page, target: Locator, maxTabs = 12): Promise<void> {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((node) => node === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

test.describe("ReviewPanel interaction hardening", () => {
  test("supports keyboard-only section progression with Tab, Enter, and Space", async ({ mount, page }) => {
    await mount(<ReviewPanelFixture />);

    const completeHeader = page.getByRole("button", { name: "Complete Header section" });
    await tabUntilFocused(page, completeHeader);
    await page.keyboard.press("Enter");

    await expect(page.getByLabel("Header section status: Complete")).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete Lines section" })).toBeVisible();

    const completeLines = page.getByRole("button", { name: "Complete Lines section" });
    await tabUntilFocused(page, completeLines);
    await page.keyboard.press("Space");

    await expect(page.getByLabel("Lines section status: Complete")).toBeVisible();
  });

  test("moves focus to the first invalid field and announces section errors", async ({ mount, page }) => {
    await mount(<ReviewPanelFixture invalidLines />);

    await page.getByRole("button", { name: "Go to step 2: Lines" }).click();
    await page.getByRole("button", { name: "Complete Lines section" }).click();

    await expect(page.getByLabel("Invoice amount")).toBeFocused();
    await expect(page.getByRole("alert", { name: "Lines validation errors" })).toContainText("Amount cannot be negative.");
    await expect(page.getByRole("alert", { name: "Validation errors present" })).toContainText("Resolve validation errors before final submission.");
  });

  test("traps modal focus and returns focus after dismissal", async ({ mount, page }) => {
    await mount(<ReviewPanelModalHarness />);

    const trigger = page.getByRole("button", { name: "Attempt guarded navigation" });
    await trigger.click();
    const dialogText = page.getByText("You have unsaved changes. Stay on this page or leave and discard unsaved edits?");
    await expect(dialogText).toBeVisible();

    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role='dialog'], .mantine-Modal-content")))).toBe(true);
    }

    await page.keyboard.press("Shift+Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[role='dialog'], .mantine-Modal-content")))).toBe(true);
    await page.getByRole("button", { name: "Stay" }).click();

    await expect(dialogText).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("hides shadow rollout panels on production-like routes and renders enabled rollout", async ({ mount, page }) => {
    await mount(<ReviewPanelFeatureFlagHarness />);

    await expect(page.getByText("Shadow Review Panel")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Enabled Review Panel" })).toBeVisible();
  });
});
