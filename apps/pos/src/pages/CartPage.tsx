// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React from "react";
import type { WebBootstrapContext } from "../bootstrap/web.js";
import { CartList } from "../features/cart/CartList.js";
import { CartSummary } from "../features/cart/CartSummary.js";
import { Button } from "../shared/components/index.js";
import { usePosAppState } from "../router/pos-app-state.js";

interface CartPageProps {
  context: WebBootstrapContext;
}

export function CartPage({ context: _context }: CartPageProps): JSX.Element {
  const { cart, cartLines, cartTotals, upsertCartLine, clearCart } = usePosAppState();

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "16px"
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px"
  };

  const listStyles: React.CSSProperties = {
    flex: 1,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  };

  return (
    <div style={containerStyles}>
      <header style={headerStyles}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>Cart</h1>
        {cartLines.length > 0 && (
          <Button variant="secondary" size="small" onClick={clearCart}>
            Clear All
          </Button>
        )}
      </header>

      <div style={listStyles}>
        <CartList
          lines={cartLines}
          onUpdateLine={(itemId, patch) => {
            const line = cart[itemId];
            if (!line) {
              return;
            }

            upsertCartLine(line.product, {
              qty: patch.qty,
              discount_amount: patch.discount_amount
            });
          }}
        />
      </div>

      {cartLines.length > 0 ? (
        <footer style={{ paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
          <CartSummary totals={cartTotals} />
        </footer>
      ) : null}
    </div>
  );
}
