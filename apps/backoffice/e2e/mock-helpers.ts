// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { Page } from "@playwright/test";

export const MOCK_USER = {
  id: 1,
  company_id: 1,
  email: "admin@example.com",
  name: "Admin User",
  global_roles: ["ADMIN", "OWNER"],
  roles: ["ADMIN", "OWNER"],
  outlet_role_assignments: [
    {
      outlet_id: 10,
      outlet_name: "Main Outlet",
      role_codes: ["ADMIN", "OWNER"]
    }
  ],
  outlets: [
    {
      id: 10,
      code: "MAIN",
      name: "Main Outlet"
    }
  ]
};

export const MOCK_COMPANY = {
  id: 1,
  code: "TESTCOMP",
  name: "Test Company",
  legal_name: "PT Test Company Indonesia",
  tax_id: "01.234.567.8-901.000",
  email: "contact@testcomp.com",
  phone: "+62 21 1234 5678",
  timezone: "Asia/Jakarta",
  currency_code: "IDR",
  address_line1: "Jl. Sudirman No. 123",
  address_line2: "Lantai 10",
  city: "Jakarta",
  postal_code: "10110",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null
};

export const MOCK_OUTLET = {
  id: 10,
  company_id: 1,
  code: "MAIN",
  name: "Main Outlet",
  city: "Jakarta",
  address_line1: "Jl. Sudirman No. 123",
  address_line2: null,
  postal_code: "10110",
  phone: "+62 21 1234 5678",
  email: "main@testcomp.com",
  timezone: "Asia/Jakarta",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

export async function mockHealth(page: Page): Promise<void> {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { service: "jurnapod-api" } })
    });
  });
}

export async function mockUserMe(page: Page, authenticated: boolean = true): Promise<void> {
  await page.route("**/api/users/me", async (route) => {
    if (authenticated) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: MOCK_USER
        })
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Not authenticated" })
      });
    }
  });
}

export async function mockCompanies(page: Page): Promise<void> {
  await page.route("**/api/companies*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [MOCK_COMPANY]
      })
    });
  });
}

export async function mockOutlets(page: Page): Promise<void> {
  await page.route("**/api/outlets*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [MOCK_OUTLET]
      })
    });
  });
}

export async function mockUsers(page: Page, users: any[] = []): Promise<void> {
  await page.route("**/api/users*", async (route) => {
    // Default mock users if none provided
    const mockUsers = users.length > 0 ? users : [
      {
        id: 1,
        company_id: 1,
        email: "admin@example.com",
        name: "Admin User",
        global_roles: ["ADMIN"],
        outlet_role_assignments: [
          {
            outlet_id: 10,
            outlet_name: "Main Outlet",
            role_codes: ["ADMIN"]
          }
        ],
        is_active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z"
      },
      {
        id: 2,
        company_id: 1,
        email: "manager@example.com",
        name: "Manager User",
        global_roles: ["MANAGER"],
        outlet_role_assignments: [
          {
            outlet_id: 10,
            outlet_name: "Main Outlet",
            role_codes: ["MANAGER"]
          }
        ],
        is_active: true,
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z"
      },
      {
        id: 3,
        company_id: 1,
        email: "cashier@example.com",
        name: "Cashier User",
        global_roles: [],
        outlet_role_assignments: [
          {
            outlet_id: 10,
            outlet_name: "Main Outlet",
            role_codes: ["CASHIER"]
          }
        ],
        is_active: true,
        created_at: "2026-01-03T00:00:00.000Z",
        updated_at: "2026-01-03T00:00:00.000Z"
      }
    ];
    
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: mockUsers,
        meta: {
          total: mockUsers.length,
          page: 1,
          page_size: 10,
          total_pages: 1
        }
      })
    });
  });
}

