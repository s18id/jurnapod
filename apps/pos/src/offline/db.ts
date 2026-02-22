import Dexie, { type Table } from "dexie";
import type {
  OutboxJobRow,
  PaymentRow,
  ProductCacheRow,
  SaleItemRow,
  SaleRow,
  SyncMetadataRow,
  SyncScopeConfigRow
} from "./types.js";

export const POS_DB_NAME = "jurnapod_pos_v1";

export class PosOfflineDb extends Dexie {
  products_cache!: Table<ProductCacheRow, string>;
  sales!: Table<SaleRow, string>;
  sale_items!: Table<SaleItemRow, string>;
  payments!: Table<PaymentRow, string>;
  outbox_jobs!: Table<OutboxJobRow, string>;
  sync_metadata!: Table<SyncMetadataRow, string>;
  sync_scope_config!: Table<SyncScopeConfigRow, string>;

  constructor(databaseName: string = POS_DB_NAME) {
    super(databaseName);

    this.version(1).stores({
      products_cache:
        "&pk,[company_id+outlet_id+item_id],[company_id+outlet_id+data_version],[company_id+outlet_id+is_active]",
      sales: "&sale_id,&client_tx_id,[company_id+outlet_id+status],[company_id+outlet_id+created_at],sync_status",
      sale_items: "&line_id,sale_id,[company_id+outlet_id+sale_id]",
      payments: "&payment_id,sale_id,[company_id+outlet_id+sale_id]",
      outbox_jobs: "&job_id,&dedupe_key,sale_id,[status+next_attempt_at]"
    });

    this.version(2).stores({
      products_cache:
        "&pk,[company_id+outlet_id+item_id],[company_id+outlet_id+data_version],[company_id+outlet_id+is_active]",
      sales: "&sale_id,&client_tx_id,[company_id+outlet_id+status],[company_id+outlet_id+created_at],sync_status",
      sale_items: "&line_id,sale_id,[company_id+outlet_id+sale_id]",
      payments: "&payment_id,sale_id,[company_id+outlet_id+sale_id]",
      outbox_jobs: "&job_id,&dedupe_key,sale_id,[status+next_attempt_at]",
      sync_metadata: "&pk,[company_id+outlet_id],last_data_version,updated_at"
    });

    this.version(3).stores({
      products_cache:
        "&pk,[company_id+outlet_id+item_id],[company_id+outlet_id+data_version],[company_id+outlet_id+is_active]",
      sales: "&sale_id,&client_tx_id,[company_id+outlet_id+status],[company_id+outlet_id+created_at],sync_status",
      sale_items: "&line_id,sale_id,[company_id+outlet_id+sale_id]",
      payments: "&payment_id,sale_id,[company_id+outlet_id+sale_id]",
      outbox_jobs: "&job_id,&dedupe_key,sale_id,[status+next_attempt_at]",
      sync_metadata: "&pk,[company_id+outlet_id],last_data_version,updated_at",
      sync_scope_config: "&pk,[company_id+outlet_id],data_version,updated_at"
    });
  }
}

export function createPosOfflineDb(databaseName: string): PosOfflineDb {
  return new PosOfflineDb(databaseName);
}

export const posDb = new PosOfflineDb();
