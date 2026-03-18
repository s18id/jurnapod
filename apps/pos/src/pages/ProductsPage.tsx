// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useState, useEffect, useCallback, useRef } from "react";
import { IonRefresher, IonRefresherContent, type RefresherEventDetail } from "@ionic/react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { useNavigate } from "react-router-dom";
import type { RuntimeProductCatalogItem, RuntimeProductCatalogItemVariant } from "../services/runtime-service.js";
import { ProductSearch } from "../features/products/ProductSearch.js";
import { ProductGrid } from "../features/products/ProductGrid.js";
import { useProducts, type BarcodeMatch } from "../features/products/useProducts.js";
import { Button, InlineAlert } from "../shared/components/index.js";
import { routes } from "../router/routes.js";
import { formatMoney } from "../shared/utils/money.js";
import { usePosAppState } from "../router/pos-app-state.js";
import { ServiceSwitchModal } from "../features/navigation/ServiceSwitchModal.js";
import { VariantSelector } from "../features/products/VariantSelector.js";
import { BarcodeMatchSelector, type BarcodeMatch as BarcodeMatchSelectorMatch } from "../features/products/BarcodeMatchSelector.js";
import { readAccessToken } from "../offline/auth-session.js";
import type { OrderServiceType } from "../features/cart/useCart.js";
import { getCartLineKey } from "../features/cart/useCart.js";
import { useStockValidation } from "../features/stock/useStockValidation.js";

interface ProductsPageProps {
  context: WebBootstrapContext;
}

/**
 * Check if a search term looks like a barcode.
 *
 * HEURISTIC RULES:
 * - Numeric-only strings (6-20 chars): Likely EAN-13 (13 digits) or UPC (12 digits)
 * - Long alphanumeric strings (20+ chars): Likely Code 128 or other 1D/2D barcodes
 * - Short alphanumeric with letters (6-19 chars): Likely SKU search, NOT barcode
 *
 * This prevents alphanumeric SKU queries (e.g., "ABC123", "SHIRT-L") from being
 * incorrectly treated as barcode scans, ensuring they follow the text search path.
 */
