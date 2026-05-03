// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { sql } from "kysely";
import type { 
  PosRealtimeData, 
  PosOperationalData, 
  PosMasterData, 
  PosAdminData 
} from "../types/pos-data.js";
import type { SyncContext } from "@jurnapod/sync-core";
import type { KyselySchema } from "@jurnapod/db";
import { toUtcIso } from "@jurnapod/shared";

// Row type interfaces for query results
interface ActiveOrderRow {
  order_id: string;
  table_id: number | null;
  order_status: string;
  paid_amount: number | string;
  total_amount: number | string;
  guest_count: number | null;
  updated_at: string;
}

interface TableStatusRow {
  table_id: number;
  status: string;
  current_order_id: string | null;
  updated_at: string;
}

interface OutletTableRow {
  table_id: number;
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: string;
  updated_at: string;
}

interface ReservationRow {
  reservation_id: number;
  table_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  guest_count: number;
  reservation_at: string;
  reservation_start_ts: number | null;
  duration_minutes: number | null;
  status: string;
  notes: string | null;
  linked_order_id: number | null;
  arrived_at: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

interface ItemRow {
  id: number;
  sku: string | null;
  name: string;
  type: string;
  item_group_id: number | null;
  is_active: number;
  updated_at: string;
}

interface ItemGroupRow {
  id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: number;
  updated_at: string;
}

interface PriceRow {
  id: number;
  item_id: number;
  outlet_id: number | null;
  price: number | string;
  is_active: number;
  updated_at: string;
}

interface TaxRateRow {
  id: number;
  code: string;
  name: string;
  rate_percent: number | string;
  is_inclusive: number;
  is_active: number;
}

interface DefaultTaxRateRow {
  tax_rate_id: number;
}

interface PaymentMethodRow {
  code: string;
  label: string;
  is_active: number;
  account_id: number | null;
}

interface OutletConfigRow {
  outlet_id: number;
  company_id: number;
  name: string;
  timezone: string;
  currency_code: string;
  default_tax_rate: number | string;
  tax_is_inclusive: number;
}

interface UserPermissionRow {
  user_id: number;
  outlet_id: number;
  permissions: string | null;
  role: string;
}

interface FeatureFlagRow {
  key: string;
  enabled: number;
}

export class PosDataService {
  constructor(private db: KyselySchema) {}

  /**
   * Get realtime data for POS (active orders, table status)
   */
  async getRealtimeData(context: SyncContext): Promise<PosRealtimeData> {
    const { company_id, outlet_id } = context;

    // Get active orders
    const activeOrdersResult = await sql`
      SELECT 
        order_id,
        table_id,
        order_status,
        paid_amount,
        COALESCE((
          SELECT SUM(unit_price_snapshot * qty - discount_amount)
          FROM pos_order_snapshot_lines pol
          WHERE pol.order_id = pos.order_id
        ), 0) AS total_amount,
        guest_count,
        updated_at
      FROM pos_order_snapshots pos
      WHERE company_id = ${company_id} 
        AND outlet_id = ${outlet_id}
        AND order_state = 'OPEN'
        AND is_finalized = false
      ORDER BY opened_at DESC
      LIMIT 50
    `.execute(this.db);

    // Get recent table status updates
    const tableStatusResult = await sql`
      SELECT DISTINCT
        ot.id AS table_id,
        ot.status,
        pos.order_id AS current_order_id,
        ot.updated_at
      FROM outlet_tables ot
      LEFT JOIN pos_order_snapshots pos ON pos.table_id = ot.id 
        AND pos.order_state = 'OPEN' 
        AND pos.is_finalized = false
      WHERE ot.company_id = ${company_id} 
        AND ot.outlet_id = ${outlet_id}
        AND ot.is_active = 1
        AND ot.updated_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY ot.updated_at DESC
    `.execute(this.db);

    return {
      active_orders: (activeOrdersResult.rows as ActiveOrderRow[]).map(order => ({
        order_id: order.order_id,
        table_id: order.table_id,
        order_status: order.order_status as "OPEN" | "READY_TO_PAY" | "COMPLETED" | "CANCELLED",
        paid_amount: Number(order.paid_amount),
        total_amount: Number(order.total_amount),
        guest_count: order.guest_count,
        updated_at: order.updated_at
      })),
      table_status_updates: (tableStatusResult.rows as TableStatusRow[]).map(table => ({
        table_id: table.table_id,
        status: table.status as "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE",
        current_order_id: table.current_order_id,
        updated_at: table.updated_at
      }))
    };
  }

