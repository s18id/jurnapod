import { expect, test } from "@playwright/test";

test("sync badge changes to Offline when network goes down", async ({ context, page }) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.goto("/");
  await expect(page.getByText("Sync: Synced")).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("Sync: Offline")).toBeVisible();

  await context.setOffline(false);
});

test("login + sync pull works with mocked API", async ({ page }) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        access_token: "test-token",
        token_type: "Bearer",
        expires_in: 3600
      })
    });
  });

  await page.route("**/api/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        user: {
          id: 1,
          company_id: 1,
          outlets: [
            {
              id: 10,
              code: "MAIN",
              name: "Main Outlet"
            }
          ]
        }
      })
    });
  });

  await page.route("**/api/sync/pull**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data_version: 10,
        items: [
          {
            id: 100,
            sku: "AMER",
            name: "Americano",
            type: "PRODUCT",
            is_active: true,
            updated_at: new Date().toISOString()
          }
        ],
        prices: [
          {
            id: 200,
            item_id: 100,
            outlet_id: 10,
            price: 18000,
            is_active: true,
            updated_at: new Date().toISOString()
          }
        ],
        config: {
          tax: {
            rate: 0,
            inclusive: false
          },
          payment_methods: ["CASH", "QRIS"]
        }
      })
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("Email").fill("cashier@example.com");
  await page.getByPlaceholder("Password").fill("password");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByText("Authenticated. Sync pull and push are now authorized.")).toBeVisible();

  await page.getByRole("button", { name: "Sync pull now" }).click();
  await expect(page.getByText(/Sync pull applied/)).toBeVisible();
  await expect(page.getByText("Product cache status for outlet 10: Ready")).toBeVisible();
});