function looksLikeBarcode(term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.length < 6 || trimmed.length > 50) return false;

  // Must be alphanumeric (allow underscore/hyphen as some barcode formats include them)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return false;

  // Numeric-only: treat as barcode (EAN-13, UPC-A, etc.)
  if (/^\d+$/.test(trimmed)) return true;

  // Contains letters: only treat as barcode if very long (Code 128 style)
  // Short alphanumeric strings are likely SKU searches
  return trimmed.length >= 20;
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
    setActiveTableId,
    outletTables,
    createOrderCheckpoint,
    hasUnsentDineInItems
  } = usePosAppState();
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

  // Barcode match selector state
  const [barcodeSelectorOpen, setBarcodeSelectorOpen] = useState(false);

  // Track recent barcode lookups with timestamp (2-second anti-spam window)
  // Allows repeated scans after cooldown but prevents rapid-fire duplicates
  const recentBarcodeLookups = useRef<Map<string, number>>(new Map());
  const BARCODE_LOOKUP_COOLDOWN_MS = 2000;

  // API barcode matches (from fallback lookup)
  const [apiBarcodeMatches, setApiBarcodeMatches] = useState<BarcodeMatchSelectorMatch[]>([]);

  const { checkStock, clearErrors } = useStockValidation({
    companyId: scope.company_id,
    outletId: scope.outlet_id
  });

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
      ? (() => {
          const variant = product.variants?.find((v) => v.variant_id === variantId);
          if (!variant) {
            // Fallback: keep parent data if variant not found (shouldn't happen)
            return { ...product, variant_id: variantId };
          }
          return {
            ...product,
            variant_id: variantId,
            price_snapshot: variant.price,
            variant_name: variant.variant_name,
            barcode: variant.barcode ?? product.barcode,
          };
        })()
      : product;

    upsertCartLine(productWithVariant, { qty: requestedQty });
    if (payments.length === 0 || payments[0].amount === 0) {
      const fallbackMethod = payments[0]?.method ?? "";
      setPayments([{ method: fallbackMethod, amount: productWithVariant.price_snapshot }]);
    }
  };

  // Handle barcode match from local cache search
  const handleBarcodeMatch = useCallback((product: RuntimeProductCatalogItem, variantId?: number) => {
    // If variantId is specified, add that specific variant
    if (variantId) {
      void handleAddProduct(product, variantId);
      return;
    }

    // If product has variants but no specific variant matched, open variant selector
    if (product.has_variants && product.variants && product.variants.length > 0) {
      setSelectedProductForVariants(product);
      setVariantSelectorOpen(true);
      return;
    }

    // Simple product - add directly
    void handleAddProduct(product);
  }, []);

  const {
    visibleProducts,
    searchTerm,
    setSearchTerm,
    barcodeLookup,
    performBarcodeLookup,
    clearBarcodeLookup,
    localBarcodeMatch,
    localBarcodeMatches,
    clearLocalBarcodeMatches
  } = useProducts({
    catalog,
    onBarcodeMatch: handleBarcodeMatch
  });

  // Clear barcode lookup error when search changes
  useEffect(() => {
    if (barcodeLookup.error) {
      clearBarcodeLookup();
    }
  }, [searchTerm, clearBarcodeLookup]);

  // Trigger API barcode lookup when local search returns no matches for barcode-like input
  useEffect(() => {
    const trimmedTerm = searchTerm.trim();
    
    // Only proceed if:
    // 1. Search term looks like a barcode
    // 2. No local matches found
    // 3. Not already looking up this barcode (with cooldown)
    if (!looksLikeBarcode(trimmedTerm)) return;
    if (localBarcodeMatch || localBarcodeMatches.length > 0) return;
    if (barcodeLookup.isLoading) return;
    
    // Check if this barcode was looked up recently (within cooldown window)
    const lastLookup = recentBarcodeLookups.current.get(trimmedTerm);
    if (lastLookup && (Date.now() - lastLookup < BARCODE_LOOKUP_COOLDOWN_MS)) return;

    // Check online status
    const isOnline = context.runtime.isOnline();
    if (!isOnline) {
      // Silently skip API lookup when offline - no error shown
      return;
    }

    const token = readAccessToken();
    
    // Mark this barcode with current timestamp
    recentBarcodeLookups.current.set(trimmedTerm, Date.now());
    
    // Trigger API lookup
    void performBarcodeLookup(trimmedTerm, token, isOnline);
  }, [searchTerm, localBarcodeMatch, localBarcodeMatches.length, barcodeLookup.isLoading, performBarcodeLookup, context.runtime]);

  // Handle successful API barcode lookup - route based on match count
  useEffect(() => {
    if (barcodeLookup.isLoading) return;
    if (barcodeLookup.matches.length === 0) return;

    const matches = barcodeLookup.matches;

    if (matches.length === 1) {
      // Single match: auto-add (preserves current UX for happy path)
      const product = matches[0];

      // If product has variants, open variant selector
      if (product.has_variants && product.variants && product.variants.length > 0) {
        setSelectedProductForVariants(product);
        setVariantSelectorOpen(true);
      } else {
        // Simple product - add directly
        void handleAddProduct(product);
      }
    } else if (matches.length > 1) {
      // Multiple matches: require user selection (prevents silent wrong-item add)
      const selectorMatches: BarcodeMatchSelectorMatch[] = matches.map(product => ({
        item_id: product.item_id,
        variant_id: undefined,
        name: product.name,
        variant_name: null,
        sku: product.sku ?? null,
        barcode: product.barcode ?? null,
        price_snapshot: product.price_snapshot,
        item_type: product.item_type
      }));
      setApiBarcodeMatches(selectorMatches);
      setBarcodeSelectorOpen(true);
    }

    // Clear the lookup so we don't re-process on next render
    clearBarcodeLookup();
  }, [barcodeLookup.matches, barcodeLookup.isLoading, handleAddProduct, clearBarcodeLookup]);

  // Clear recent barcode lookups when search term changes to non-barcode
  useEffect(() => {
    if (!looksLikeBarcode(searchTerm) && searchTerm.trim() === '') {
      recentBarcodeLookups.current.clear();
    }
  }, [searchTerm]);

  // Open barcode selector when there are multiple matches
  useEffect(() => {
    if (localBarcodeMatches.length > 1) {
      setBarcodeSelectorOpen(true);
    }
  }, [localBarcodeMatches]);

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

  // Handle barcode match selection from the selector modal
  const handleBarcodeMatchSelect = (match: BarcodeMatchSelectorMatch) => {
    // Check if this is an API match (not in local catalog)
    const product = catalog.find(p => p.item_id === match.item_id);

    if (product) {
      // Local catalog match - add to cart via handleAddProduct
      void handleAddProduct(product, match.variant_id);
    } else {
      // API match - find in apiBarcodeMatches and add directly
      const apiMatch = apiBarcodeMatches.find(m => m.item_id === match.item_id);
      if (apiMatch) {
        // Reconstruct RuntimeProductCatalogItem from API match
        const apiProduct: RuntimeProductCatalogItem = {
          item_id: apiMatch.item_id,
          sku: apiMatch.sku,
          barcode: apiMatch.barcode,
          thumbnail_url: null, // Not available in API match
          name: apiMatch.name,
          item_type: apiMatch.item_type,
          price_snapshot: apiMatch.price_snapshot,
          has_variants: false, // API matches are base products
          variants: []
        };
        void handleAddProduct(apiProduct, match.variant_id);
      }
    }

    // Clear the matches and close the selector
    clearLocalBarcodeMatches();
    setApiBarcodeMatches([]);
    setBarcodeSelectorOpen(false);
  };

  const handleBarcodeSelectorClose = () => {
    clearLocalBarcodeMatches();
    setApiBarcodeMatches([]);
    setBarcodeSelectorOpen(false);
  };

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px"
  };

  // Get variants for the selected product, or empty array if none selected
  const currentVariants: RuntimeProductCatalogItemVariant[] = selectedProductForVariants?.variants ?? [];

  // Transform local barcode matches to BarcodeMatchSelector format
  const localSelectorMatches: BarcodeMatchSelectorMatch[] = localBarcodeMatches.map(match => ({
    item_id: match.product.item_id,
    variant_id: match.variant?.variant_id,
    name: match.product.name,
    variant_name: match.variant?.variant_name ?? null,
    sku: match.product.sku ?? null,
    barcode: match.product.barcode ?? null,
    price_snapshot: match.variant?.price ?? match.product.price_snapshot,
    item_type: match.product.item_type
  }));

  // Combine local and API matches for the selector
  const barcodeSelectorMatches: BarcodeMatchSelectorMatch[] = [...localSelectorMatches, ...apiBarcodeMatches];

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

      {barcodeLookup.isLoading && (
        <p
          role="status"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #93c5fd",
            background: "#eff6ff",
            color: "#1e40af",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          Looking up barcode online...
        </p>
      )}

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

      {barcodeLookup.error ? (
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
          {barcodeLookup.error}
        </p>
      ) : null}

      {localBarcodeMatch ? (
        <p
          role="status"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #86efac",
            background: "#f0fdf4",
            color: "#166534",
            fontSize: 13,
            fontWeight: 600
          }}
        >
          Added {localBarcodeMatch.product.name}
          {localBarcodeMatch.variant ? ` (${localBarcodeMatch.variant.variant_name})` : ""} to cart
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

      <BarcodeMatchSelector
        isOpen={barcodeSelectorOpen}
        onClose={handleBarcodeSelectorClose}
        barcode={searchTerm.trim()}
        matches={barcodeSelectorMatches}
        onSelect={handleBarcodeMatchSelect}
      />
    </div>
  );
}