  /**
   * Get operational data for POS (tables, reservations, availability)
   */
  async getOperationalData(context: SyncContext, sinceVersion?: number): Promise<PosOperationalData> {
    const { company_id, outlet_id } = context;

    // Get all tables for the outlet
    const tablesResult = await sql`
      SELECT 
        id AS table_id,
        code,
        name,
        zone,
        capacity,
        status,
        updated_at
      FROM outlet_tables
      WHERE company_id = ${company_id} 
        AND outlet_id = ${outlet_id}
        AND is_active = 1
      ORDER BY zone, name
    `.execute(this.db);

    // Get active reservations for today and tomorrow
    const reservationsResult = await sql`
      SELECT 
        id AS reservation_id,
        table_id,
        customer_name,
        customer_phone,
        guest_count,
        reservation_at,
        reservation_start_ts,
        duration_minutes,
        status,
        notes,
        linked_order_id,
        updated_at
      FROM reservations
      WHERE company_id = ${company_id} 
        AND outlet_id = ${outlet_id}
        AND status IN ('BOOKED', 'CONFIRMED', 'ARRIVED', 'SEATED')
        AND (
          (
            reservation_start_ts IS NOT NULL
            AND reservation_start_ts >= (UNIX_TIMESTAMP(CURDATE()) * 1000)
            AND reservation_start_ts < (UNIX_TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 2 DAY)) * 1000)
          )
          OR (
            reservation_start_ts IS NULL
            AND reservation_at >= CURDATE()
            AND reservation_at < DATE_ADD(CURDATE(), INTERVAL 2 DAY)
          )
        )
      ORDER BY reservation_start_ts IS NULL ASC, reservation_start_ts ASC, reservation_at ASC
    `.execute(this.db);

    return {
      tables: (tablesResult.rows as OutletTableRow[]).map(table => ({
        table_id: table.table_id,
        code: table.code,
        name: table.name,
        zone: table.zone,
        capacity: table.capacity,
        status: table.status as "AVAILABLE" | "RESERVED" | "OCCUPIED" | "UNAVAILABLE",
        updated_at: table.updated_at
      })),
      reservations: (reservationsResult.rows as ReservationRow[]).map(reservation => ({
        reservation_id: reservation.reservation_id,
        table_id: reservation.table_id,
        customer_name: reservation.customer_name ?? "",
        customer_phone: reservation.customer_phone,
        guest_count: reservation.guest_count,
        reservation_at:
          reservation.reservation_start_ts != null
            ? toUtcIso.epochMs(Number(reservation.reservation_start_ts))
            : reservation.reservation_at,
        duration_minutes: reservation.duration_minutes,
        status: reservation.status as "BOOKED" | "CONFIRMED" | "ARRIVED" | "SEATED",
        notes: reservation.notes,
        linked_order_id: reservation.linked_order_id ? String(reservation.linked_order_id) : null,
        updated_at: reservation.updated_at
      }))
    };
  }

