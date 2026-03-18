// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useState, useEffect } from "react";
import { IonRefresher, IonRefresherContent, type RefresherEventDetail } from "@ionic/react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { useNavigate } from "react-router-dom";
import type { RuntimeProductCatalogItem, RuntimeProductCatalogItemVariant } from "../services/runtime-service.js";
import { ProductSearch } from "../features/products/ProductSearch.js";
import { ProductGrid } from "../features/products/ProductGrid.js";
import { useProducts } from "../features/products/useProducts.js";
import { Button, InlineAlert } from "../shared/components/index.js";
import { routes } from "../router/routes.js";
import { formatMoney } from "../shared/utils/money.js";
import { usePosAppState } from "../router/pos-app-state.js";
import { ServiceSwitchModal } from "../features/navigation/ServiceSwitchModal.js";
import { VariantSelector } from "../features/products/VariantSelector.js";
import type { OrderServiceType } from "../features/cart/useCart.js";
import { getCartLineKey } from "../features/cart/useCart.js";
import { useStockValidation } from "../features/stock/useStockValidation.js";

interface ProductsPageProps {
  context: WebBootstrapContext;
}

export function ProductsPage({ context }: ProductsPageProps): JSX.Element {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<RuntimeProductCatalogItem[]>([]);
  const {
    scope,
    cart,
    cartLines,
    cartTotals,
    upsertCartLine,
    payments,
    setPayments,
    activeOrderContext,
    setServiceType,
    setOrderReservationId,
    setGuestCount,
    setActiveReservationId,
    setOutletTables,
    setActiveTableId,
    outletTables,
    createOrderCheckpoint,
    hasUnsentDineInItems
  } = usePosAppState();
  const { visibleProducts, searchTerm, setSearchTerm } = useProducts({ catalog });
  const { checkStock, validationErrors, clearErrors } = useStockValidation({
    companyId: scope.company_id,
    outletId: scope.outlet_id
  });
  const [dineInGuardMessage, setDineInGuardMessage] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serviceSwitchModal, setServiceSwitchModal] = useState<{
    isOpen: boolean;
    fromServiceType: OrderServiceType;
    toServiceType: OrderServiceType;
  }>({
    isOpen: false,
    fromServiceType: "TAKEAWAY",
    toServiceType: "TAKEAWAY"
  });

  // Variant selector state
  const [variantSelectorOpen, setVariantSelectorOpen] = useState(false);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<RuntimeProductCatalogItem | null>(null);

  const loadProducts = React.useCallback(async () => {
    try {
      setLoadError(null);
      const products = await context.runtime.getProductCatalog(scope);
      setCatalog(products);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load products";
      setLoadError(message);
      console.error("Failed to load products:", error);
    }
  }, [context.runtime, scope]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (hasUnsentDineInItems) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "You have unsent items. Are you sure?";
      };
      
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [hasUnsentDineInItems]);

  const handleRefresh = (event: CustomEvent<RefresherEventDetail>) => {
    void loadProducts().finally(() => {
      event.detail.complete();
    });
  };

  const cartQuantities: Record<number, number> = Object.fromEntries(
    Object.values(cart).map((line) => [line.product.item_id, line.qty])
  );

  const handleServiceSwitch = (toServiceType: OrderServiceType) => {
    // If switching to same type, do nothing
    if (activeOrderContext.service_type === toServiceType) {
      return;
    }

    // If has items, show confirmation modal
    if (cartLines.length > 0) {
      setServiceSwitchModal({
        isOpen: true,
        fromServiceType: activeOrderContext.service_type,
        toServiceType
      });
    } else {
      // No items, switch directly
      performServiceSwitch(toServiceType, undefined);
    }
  };

  const performServiceSwitch = async (
    toServiceType: OrderServiceType,
    selectedTableId?: number
  ) => {
    // Switch to new service type
    setServiceType(toServiceType);

    if (toServiceType === "DINE_IN" && selectedTableId) {
      // Set the selected table
      setActiveTableId(selectedTableId);
      setDineInGuardMessage(null);
    } else if (toServiceType === "TAKEAWAY") {
      // Clear table-related state for takeaway
      setActiveTableId(null);
      setOrderReservationId(null);
      setGuestCount(null);
      setActiveReservationId(null);
      setDineInGuardMessage(null);
    }
  };

  const handleServiceSwitchConfirm = (selectedTableId?: number) => {
    performServiceSwitch(serviceSwitchModal.toServiceType, selectedTableId);
    setServiceSwitchModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleServiceSwitchCancel = () => {
    setServiceSwitchModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleAddProduct = async (product: RuntimeProductCatalogItem, variantId?: number, allowOutOfStockOverride?: boolean) => {
    if (activeOrderContext.service_type === "DINE_IN" && !activeOrderContext.table_id) {
      setDineInGuardMessage("Select a table from the Tables page before adding items for dine-in.");
      return;
    }

    // Check stock availability before adding (variant-aware)
    clearErrors();
    const currentQty = cart[getCartLineKey(product.item_id, variantId)]?.qty ?? 0;
    const requestedQty = currentQty + 1;
    const stockResult = await checkStock(product.item_id, requestedQty, variantId);

    if (stockResult && stockResult.track_stock && !stockResult.available && !allowOutOfStockOverride) {
      const variantName = variantId
        ? product.variants?.find(v => v.variant_id === variantId)?.variant_name
        : undefined;
      const displayName = variantName ? `${product.name} (${variantName})` : product.name;
      setStockError(
        `Insufficient stock for ${displayName}. Available: ${stockResult.quantity_available}, Requested: ${requestedQty}`
      );
      return;
    }

    setDineInGuardMessage(null);
    setStockError(null);

    // Create product with variant info if variantId provided
    const productWithVariant = variantId
      ? { ...product, variant_id: variantId }
      : product;

    upsertCartLine(productWithVariant, { qty: requestedQty });
    if (payments.length === 0 || payments[0].amount === 0) {
      const fallbackMethod = payments[0]?.method ?? "";
      setPayments([{ method: fallbackMethod, amount: product.price_snapshot }]);
    }
  };

  const handleRemoveProduct = (product: RuntimeProductCatalogItem) => {
    const currentQty = cart[getCartLineKey(product.item_id, product.variant_id)]?.qty ?? 0;
    if (currentQty > 0) {
      upsertCartLine(product, { qty: currentQty - 1 });
    }
  };

  const canRemoveProduct = (product: RuntimeProductCatalogItem): boolean => {
    const cartLine = cart[getCartLineKey(product.item_id, product.variant_id)];
    if (!cartLine) return true;
    // Can only reduce if current qty is greater than kitchen_sent qty
    return cartLine.qty > cartLine.kitchen_sent_qty;
  };

  const handleVariantSelect = (product: RuntimeProductCatalogItem) => {
    setSelectedProductForVariants(product);
    setVariantSelectorOpen(true);
  };

  const handleVariantAddToCart = (product: RuntimeProductCatalogItem, variantId: number, allowOutOfStockOverride?: boolean) => {
    void handleAddProduct(product, variantId, allowOutOfStockOverride);
  };

  const handleVariantSelectorClose = () => {
    setVariantSelectorOpen(false);
    setSelectedProductForVariants(null);
  };

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px"
  };

  // Get variants for the selected product, or empty array if none selected
  const currentVariants: RuntimeProductCatalogItemVariant[] = selectedProductForVariants?.variants ?? [];

  return (
    <div style={containerStyles}>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent />
      </IonRefresher>

      <h1 style={{ margin: "0 0 16px", fontSize: "20px", fontWeight: 700 }}>Start Order</h1>

      {loadError && (
        <InlineAlert
          title="Failed to load products"
          message={loadError}
          tone="error"
          onRetry={() => void loadProducts()}
        />
      )}

      <section
        style={{
          marginBottom: 12,
          padding: 12,
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          background: "#f8fafc"
        }}
      >
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>SERVICE MODE</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button
            id="service-type-takeaway"
            name="serviceTypeTakeaway"
            variant={activeOrderContext.service_type === "TAKEAWAY" ? "primary" : "secondary"}
            size="small"
            onClick={() => handleServiceSwitch("TAKEAWAY")}
          >
            Takeaway
          </Button>
          <Button
            id="service-type-dine-in"
            name="serviceTypeDineIn"
            variant={activeOrderContext.service_type === "DINE_IN" ? "primary" : "secondary"}
            size="small"
            onClick={() => handleServiceSwitch("DINE_IN")}
          >
            Dine-in
          </Button>
          <Button
            id="open-tables"
            name="openTables"
            variant="secondary"
            size="small"
            onClick={() => navigate(routes.tables.path)}
          >
            Open tables
          </Button>
        </div>
        {activeOrderContext.service_type === "DINE_IN" ? (
          <div style={{ marginTop: 8, fontSize: 13, color: "#334155" }}>
            {activeOrderContext.table_id
              ? `Table selected: T${activeOrderContext.table_id}`
              : "Table required before adding items."}
          </div>
        ) : null}
      </section>
      
      <ProductSearch
        value={searchTerm}
        onChange={setSearchTerm}
      />

      <div style={{ marginTop: "16px" }}>
        <ProductGrid
          products={visibleProducts}
          cartQuantities={cartQuantities}
          onAddProduct={handleAddProduct}
          onRemoveProduct={handleRemoveProduct}
          canRemoveProduct={canRemoveProduct}
          onVariantSelect={handleVariantSelect}
        />
      </div>

      {dineInGuardMessage ? (
        <p
          role="alert"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #fdba74",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          {dineInGuardMessage}
        </p>
      ) : null}

      {stockError ? (
        <p
          role="alert"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #f87171",
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          {stockError}
        </p>
      ) : null}

      <footer
        style={{
          marginTop: "auto",
          paddingTop: 12,
          borderTop: "1px solid #e2e8f0",
          position: "sticky",
          bottom: 0,
          background: "#ffffff"
        }}
      >
        <div style={{ fontSize: 13, color: "#475569" }}>
          Active order: {cartLines.length} item(s) • Total {formatMoney(cartTotals.grand_total)}
        </div>
        {!activeOrderContext.kitchen_sent && cartLines.length > 0 ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#9a3412", fontWeight: 600 }}>
            Draft order • Send to kitchen before payment
          </div>
        ) : activeOrderContext.kitchen_sent ? (
          <div style={{ marginTop: 6, fontSize: 12, color: "#166534", fontWeight: 600 }}>
            ✓ Sent to kitchen • Ready for payment or add more items
          </div>
        ) : null}
        {activeOrderContext.service_type === "DINE_IN" ? (
          activeOrderContext.kitchen_sent ? (
            <Button
              id="continue-to-cart"
              name="continueToCart"
              variant="primary"
              fullWidth
              style={{ marginTop: 10 }}
              onClick={() => navigate(routes.cart.path)}
            >
              Continue to cart
            </Button>
          ) : (
            <Button
              id="send-to-kitchen"
              name="sendToKitchen"
              variant="primary"
              fullWidth
              style={{ marginTop: 10 }}
              disabled={cartLines.length === 0}
              onClick={createOrderCheckpoint}
            >
              Send to kitchen
            </Button>
          )
        ) : (
          <Button
            id="continue-to-cart"
            name="continueToCart"
            variant="primary"
            fullWidth
            style={{ marginTop: 10 }}
            disabled={cartLines.length === 0}
            onClick={() => navigate(routes.cart.path)}
          >
            Continue to cart
          </Button>
        )}
      </footer>

      <ServiceSwitchModal
        isOpen={serviceSwitchModal.isOpen}
        fromServiceType={serviceSwitchModal.fromServiceType}
        toServiceType={serviceSwitchModal.toServiceType}
        onConfirm={handleServiceSwitchConfirm}
        onClose={handleServiceSwitchCancel}
        availableTables={outletTables}
        hasActiveItems={cartLines.length > 0}
      />

      <VariantSelector
        isOpen={variantSelectorOpen}
        onClose={handleVariantSelectorClose}
        product={selectedProductForVariants}
        variants={currentVariants}
        onAddToCart={handleVariantAddToCart}
        allowOutOfStockOverride={true}
      />
    </div>
  );
}
