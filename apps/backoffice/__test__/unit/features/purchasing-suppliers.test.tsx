import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PurchasingSuppliersPage,
  SupplierContactsPanel,
  contactFormToInput,
  supplierFormToCreateInput,
  validateContactForm,
  validateSupplierForm,
} from "@/features/purchasing/suppliers";
import {
  SUPPLIERS_DEFAULT_LIMIT,
  buildSupplierSearchParams,
  pageToSupplierOffset,
  supplierQueryKeys,
  type Supplier,
  type SupplierListResult,
} from "@/features/purchasing/suppliers/api";
import type { SessionUser } from "@/lib/session";

function makeUser(permissions: SessionUser["permissions"]): SessionUser {
  return {
    id: 7,
    company_id: 42,
    email: "buyer@example.com",
    roles: ["OWNER"],
    global_roles: [],
    outlet_role_assignments: [],
    outlets: [],
    permissions,
  };
}

const supplier: Supplier = {
  id: 101,
  company_id: 42,
  code: "SUP-001",
  name: "Acme Supplies",
  email: "buyer@acme.example",
  phone: "+6221000000",
  address_line1: "Jl. Supplier 1",
  address_line2: null,
  city: "Jakarta",
  postal_code: "10110",
  country: "ID",
  currency: "IDR",
  credit_limit: "1000000.0000",
  payment_terms_days: 30,
  notes: "Primary stationery supplier",
  is_active: true,
  created_by_user_id: 7,
  updated_by_user_id: 7,
  created_at: "2026-05-19T00:00:00.000Z",
  updated_at: "2026-05-19T00:00:00.000Z",
  contacts: [
    {
      id: 201,
      supplier_id: 101,
      name: "Ari Contact",
      email: "ari@acme.example",
      phone: "+6221999999",
      role: "Sales",
      is_primary: true,
      notes: null,
      created_at: "2026-05-19T00:00:00.000Z",
      updated_at: "2026-05-19T00:00:00.000Z",
    },
  ],
};

function renderSuppliersPage(user: SessionUser, data?: SupplierListResult): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (data) {
    queryClient.setQueryData(
      supplierQueryKeys.list({ search: "", status: "active", limit: SUPPLIERS_DEFAULT_LIMIT, offset: 0 }),
      data,
    );
  }

  return renderToStaticMarkup(
    createElement(
      MantineProvider,
      {},
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(PurchasingSuppliersPage, { user }),
      ),
    ),
  );
}

describe("Purchasing supplier backoffice", () => {
  const fullUser = makeUser([{ module: "purchasing", resource: "suppliers", mask: 15 }]);
  const readOnlyUser = makeUser([{ module: "purchasing", resource: "suppliers", mask: 1 }]);

  it("maps supported status filters to active/inactive API queries only", () => {
    const active = buildSupplierSearchParams({ status: "active", limit: 20, offset: 0, search: " Acme " }).toString();
    const inactive = buildSupplierSearchParams({ status: "inactive", limit: 20, offset: 40 }).toString();

    expect(pageToSupplierOffset(3, 20)).toBe(40);
    expect(active).toContain("is_active=true");
    expect(active).toContain("search=Acme");
    expect(inactive).toContain("is_active=false");
    expect(inactive).toContain("limit=20");
    expect(inactive).toContain("offset=40");
    expect(inactive).not.toContain("status=all");
  });

  it("includes company_id in supplier create payload and validates ReviewPanel fields", () => {
    const formData = {
        code: " SUP-NEW ",
        name: " New Supplier ",
        email: "contact@supplier.example",
        phone: "",
        address_line1: "",
        address_line2: "",
        city: "",
        postal_code: "",
        country: "",
        currency: "idr",
        credit_limit: "5000.25",
        payment_terms_days: "14",
        notes: "",
      };
    const input = supplierFormToCreateInput(formData, 42);

    expect(input.company_id).toBe(42);
    expect(input.code).toBe("SUP-NEW");
    expect(input.currency).toBe("IDR");
    expect(input.payment_terms_days).toBe(14);
    expect(input.phone).toBeNull();
    expect(validateSupplierForm({ ...formData, email: "not-email" }, "create").email).toContain("valid email");
  });

  it("renders supplier list, filters, pagination table, and create action for permitted users", () => {
    const html = renderSuppliersPage(fullUser, { suppliers: [supplier], total: 1, limit: 20, offset: 0 });

    expect(html).toContain("Suppliers");
    expect(html).toContain("Search suppliers");
    expect(html).toContain("Active");
    expect(html).toContain("Acme Supplies");
    expect(html).toContain("1000000.0000");
    expect(html).toContain("New supplier");
    expect(html).toContain("Edit");
    expect(html).toContain("Deactivate");
  });

  it("hides create/edit/delete actions when purchasing.suppliers permissions are absent", () => {
    const html = renderSuppliersPage(readOnlyUser, { suppliers: [supplier], total: 1, limit: 20, offset: 0 });

    expect(html).toContain("Acme Supplies");
    expect(html).not.toContain("New supplier");
    expect(html).not.toContain("Deactivate");
    expect(html).not.toContain("Reactivate");
  });

  it("denies the screen without purchasing.suppliers.READ", () => {
    const html = renderSuppliersPage(makeUser([{ module: "inventory", resource: "items", mask: 63 }]));

    expect(html).toContain("Access denied");
    expect(html).toContain("purchasing.suppliers.READ");
  });

  it("renders supplier contact actions only when permissions allow them", () => {
    const html = renderToStaticMarkup(createElement(
      MantineProvider,
      {},
      createElement(SupplierContactsPanel, {
        contacts: supplier.contacts ?? [],
        loading: false,
        error: null,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        onCreate: () => undefined,
        onEdit: () => undefined,
        onDelete: () => undefined,
      }),
    ));
    const readOnlyHtml = renderToStaticMarkup(createElement(
      MantineProvider,
      {},
      createElement(SupplierContactsPanel, {
        contacts: supplier.contacts ?? [],
        loading: false,
        error: null,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        onCreate: () => undefined,
        onEdit: () => undefined,
        onDelete: () => undefined,
      }),
    ));

    expect(html).toContain("Ari Contact");
    expect(html).toContain("Add contact");
    expect(html).toContain("Edit");
    expect(html).toContain("Delete");
    expect(readOnlyHtml).toContain("Ari Contact");
    expect(readOnlyHtml).not.toContain("Add contact");
    expect(readOnlyHtml).not.toContain("Delete");
  });

  it("validates and maps supplier contact form input", () => {
    const input = contactFormToInput({
      name: " Ari Contact ",
      email: "ari@acme.example",
      phone: "",
      role: " Sales ",
      is_primary: true,
      notes: "",
    });

    expect(input.name).toBe("Ari Contact");
    expect(input.phone).toBeNull();
    expect(input.role).toBe("Sales");
    expect(input.is_primary).toBe(true);
    expect(validateContactForm({ ...input, email: "bad-email", phone: "", role: "", notes: "" }).email).toContain("valid email");
  });
});