  /**
   * Get master data for POS (items, prices, tax rates)
   */
  async getMasterData(context: SyncContext, sinceVersion?: number): Promise<PosMasterData> {
    const { company_id, outlet_id } = context;

    // Get items
    const itemsResult = await sql`
      SELECT 
        id,
        sku,
        name,
        type,
        item_group_id,
        is_active,
        updated_at
      FROM items
      WHERE company_id = ${company_id}
        AND is_active = 1
      ORDER BY name
    `.execute(this.db);

    // Get item groups
    const itemGroupsResult = await sql`
      SELECT 
        id,
        parent_id,
        code,
        name,
        is_active,
        updated_at
      FROM item_groups
      WHERE company_id = ${company_id}
        AND is_active = 1
      ORDER BY name
    `.execute(this.db);

    // Get outlet-specific prices with company defaults
    const pricesResult = await sql`
      SELECT DISTINCT
        COALESCE(op.id, dp.id) AS id,
        i.id AS item_id,
        COALESCE(op.outlet_id, ${outlet_id}) AS outlet_id,
        COALESCE(op.price, dp.price) AS price,
        COALESCE(op.is_active, dp.is_active) AS is_active,
        GREATEST(COALESCE(op.updated_at, '1970-01-01'), COALESCE(dp.updated_at, '1970-01-01')) AS updated_at
      FROM items i
      LEFT JOIN item_prices op ON op.item_id = i.id AND op.outlet_id = ${outlet_id}
      LEFT JOIN item_prices dp ON dp.item_id = i.id AND dp.outlet_id IS NULL AND dp.company_id = ${company_id}
      WHERE i.company_id = ${company_id}
        AND i.is_active = 1
        AND (op.is_active = 1 OR (op.id IS NULL AND dp.is_active = 1))
      ORDER BY i.name
    `.execute(this.db);

    // Get tax rates
    const taxRatesResult = await sql`
      SELECT 
        id,
        code,
        name,
        rate_percent,
        is_inclusive,
        is_active
      FROM tax_rates
      WHERE company_id = ${company_id}
        AND is_active = 1
      ORDER BY code
    `.execute(this.db);

    // Get default tax rate IDs
    const defaultTaxRatesResult = await sql`
      SELECT tax_rate_id
      FROM company_tax_defaults
      WHERE company_id = ${company_id}
    `.execute(this.db);

    // Get payment methods - query unified payment_method_mappings table
    // outlet-specific first, then company-wide fallback
    const paymentMethodsResult = await sql`
      SELECT 
        method_code AS code,
        COALESCE(label, method_code) AS label,
        1 AS is_active,
        account_id
      FROM payment_method_mappings
      WHERE company_id = ${company_id}
        AND (outlet_id = ${outlet_id} OR outlet_id IS NULL)
      ORDER BY (outlet_id IS NOT NULL) DESC, outlet_id DESC, method_code
    `.execute(this.db);

    return {
      data_version: 0, // Version tracking moved to sync-core
      items: (itemsResult.rows as ItemRow[]).map(item => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        type: item.type as "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE",
        item_group_id: item.item_group_id,
        is_active: Boolean(item.is_active),
        updated_at: item.updated_at
      })),
      item_groups: (itemGroupsResult.rows as ItemGroupRow[]).map(group => ({
        id: group.id,
        parent_id: group.parent_id,
        code: group.code,
        name: group.name,
        is_active: Boolean(group.is_active),
        updated_at: group.updated_at
      })),
      prices: (pricesResult.rows as PriceRow[]).map(price => ({
        id: price.id,
        item_id: price.item_id,
        outlet_id: price.outlet_id ?? 0,
        price: Number(price.price),
        is_active: Boolean(price.is_active),
        updated_at: price.updated_at
      })),
      tax_rates: (taxRatesResult.rows as TaxRateRow[]).map(rate => ({
        id: rate.id,
        code: rate.code,
        name: rate.name,
        rate_percent: Number(rate.rate_percent),
        is_inclusive: Boolean(rate.is_inclusive),
        is_active: Boolean(rate.is_active)
      })),
      default_tax_rate_ids: (defaultTaxRatesResult.rows as DefaultTaxRateRow[]).map(dt => dt.tax_rate_id),
      payment_methods: (paymentMethodsResult.rows as PaymentMethodRow[]).map(method => ({
        code: method.code,
        label: method.label,
        is_active: Boolean(method.is_active),
        account_id: method.account_id
      }))
    };
  }

  /**
   * Get admin data for POS (outlet config, user permissions)
   */
  async getAdminData(context: SyncContext): Promise<PosAdminData> {
    const { company_id, outlet_id } = context;

    // Get outlet configuration
    const outletConfigResult = await sql`
      SELECT 
        o.id AS outlet_id,
        o.company_id,
        o.name,
        o.timezone,
        c.currency_code,
        COALESCE(
          (SELECT rate_percent FROM tax_rates tr 
           JOIN company_tax_defaults ctd ON ctd.tax_rate_id = tr.id
           WHERE tr.company_id = o.company_id AND tr.is_active = 1 LIMIT 1),
           0
        ) AS default_tax_rate,
        COALESCE(
          (SELECT is_inclusive FROM tax_rates tr 
           JOIN company_tax_defaults ctd ON ctd.tax_rate_id = tr.id
           WHERE tr.company_id = o.company_id AND tr.is_active = 1 LIMIT 1),
           0
        ) AS tax_is_inclusive
      FROM outlets o
      JOIN companies c ON c.id = o.company_id
      WHERE o.id = ${outlet_id} AND o.company_id = ${company_id}
    `.execute(this.db);

    const outletConfig = (outletConfigResult.rows as OutletConfigRow[])[0];

    if (!outletConfig) {
      throw new Error(`Outlet ${outlet_id} not found or access denied`);
    }

    // Get user permissions for this outlet
    const userPermissionsResult = await sql`
      SELECT DISTINCT
        u.id AS user_id,
        uor.outlet_id,
        GROUP_CONCAT(DISTINCT mr.permission_mask) AS permissions,
        mr.scope_level AS role
      FROM users u
      JOIN user_outlet_roles uor ON uor.user_id = u.id
      JOIN module_roles mr ON mr.id = uor.role_id
      WHERE uor.outlet_id = ${outlet_id}
        AND uor.company_id = ${company_id}
        AND u.is_active = 1
        AND mr.is_active = 1
      GROUP BY u.id, uor.outlet_id, mr.scope_level
    `.execute(this.db);

    // Get POS-specific feature flags
    const featureFlagsResult = await sql`
      SELECT 
        \`key\`,
        enabled
      FROM feature_flags
      WHERE company_id = ${company_id}
        AND \`key\` LIKE 'pos.%'
        AND enabled = 1
    `.execute(this.db);

    return {
      outlet_config: {
        outlet_id: outletConfig.outlet_id,
        company_id: outletConfig.company_id,
        name: outletConfig.name,
        timezone: outletConfig.timezone,
        currency_code: outletConfig.currency_code,
        tax_config: {
          default_rate: Number(outletConfig.default_tax_rate),
          is_inclusive: Boolean(outletConfig.tax_is_inclusive)
        }
      },
      user_permissions: (userPermissionsResult.rows as UserPermissionRow[]).map(perm => ({
        user_id: perm.user_id,
        outlet_id: perm.outlet_id,
        permissions: perm.permissions ? String(perm.permissions).split(',') : [],
        role: perm.role as "OWNER" | "ADMIN" | "ACCOUNTANT" | "CASHIER"
      })),
      feature_flags: (featureFlagsResult.rows as FeatureFlagRow[]).reduce((acc, flag) => {
        acc[flag.key] = Boolean(flag.enabled);
        return acc;
      }, {} as Record<string, boolean>)
    };
  }
}
