// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export const E2E_SELECTORS = {
  login: {
    companyCode: "#login-company-code",
    email: "#login-email",
    password: "#login-password",
    submit: "#login-submit"
  },
  serviceMode: {
    title: "#service-mode-title",
    takeaway: "#service-mode-takeaway",
    dineIn: "#service-mode-dine-in",
    resumeActiveOrder: "#service-mode-resume-active-order"
  },
  products: {
    serviceTypeTakeaway: "#service-type-takeaway",
    serviceTypeDineIn: "#service-type-dine-in",
    addCoffee: "#product-add-cof-01",
    addAmericano: "#product-add-amer",
    addSku101: "#product-add-sku-101",
    removeCoffee: "#product-remove-cof-01",
    continueToCart: "#continue-to-cart"
  },
  settings: {
    refreshCatalog: "#settings-refresh-catalog",
    logout: "#settings-logout"
  },
  sync: {
    pullNow: "#sync-pull-now"
  },
  tables: {
    anyAction: "[id^='table-action-']"
  },
  serviceSwitchModal: {
    title: "#service-switch-modal-title",
    tableTitle: "#service-switch-table-title"
  },
  headerNav: {
    cart: "#header-nav-cart"
  },
  reservations: {
    customerName: "#reservation-customer-name",
    tableId: "#reservation-table-id",
    create: "#reservation-create",
    anyContinueOrder: "[id^='reservation-continue-order-']",
    anyStatusCancelled: "[id*='-cancelled']",
    anyStatusArrived: "[id*='-arrived']",
    anyStatusSeated: "[id*='-seated']"
  },
  cart: {
    transferTargetTable: "#cart-transfer-target-table",
    moveTable: "#cart-move-table",
    finalizeOrder: "#cart-finalize-order",
    cancelQuantity: "#cart-cancel-quantity",
    cancelReason: "#cart-cancel-reason",
    confirmCancellation: "#cart-confirm-cancellation"
  }
} as const;
