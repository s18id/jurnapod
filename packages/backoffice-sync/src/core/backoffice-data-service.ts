// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  BackofficeRealtimeData,
  BackofficeOperationalData,
  BackofficeMasterData,
  BackofficeAdminData,
  BackofficeAnalyticsData
} from "../types/backoffice-data.js";
import type { SyncContext } from "@jurnapod/sync-core";
import type { DbConn } from "@jurnapod/db";

export class BackofficeDataService {
  constructor(private db: DbConn) {}

  /**
   * Get realtime dashboard data for backoffice
   */
  async getRealtimeData(context: SyncContext): Promise<BackofficeRealtimeData> {
    const { company_id } = context;

    // Get live sales metrics for today
    const salesMetrics = await this.db.querySingle(`
      SELECT 
        COALESCE(SUM(
          CASE WHEN DATE(pt.trx_at) = CURDATE() THEN pti.item_total ELSE 0 END
        ), 0) AS total_sales_today,
        COUNT(CASE WHEN DATE(pt.trx_at) = CURDATE() AND pt.status = 'COMPLETED' THEN 1 END) AS transaction_count_today,
        COALESCE(SUM(
          CASE WHEN HOUR(pt.trx_at) = HOUR(NOW()) AND DATE(pt.trx_at) = CURDATE() THEN pti.item_total ELSE 0 END
        ), 0) AS revenue_this_hour
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(qty * price_snapshot) AS item_total
        FROM pos_transaction_items
        GROUP BY pos_transaction_id
      ) pti ON pti.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.trx_at >= CURDATE() - INTERVAL 1 DAY
    `, [company_id]);

    // Get active orders and table counts
    const activityMetrics = await this.db.querySingle(`
      SELECT 
        COUNT(DISTINCT pos.order_id) AS active_orders_count,
        COUNT(DISTINCT ot.id) AS occupied_tables_count
      FROM pos_order_snapshots pos
      LEFT JOIN outlet_tables ot ON ot.id = pos.table_id AND ot.status = 'OCCUPIED'
      WHERE pos.company_id = ?
        AND pos.order_state = 'OPEN'
        AND pos.is_finalized = false
    `, [company_id]);

    // Calculate average transaction value
    const avgTransactionValue = salesMetrics.transaction_count_today > 0 
      ? salesMetrics.total_sales_today / salesMetrics.transaction_count_today 
      : 0;

    // Get system alerts (last 24 hours)
    const systemAlerts = await this.db.queryAll(`
      SELECT 
        UUID() AS id,
        'ERROR' AS type,
        'SYNC' AS module,
        CONCAT('Sync failure: ', action) AS message,
        created_at,
        false AS acknowledged
      FROM audit_logs
      WHERE company_id = ?
        AND success = 0
        AND created_at >= NOW() - INTERVAL 24 HOUR
      ORDER BY created_at DESC
      LIMIT 10
    `, [company_id]);

    // Get staff activity
    const staffActivity = await this.db.queryAll(`
      SELECT DISTINCT
        u.id AS user_id,
        u.name AS user_name,
        ura.outlet_id,
        al.action AS last_action,
        al.created_at AS last_seen,
        CASE 
          WHEN al.created_at >= NOW() - INTERVAL 15 MINUTE THEN 'ACTIVE'
          WHEN al.created_at >= NOW() - INTERVAL 1 HOUR THEN 'IDLE'
          ELSE 'OFFLINE'
        END AS status
      FROM users u
      JOIN user_role_assignments ura ON ura.user_id = u.id
      LEFT JOIN audit_logs al ON al.user_id = u.id
      WHERE u.company_id = ?
        AND u.is_active = 1
      GROUP BY u.id, ura.outlet_id
      HAVING MAX(al.created_at) IS NOT NULL
      ORDER BY last_seen DESC
      LIMIT 20
    `, [company_id]);

    return {
      live_sales_metrics: {
        total_sales_today: Number(salesMetrics.total_sales_today),
        transaction_count_today: Number(salesMetrics.transaction_count_today),
        active_orders_count: Number(activityMetrics.active_orders_count),
        occupied_tables_count: Number(activityMetrics.occupied_tables_count),
        revenue_this_hour: Number(salesMetrics.revenue_this_hour),
        avg_transaction_value: Number(avgTransactionValue),
        last_updated: new Date().toISOString()
      },
      system_alerts: systemAlerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        module: alert.module,
        message: alert.message,
        created_at: alert.created_at,
        acknowledged: Boolean(alert.acknowledged)
      })),
      staff_activity: staffActivity.map(staff => ({
        user_id: staff.user_id,
        user_name: staff.user_name,
        outlet_id: staff.outlet_id,
        last_action: staff.last_action,
        last_seen: staff.last_seen,
        status: staff.status
      }))
    };
  }

  /**
   * Get operational data for backoffice
   */
  async getOperationalData(context: SyncContext, sinceVersion?: number): Promise<BackofficeOperationalData> {
    const { company_id } = context;

    // Get recent transactions (last 24 hours)
    const recentTransactions = await this.db.queryAll(`
      SELECT 
        pt.client_tx_id AS transaction_id,
        pt.outlet_id,
        pt.cashier_user_id,
        u.name AS cashier_name,
        (
          SELECT SUM(qty * price_snapshot) 
          FROM pos_transaction_items pti 
          WHERE pti.pos_transaction_id = pt.id
        ) AS total_amount,
        (
          SELECT GROUP_CONCAT(DISTINCT method)
          FROM pos_transaction_payments ptp
          WHERE ptp.pos_transaction_id = pt.id
        ) AS payment_methods,
        pt.trx_at AS transaction_at,
        pt.status,
        pt.table_id,
        pt.guest_count
      FROM pos_transactions pt
      JOIN users u ON u.id = pt.cashier_user_id
      WHERE pt.company_id = ?
        AND pt.trx_at >= NOW() - INTERVAL 24 HOUR
        ${sinceVersion ? 'AND pt.updated_at >= (SELECT last_updated_at FROM sync_tier_versions WHERE company_id = ? AND tier = "OPERATIONAL")' : ''}
      ORDER BY pt.trx_at DESC
      LIMIT 100
    `, sinceVersion ? [company_id, company_id] : [company_id]);

    // Get payment reconciliation status
    const paymentReconciliation = await this.db.queryAll(`
      SELECT 
        o.id AS outlet_id,
        pm.method AS payment_method,
        COALESCE(SUM(ptp.amount), 0) AS expected_amount,
        NULL AS actual_amount,
        0 AS variance,
        NULL AS reconciled_at,
        'PENDING' AS status
      FROM outlets o
      CROSS JOIN (
        SELECT DISTINCT method FROM pos_transaction_payments 
        WHERE pos_transaction_id IN (
          SELECT id FROM pos_transactions 
          WHERE company_id = ? AND DATE(trx_at) = CURDATE()
        )
      ) pm
      LEFT JOIN pos_transactions pt ON pt.outlet_id = o.id AND DATE(pt.trx_at) = CURDATE()
      LEFT JOIN pos_transaction_payments ptp ON ptp.pos_transaction_id = pt.id AND ptp.method = pm.method
      WHERE o.company_id = ?
        AND o.is_active = 1
      GROUP BY o.id, pm.method
      HAVING expected_amount > 0
      ORDER BY o.name, pm.method
    `, [company_id, company_id]);

    return {
      recent_transactions: recentTransactions.map(tx => ({
        transaction_id: tx.transaction_id,
        outlet_id: tx.outlet_id,
        cashier_user_id: tx.cashier_user_id,
        cashier_name: tx.cashier_name,
        total_amount: Number(tx.total_amount),
        payment_methods: tx.payment_methods ? tx.payment_methods.split(',') : [],
        transaction_at: tx.transaction_at,
        status: tx.status,
        table_id: tx.table_id,
        guest_count: tx.guest_count
      })),
      payment_reconciliation: paymentReconciliation.map(recon => ({
        outlet_id: recon.outlet_id,
        payment_method: recon.payment_method,
        expected_amount: Number(recon.expected_amount),
        actual_amount: recon.actual_amount ? Number(recon.actual_amount) : null,
        variance: Number(recon.variance),
        reconciled_at: recon.reconciled_at,
        status: recon.status
      }))
    };
  }

  /**
   * Get comprehensive master data for backoffice
   */
  async getMasterData(context: SyncContext, sinceVersion?: number): Promise<BackofficeMasterData> {
    const { company_id } = context;

    // Get current data version
    const versionResult = await this.db.querySingle(`
      SELECT current_version FROM sync_tier_versions 
      WHERE company_id = ? AND tier = 'MASTER'
    `, [company_id]);
    const dataVersion = versionResult?.current_version || 0;

    // Build WHERE clause for incremental sync
    const versionFilter = sinceVersion && sinceVersion < dataVersion
      ? 'AND updated_at >= (SELECT last_updated_at FROM sync_tier_versions WHERE company_id = ? AND tier = "MASTER")'
      : '';
    const versionParams = sinceVersion && sinceVersion < dataVersion ? [company_id] : [];

    // Get comprehensive item data
    // TODO: When suppliers table is created, add LEFT JOIN to get supplier_name
    const items = await this.db.queryAll(`
      SELECT 
        i.id,
        i.sku,
        i.name,
        NULL AS description,
        i.item_type AS type,
        i.item_group_id,
        NULL AS cost_price,
        COALESCE(
          (SELECT price FROM item_prices ip WHERE ip.item_id = i.id AND ip.outlet_id IS NULL LIMIT 1),
          0
        ) AS selling_price,
        NULL AS supplier_id,
        NULL AS supplier_name,
        i.barcode,
        '[]' AS images, -- TODO: Implement image storage
        i.is_active,
        NULL AS stock_quantity, -- TODO: Implement inventory
        NULL AS minimum_stock,
        NULL AS accounting_code, -- TODO: Implement accounting codes
        i.created_at,
        i.updated_at,
        'system' AS created_by, -- TODO: Get actual user
        'system' AS modified_by
      FROM items i
      WHERE i.company_id = ?
        ${versionFilter}
      ORDER BY i.name
    `, [company_id, ...versionParams]);

    // Get customers (if customer management is implemented)
    const customers = await this.db.queryAll(`
      SELECT 
        1 AS id,
        'Walk-in Customer' AS name,
        NULL AS email,
        NULL AS phone,
        NULL AS address,
        0 AS loyalty_points,
        0 AS total_spent,
        0 AS visit_count,
        NULL AS last_visit,
        NOW() AS created_at,
        1 AS is_active
      WHERE 1 = 0 -- Placeholder - customers not yet implemented
    `);

    // Get suppliers - placeholder until suppliers table is created
    // TODO: Create suppliers table with columns: id, company_id, name, contact_name, email, phone, address, payment_terms, is_active, created_at
    const suppliers: any[] = [];

    // Get chart of accounts
    // TODO: Balance should come from account_balances_current table
    const chartOfAccounts = await this.db.queryAll(`
      SELECT 
        a.id,
        a.code,
        a.name,
        at.name AS account_type,
        a.parent_account_id,
        a.is_active,
        NULL AS balance
      FROM accounts a
      JOIN account_types at ON at.id = a.account_type_id
      WHERE a.company_id = ?
        AND a.is_active = 1
        ${versionFilter}
      ORDER BY a.code
    `, [company_id, ...versionParams]);

    return {
      data_version: dataVersion,
      items: items.map(item => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        description: item.description || '',
        type: item.type,
        item_group_id: item.item_group_id,
        cost_price: Number(item.cost_price),
        selling_price: Number(item.selling_price),
        supplier_id: item.supplier_id,
        supplier_name: item.supplier_name,
        barcode: item.barcode,
        images: JSON.parse(item.images),
        is_active: Boolean(item.is_active),
        stock_quantity: item.stock_quantity ? Number(item.stock_quantity) : null,
        minimum_stock: item.minimum_stock ? Number(item.minimum_stock) : null,
        accounting_code: item.accounting_code,
        created_at: item.created_at,
        updated_at: item.updated_at,
        created_by: item.created_by,
        modified_by: item.modified_by
      })),
      customers: customers.map(customer => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        loyalty_points: Number(customer.loyalty_points),
        total_spent: Number(customer.total_spent),
        visit_count: Number(customer.visit_count),
        last_visit: customer.last_visit,
        created_at: customer.created_at,
        is_active: Boolean(customer.is_active)
      })),
      suppliers: suppliers.map(supplier => ({
        id: supplier.id,
        name: supplier.name,
        // TODO: suppliers table needs contact_name, email, phone, address, payment_terms columns
        contact_name: null,
        email: null,
        phone: null,
        address: null,
        payment_terms: null,
        is_active: Boolean(supplier.is_active),
        created_at: supplier.created_at
      })),
      chart_of_accounts: chartOfAccounts.map(account => ({
        id: account.id,
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        parent_id: account.parent_account_id,
        is_active: Boolean(account.is_active),
        balance: Number(account.balance)
      }))
    };
  }

  /**
   * Get administrative data for backoffice
   */
  async getAdminData(context: SyncContext): Promise<BackofficeAdminData> {
    const { company_id } = context;

    // Get company settings
    const companySettings = await this.db.querySingle(`
      SELECT 
        c.id AS company_id,
        c.name,
        c.email,
        c.phone,
        COALESCE(c.address_line1, '') AS address,
        c.tax_id,
        c.currency_code,
        c.timezone,
        COALESCE(fy.start_date, CONCAT(YEAR(NOW()), '-01-01')) AS fiscal_year_start,
        'ACCRUAL' AS accounting_method, -- TODO: Make configurable
        1 AS multi_outlet_enabled, -- TODO: Make configurable
        c.created_at
      FROM companies c
      LEFT JOIN fiscal_years fy ON fy.company_id = c.id AND fy.status = 'OPEN'
      WHERE c.id = ?
    `, [company_id]);

    // Get outlets
    const outlets = await this.db.queryAll(`
      SELECT 
        o.id,
        o.name,
        o.code,
        COALESCE(o.address_line1, '') AS address,
        o.phone,
        NULL AS manager_user_id,
        NULL AS manager_name,
        o.is_active,
        o.created_at,
        (SELECT COUNT(*) FROM outlet_tables WHERE outlet_id = o.id AND is_active = 1) AS table_count,
        (SELECT COUNT(DISTINCT user_id) FROM user_role_assignments WHERE outlet_id = o.id) AS staff_count
      FROM outlets o
      WHERE o.company_id = ?
        AND o.deleted_at IS NULL
      ORDER BY o.name
    `, [company_id]);

    // Get users with roles
    const users = await this.db.queryAll(`
      SELECT 
        u.id,
        u.name,
        u.email,
        NULL AS phone,
        u.is_active,
        u.email_verified_at,
        u.created_at,
        NULL AS last_login_at,
        GROUP_CONCAT(DISTINCT
          CONCAT(COALESCE(ura.outlet_id, 'NULL'), ':', mr.module, ':', mr.permission_mask)
          SEPARATOR '|'
        ) AS roles_data
      FROM users u
      LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
      LEFT JOIN module_roles mr ON mr.role_id = ura.role_id AND mr.company_id = u.company_id
      WHERE u.company_id = ?
        AND u.is_active = 1
      GROUP BY u.id
      ORDER BY u.name
    `, [company_id]);

    // Get tax settings
    const taxSettings = await this.db.queryAll(`
      SELECT 
        tr.id,
        tr.code,
        tr.name,
        tr.rate_percent,
        tr.is_inclusive,
        CASE WHEN ctd.tax_rate_id IS NOT NULL THEN 1 ELSE 0 END AS is_default,
        tr.account_id,
        tr.is_active
      FROM tax_rates tr
      LEFT JOIN company_tax_defaults ctd ON ctd.tax_rate_id = tr.id AND ctd.company_id = tr.company_id
      WHERE tr.company_id = ?
        AND tr.is_active = 1
      ORDER BY tr.code
    `, [company_id]);

    // Get feature flags
    const featureFlags = await this.db.queryAll(`
      SELECT \`key\`, enabled
      FROM feature_flags
      WHERE company_id = ?
    `, [company_id]);

    // Process users roles data
    const processedUsers = users.map(user => {
      const roles = [];
      if (user.roles_data) {
        const roleEntries = user.roles_data.split('|');
        for (const entry of roleEntries) {
          const [outletIdStr, role, permissions] = entry.split(':');
          const outletId = outletIdStr === 'NULL' ? null : parseInt(outletIdStr, 10);
          roles.push({
            outlet_id: outletId,
            role: role as any,
            permissions: permissions ? permissions.split(',') : []
          });
        }
      }
      
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        is_active: Boolean(user.is_active),
        email_verified_at: user.email_verified_at,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
        roles
      };
    });

    return {
      company_settings: {
        company_id: companySettings.company_id,
        name: companySettings.name,
        email: companySettings.email,
        phone: companySettings.phone,
        address: companySettings.address,
        tax_number: companySettings.tax_id,
        currency_code: companySettings.currency_code,
        timezone: companySettings.timezone,
        fiscal_year_start: companySettings.fiscal_year_start,
        accounting_method: companySettings.accounting_method,
        multi_outlet_enabled: Boolean(companySettings.multi_outlet_enabled),
        created_at: companySettings.created_at
      },
      outlets: outlets.map(outlet => ({
        id: outlet.id,
        name: outlet.name,
        code: outlet.code,
        address: outlet.address,
        phone: outlet.phone,
        manager_user_id: outlet.manager_user_id,
        manager_name: outlet.manager_name,
        is_active: Boolean(outlet.is_active),
        created_at: outlet.created_at,
        table_count: Number(outlet.table_count),
        staff_count: Number(outlet.staff_count)
      })),
      users: processedUsers,
      tax_settings: taxSettings.map(tax => ({
        id: tax.id,
        code: tax.code,
        name: tax.name,
        rate_percent: Number(tax.rate_percent),
        is_inclusive: Boolean(tax.is_inclusive),
        is_default: Boolean(tax.is_default),
        account_id: tax.account_id,
        is_active: Boolean(tax.is_active)
      })),
      feature_flags: featureFlags.reduce((acc, flag) => {
        acc[flag.key] = Boolean(flag.enabled);
        return acc;
      }, {} as Record<string, boolean>),
      system_config: {} // TODO: Implement system config
    };
  }

  /**
   * Get analytics data for backoffice
   */
  async getAnalyticsData(context: SyncContext): Promise<BackofficeAnalyticsData> {
    const { company_id } = context;

    // Get daily sales analytics (last 30 days)
    const dailySales = await this.db.queryAll(`
      SELECT 
        DATE(pt.trx_at) as date,
        pt.outlet_id,
        COALESCE(pti.total, 0) AS total_sales,
        COUNT(*) AS transaction_count,
        CASE WHEN COUNT(*) > 0 THEN COALESCE(pti.total, 0) / COUNT(*) ELSE 0 END AS avg_ticket_size
      FROM pos_transactions pt
      LEFT JOIN (
        SELECT pos_transaction_id, SUM(qty * price_snapshot) AS total
        FROM pos_transaction_items
        GROUP BY pos_transaction_id
      ) pti ON pti.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.status = 'COMPLETED'
        AND pt.trx_at >= CURDATE() - INTERVAL 30 DAY
      GROUP BY DATE(pt.trx_at), pt.outlet_id, pti.total
      ORDER BY date DESC, pt.outlet_id
    `, [company_id]);

    // Get top selling items for each day
    const topSellingItems = await this.db.queryAll(`
      SELECT 
        DATE(pt.trx_at) as date,
        pt.outlet_id,
        pti.item_id,
        pti.name_snapshot as item_name,
        SUM(pti.qty) as quantity_sold,
        SUM(pti.qty * pti.price_snapshot) as revenue
      FROM pos_transactions pt
      JOIN pos_transaction_items pti ON pti.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.status = 'COMPLETED'
        AND pt.trx_at >= CURDATE() - INTERVAL 30 DAY
      GROUP BY DATE(pt.trx_at), pt.outlet_id, pti.item_id
      ORDER BY date DESC, revenue DESC
    `, [company_id]);

    // Aggregate top selling items by date
    const dailySalesMap = new Map();
    dailySales.forEach(day => {
      const key = `${day.date}-${day.outlet_id}`;
      dailySalesMap.set(key, {
        date: day.date,
        outlet_id: day.outlet_id,
        total_sales: Number(day.total_sales) || 0,
        transaction_count: Number(day.transaction_count),
        avg_ticket_size: Number(day.avg_ticket_size) || 0,
        top_selling_items: []
      });
    });

    // Add top selling items to daily sales
    topSellingItems.forEach(item => {
      const key = `${item.date}-${item.outlet_id}`;
      const dayData = dailySalesMap.get(key);
      if (dayData && dayData.top_selling_items.length < 5) {
        dayData.top_selling_items.push({
          item_id: item.item_id,
          item_name: item.item_name,
          quantity_sold: Number(item.quantity_sold),
          revenue: Number(item.revenue)
        });
      }
    });

    // Get monthly trends (last 12 months)
    const monthlyTrends = await this.db.queryAll(`
      SELECT 
        DATE_FORMAT(pt.trx_at, '%Y-%m') as month,
        COALESCE(SUM(pti.qty * pti.price_snapshot), 0) AS revenue,
        COUNT(DISTINCT pt.id) AS customer_count
      FROM pos_transactions pt
      LEFT JOIN pos_transaction_items pti ON pti.pos_transaction_id = pt.id
      WHERE pt.company_id = ?
        AND pt.status = 'COMPLETED'
        AND pt.trx_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(pt.trx_at, '%Y-%m')
      ORDER BY month DESC
    `, [company_id]);

    // Calculate growth rates
    const processedMonthlyTrends = monthlyTrends.map((current, index) => {
      const previous = monthlyTrends[index + 1];
      const growthRate = previous && previous.revenue > 0 
        ? ((current.revenue - previous.revenue) / previous.revenue) * 100
        : 0;

      return {
        month: current.month,
        revenue: Number(current.revenue) || 0,
        growth_rate: Number(growthRate),
        customer_count: Number(current.customer_count),
        avg_customer_value: current.customer_count > 0 
          ? Number(current.revenue) / Number(current.customer_count)
          : 0
      };
    });

    // Get audit logs (last 1000 entries)
    const auditLogs = await this.db.queryAll(`
      SELECT 
        id,
        company_id,
        outlet_id,
        user_id,
        action,
        entity_type,
        entity_id,
        result,
        success,
        ip_address,
        payload_json,
        created_at
      FROM audit_logs
      WHERE company_id = ?
      ORDER BY created_at DESC
      LIMIT 1000
    `, [company_id]);

    return {
      financial_reports: [], // TODO: Implement financial reports
      sales_analytics: {
        daily_sales: Array.from(dailySalesMap.values()),
        monthly_trends: processedMonthlyTrends
      },
      audit_logs: auditLogs.map(log => ({
        id: log.id,
        company_id: log.company_id,
        outlet_id: log.outlet_id,
        user_id: log.user_id,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        success: Boolean(log.success),
        ip_address: log.ip_address,
        user_agent: null, // Not available in audit_logs table
        created_at: log.created_at,
        metadata: log.payload_json ? JSON.parse(log.payload_json) : null
      })),
      reconciliation_data: [] // TODO: Implement reconciliation data
    };
  }
}