export async function mockLogin(page: Page): Promise<void> {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Set-Cookie": "session=test-session-token; Path=/; HttpOnly; SameSite=Strict"
      },
      body: JSON.stringify({
        success: true,
        data: {
          access_token: "test-access-token",
          token_type: "Bearer",
          expires_in: 3600
        }
      })
    });
  });
}

export async function mockRoles(page: Page): Promise<void> {
  await page.route("**/api/roles*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: 1,
            company_id: 1,
            code: "ADMIN",
            name: "Administrator",
            description: "Full access",
            is_global: true,
            role_level: 100,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z"
          },
          {
            id: 2,
            company_id: 1,
            code: "MANAGER",
            name: "Manager",
            description: "Outlet manager",
            is_global: false,
            role_level: 80,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z"
          },
          {
            id: 3,
            company_id: 1,
            code: "CASHIER",
            name: "Cashier",
            description: "Cashier role",
            is_global: false,
            role_level: 50,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z"
          }
        ]
      })
    });
  });
}

export async function mockModules(page: Page): Promise<void> {
  await page.route("**/api/settings/modules*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          { code: "sales", enabled: true, config_json: null },
          { code: "pos", enabled: true, config_json: null },
          { code: "inventory", enabled: true, config_json: null }
        ]
      })
    });
  });
}

export async function setupAuthenticatedPage(page: Page): Promise<void> {
  // Setup all mocks before navigation
  await mockHealth(page);
  await mockUserMe(page, true);
  await mockCompanies(page);
  await mockOutlets(page);
  await mockRoles(page);
  await mockModules(page);
  
  // Inject access token into memory before page loads
  // Similar to POS approach with localStorage
  await page.addInitScript(() => {
    // Expose test token for E2E - the session module will check this
    (window as any).__E2E_ACCESS_TOKEN__ = "test-access-token";
  });
}

export const MOCK_ITEM_GROUP = {
  id: 1,
  company_id: 1,
  parent_id: null,
  code: "FOOD",
  name: "Food Items",
  is_active: true,
  updated_at: "2026-01-01T00:00:00.000Z"
};

export const MOCK_ITEMS = [
  {
    id: 1,
    company_id: 1,
    sku: "SKU001",
    name: "Nasi Goreng",
    type: "PRODUCT",
    item_group_id: 1,
    barcode: null,
    barcode_type: null,
    cogs_account_id: 1,
    inventory_asset_account_id: 2,
    is_active: true,
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: 2,
    company_id: 1,
    sku: "SKU002",
    name: "Mie Goreng",
    type: "PRODUCT",
    item_group_id: 1,
    barcode: null,
    barcode_type: null,
    cogs_account_id: 1,
    inventory_asset_account_id: 2,
    is_active: true,
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: 3,
    company_id: 1,
    sku: "SKU003",
    name: "Kopi Hitam",
    type: "SERVICE",
    item_group_id: null,
    barcode: null,
    barcode_type: null,
    cogs_account_id: null,
    inventory_asset_account_id: null,
    is_active: true,
    updated_at: "2026-01-01T00:00:00.000Z"
  }
];

export async function mockItemGroups(page: Page): Promise<void> {
  await page.route("**/inventory/item-groups*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [MOCK_ITEM_GROUP]
      })
    });
  });
}

export async function mockItems(page: Page, items: any[] = []): Promise<void> {
  await page.route("**/inventory/items*", async (route) => {
    const mockItemsData = items.length > 0 ? items : MOCK_ITEMS;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: mockItemsData
      })
    });
  });
}

export async function mockAccounts(page: Page): Promise<void> {
  await page.route("**/api/accounts*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: 1,
            company_id: 1,
            code: "5100",
            name: "Cost of Goods Sold",
            type_name: "EXPENSE",
            is_group: false,
            is_active: true
          },
          {
            id: 2,
            company_id: 1,
            code: "1300",
            name: "Inventory Asset",
            type_name: "ASSET",
            is_group: false,
            is_active: true
          }
        ]
      })
    });
  });
}