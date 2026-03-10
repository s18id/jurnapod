// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import type {
  RuntimeOutletScope,
  RuntimeSyncBadgeState,
  RuntimeProductCatalogItem,
  RuntimeOutletTable,
  RuntimeReservation
} from "../services/runtime-service.js";
import type {
  ActiveOrderContextState,
  CartLineState,
  CartState,
  OrderLifecycleStatus,
  OrderServiceType
} from "../features/cart/useCart.js";
import type { CartTotals } from "../shared/utils/money.js";

export interface PosAppStateValue {
  scope: RuntimeOutletScope;
  setScope: (scope: RuntimeOutletScope) => void;
  outletOptions: Array<{ outlet_id: number; label: string }>;
  syncBadgeState: RuntimeSyncBadgeState;
  pendingOutboxCount: number;
  autoRefreshEnabled: boolean;
  setAutoRefreshEnabled: Dispatch<SetStateAction<boolean>>;
  autoPullEnabled: boolean;
  setAutoPullEnabled: Dispatch<SetStateAction<boolean>>;
  autoPullIntervalMs: number;
  setAutoPullIntervalMs: Dispatch<SetStateAction<number>>;
  hasProductCache: boolean;
  lastDataVersion: number;
  pullSyncInFlight: boolean;
  pushSyncInFlight: boolean;
  pullSyncMessage: string | null;
  pushSyncMessage: string | null;
  runSyncPullNow: () => Promise<void>;
  runSyncPushNow: () => Promise<void>;
  cart: CartState;
  cartLines: CartLineState[];
  cartTotals: CartTotals;
  paidAmount: number;
  setPaidAmount: (amount: number) => void;
  upsertCartLine: (product: RuntimeProductCatalogItem, patch: Partial<Pick<CartLineState, "qty" | "discount_amount">>) => void;
  clearCart: () => void;
  resetCartStatePreserveOrderStatus: () => void;
  activeOrderContext: ActiveOrderContextState;
  setServiceType: (serviceType: OrderServiceType) => void;
  setDineInContext: (input: {
    tableId: number | null;
    reservationId?: number | null;
    guestCount?: number | null;
    notes?: string | null;
  }) => void;
  setActiveTableId: (tableId: number | null) => void;
  setOrderReservationId: (reservationId: number | null) => void;
  setGuestCount: (guestCount: number | null) => void;
  setOrderFinalized: (isFinalized: boolean) => void;
  setOrderStatus: (status: OrderLifecycleStatus) => void;
  setOrderNotes: (notes: string | null) => void;
  createOrderCheckpoint: () => void;
  discardDraftItems: () => void;
  hasUnsentDineInItems: boolean;
  currentActiveOrderId: string | null;
  outletTables: RuntimeOutletTable[];
  setOutletTables: Dispatch<SetStateAction<RuntimeOutletTable[]>>;
  outletReservations: RuntimeReservation[];
  setOutletReservations: Dispatch<SetStateAction<RuntimeReservation[]>>;
  activeReservationId: number | null;
  setActiveReservationId: Dispatch<SetStateAction<number | null>>;
  staleEditWarning: string | null;
  reloadLatestActiveOrder: () => Promise<void>;
}

export const PosAppStateContext = createContext<PosAppStateValue | null>(null);

export function usePosAppState(): PosAppStateValue {
  const context = useContext(PosAppStateContext);
  if (!context) {
    throw new Error("usePosAppState must be used within PosAppStateContext");
  }
  return context;
}
