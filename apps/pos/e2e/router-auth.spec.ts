// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { expect, test } from "@playwright/test";

const ACCESS_TOKEN_STORAGE_KEY = "jurnapod_pos_access_token";

async function mockUserMe(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          company_id: 1,
          outlets: [
            {
              id: 1,
              code: "MAIN",
              name: "Main Outlet"
            }
          ]
        }
      })
    });
  });
}

test("/login redirects to checkout when token exists", async ({ page }) => {
  await mockUserMe(page);
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "test-token");
  }, ACCESS_TOKEN_STORAGE_KEY);

  await page.goto("/login");

  await expect(page).toHaveURL(/\/$/);
});

test("/login stays on login when token missing", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, ACCESS_TOKEN_STORAGE_KEY);

  await page.goto("/login");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByPlaceholder("Email")).toBeVisible();
});

test("/cart redirects to /login when token missing", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, ACCESS_TOKEN_STORAGE_KEY);

  await page.goto("/cart");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByPlaceholder("Email")).toBeVisible();
});

test("/auth/callback stays routable for OAuth processing", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, ACCESS_TOKEN_STORAGE_KEY);

  await page.goto("/auth/callback?code=test-code&state=test-state");

  await expect(page).toHaveURL(/\/auth\/callback\?code=test-code&state=test-state$/);
});

test("logout from checkout redirects to /login", async ({ page }) => {
  await mockUserMe(page);
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "test-token");
  }, ACCESS_TOKEN_STORAGE_KEY);

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Logout" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByPlaceholder("Email")).toBeVisible();
});
