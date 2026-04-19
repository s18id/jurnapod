// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Goods Receipt Library
 *
 * Business logic for goods receipt (GR) management.
 * GR updates received_qty on PO lines and auto-transitions PO status.
 * GR does NOT create journal entries (off-balance-sheet暂记 until invoiced via PI).
 */

import { getDb } from "../db.js";
import type { KyselySchema } from "@jurnapod/db";
import { sql } from "kysely";
import {
  PURCHASE_ORDER_STATUS,
  type GoodsReceiptCreate,
} from "@jurnapod/shared";

export interface GoodsReceiptLineResult {
  id: number;
  line_no: number;
  po_line_id: number | null;
  item_id: number | null;
  description: string | null;
  qty: string;
  unit: string | null;
  over_receipt_allowed: number;
}

export interface GoodsReceiptResult {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier_name: string | null;
  reference_number: string;
  receipt_date: Date;
  status: number;
  notes: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
  po_reference: string | null;
  lines: GoodsReceiptLineResult[];
}

export interface ListGoodsReceiptsParams {
  companyId: number;
  supplierId?: number;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}

export interface ListGoodsReceiptsResult {
  receipts: Array<{
    id: number;
    company_id: number;
    supplier_id: number;
    supplier_name: string | null;
    reference_number: string;
    receipt_date: string;
    status: string;
    notes: string | null;
    created_by_user_id: number | null;
    updated_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    po_reference: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export async function listGoodsReceipts(
  params: ListGoodsReceiptsParams
): Promise<ListGoodsReceiptsResult> {
  const db = getDb() as KyselySchema;

  const countResult = await db
    .selectFrom("goods_receipts as gr")
    .where((eb) => {
      const preds = [eb("gr.company_id", "=", params.companyId)];
      if (params.supplierId) {
        preds.push(eb("gr.supplier_id", "=", params.supplierId));
      }
      if (params.dateFrom) {
        preds.push(eb("gr.receipt_date", ">=", new Date(params.dateFrom)));
      }
      if (params.dateTo) {
        preds.push(eb("gr.receipt_date", "<=", new Date(params.dateTo)));
      }
      return eb.and(preds);
    })
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();

  const total = Number((countResult as { count?: string })?.count ?? 0);

  const receipts = await db
    .selectFrom("goods_receipts as gr")
    .leftJoin("suppliers as s", (join) =>
      join
        .onRef("gr.supplier_id", "=", "s.id")
        .onRef("gr.company_id", "=", "s.company_id")
    )
    .leftJoin("goods_receipt_lines as grl", "gr.id", "grl.receipt_id")
    .leftJoin("purchase_order_lines as pol", "grl.po_line_id", "pol.id")
    .leftJoin("purchase_orders as po", "pol.order_id", "po.id")
    .where((eb) => {
      const preds = [eb("gr.company_id", "=", params.companyId)];
      if (params.supplierId) {
        preds.push(eb("gr.supplier_id", "=", params.supplierId));
      }
      if (params.dateFrom) {
        preds.push(eb("gr.receipt_date", ">=", new Date(params.dateFrom)));
      }
      if (params.dateTo) {
        preds.push(eb("gr.receipt_date", "<=", new Date(params.dateTo)));
      }
      return eb.and(preds);
    })
    .select([
      "gr.id",
      "gr.company_id",
      "gr.supplier_id",
      "gr.reference_number",
      "gr.receipt_date",
      "gr.status",
      "gr.notes",
      "gr.created_by_user_id",
      "gr.updated_by_user_id",
      "gr.created_at",
      "gr.updated_at",
      "s.name as supplier_name",
      sql<string>`MIN(po.order_no)`.as("po_reference")
    ])
    .groupBy(["gr.id", "s.name"])
    .orderBy("gr.created_at", "desc")
    .limit(params.limit)
    .offset(params.offset)
    .execute();

  const formatted = receipts.map((r) => ({
    id: r.id,
    company_id: r.company_id,
    supplier_id: r.supplier_id,
    supplier_name: (r as any).supplier_name,
    reference_number: r.reference_number,
    receipt_date: new Date(r.receipt_date).toISOString(),
    status: String(r.status),
    notes: r.notes,
    created_by_user_id: r.created_by_user_id,
    updated_by_user_id: r.updated_by_user_id,
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
    po_reference: (r as any).po_reference ?? null
  }));

  return { receipts: formatted, total, limit: params.limit, offset: params.offset };
}

export async function getGoodsReceiptById(
  companyId: number,
  receiptId: number
): Promise<GoodsReceiptResult | null> {
  const db = getDb() as KyselySchema;

  const receipt = await db
    .selectFrom("goods_receipts")
    .where("goods_receipts.id", "=", receiptId)
    .where("goods_receipts.company_id", "=", companyId)
    .leftJoin("suppliers as s", (join) =>
      join
        .onRef("goods_receipts.supplier_id", "=", "s.id")
        .onRef("goods_receipts.company_id", "=", "s.company_id")
    )
    .select([
      "goods_receipts.id",
      "goods_receipts.company_id",
      "goods_receipts.supplier_id",
      "goods_receipts.reference_number",
      "goods_receipts.receipt_date",
      "goods_receipts.status",
      "goods_receipts.notes",
      "goods_receipts.created_by_user_id",
      "goods_receipts.updated_by_user_id",
      "goods_receipts.created_at",
      "goods_receipts.updated_at",
      "s.name as supplier_name"
    ])
    .executeTakeFirst();

  if (!receipt) return null;

  const lines = await db
    .selectFrom("goods_receipt_lines")
    .where("receipt_id", "=", receiptId)
    .where("company_id", "=", companyId)
    .select(["id", "line_no", "po_line_id", "item_id", "description", "qty", "unit", "over_receipt_allowed"])
    .orderBy("line_no", "asc")
    .execute();

  let poReference: string | null = null;
  const poLineIds = lines.map((l) => l.po_line_id).filter((id) => id != null);
  if (poLineIds.length > 0) {
    const poLine = await db
      .selectFrom("purchase_order_lines as pol")
      .leftJoin("purchase_orders as po", "pol.order_id", "po.id")
      .where("pol.id", "=", poLineIds[0])
      .select(["po.order_no"])
      .executeTakeFirst();
    if (poLine) {
      poReference = (poLine as any).order_no;
    }
  }

  return {
    id: (receipt as any).id,
    company_id: (receipt as any).company_id,
    supplier_id: (receipt as any).supplier_id,
    supplier_name: (receipt as any).supplier_name,
    reference_number: (receipt as any).reference_number,
    receipt_date: new Date((receipt as any).receipt_date),
    status: Number((receipt as any).status),
    notes: (receipt as any).notes,
    created_by_user_id: (receipt as any).created_by_user_id,
    updated_by_user_id: (receipt as any).updated_by_user_id,
    created_at: new Date((receipt as any).created_at),
    updated_at: new Date((receipt as any).updated_at),
    po_reference: poReference,
    lines: lines.map((l) => ({
      id: l.id,
      line_no: l.line_no,
      po_line_id: l.po_line_id,
      item_id: l.item_id,
      description: l.description,
      qty: String(l.qty),
      unit: l.unit,
      over_receipt_allowed: l.over_receipt_allowed
    }))
  };
}

// BigInt scaled decimal helpers (scale 4)
function toScaled4(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const [integer, fraction = ""] = trimmed.split(".");
  const frac4 = (fraction + "0000").slice(0, 4);
  return (BigInt(integer) * 10000n) + BigInt(frac4);
}

function fromScaled4(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const intPart = abs / 10000n;
  const fracPart = (abs % 10000n).toString().padStart(4, "0");
  return `${sign}${intPart.toString()}.${fracPart}`;
}

export interface CreateGoodsReceiptResult {
  receipt: GoodsReceiptResult;
  warnings: string[];
}

export async function createGoodsReceipt(
  companyId: number,
  userId: number,
  input: GoodsReceiptCreate
): Promise<CreateGoodsReceiptResult> {
  const db = getDb() as KyselySchema;

  // Validate supplier ownership (tenant isolation)
  const supplier = await db
    .selectFrom("suppliers")
    .where("id", "=", input.supplier_id)
    .where("company_id", "=", companyId)
    .select(["id"])
    .executeTakeFirst();

  if (!supplier) {
    throw { code: "SUPPLIER_NOT_FOUND", message: "Supplier not found" };
  }

  const result = await db.transaction().execute(async (trx) => {
    const overReceiptWarnings: string[] = [];

    // First pass: validate PO lines and collect over-receipt warnings
    const poLineUpdatesByIndex: Record<number, {
      po_line_id: number;
      gr_qty: bigint;
      remaining: bigint;
      new_received_qty: bigint;
      over_receipt: boolean;
    }> = {};

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      if (line.po_line_id !== undefined && line.po_line_id !== null) {
        const poLine = await trx
          .selectFrom("purchase_order_lines as pol")
          .leftJoin("purchase_orders as po", "pol.order_id", "po.id")
          .where("pol.id", "=", line.po_line_id)
          .where("pol.company_id", "=", companyId)
          .select(["pol.id", "pol.item_id", "pol.qty", "pol.received_qty", "po.status as po_status", "po.supplier_id"])
          .executeTakeFirst();

        if (!poLine) {
          throw { code: "PO_LINE_NOT_FOUND", po_line_id: line.po_line_id };
        }

        const poStatus = Number((poLine as any).po_status);
        if (poStatus !== PURCHASE_ORDER_STATUS.SENT &&
            poStatus !== PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED) {
          throw {
            code: "INVALID_PO_STATUS",
            message: `PO must be in SENT or PARTIAL_RECEIVED status to receive goods`
          };
        }

        if (Number((poLine as any).supplier_id) !== input.supplier_id) {
          throw { code: "SUPPLIER_MISMATCH", message: "GR supplier does not match PO supplier" };
        }

        if (line.item_id !== undefined && line.item_id !== null) {
          const poLineItemId = (poLine as any).item_id;
          if (poLineItemId !== null && line.item_id !== Number(poLineItemId)) {
            throw { code: "ITEM_MISMATCH", message: "GR line item_id does not match PO line item_id" };
          }
        }

        const grQty = toScaled4(line.qty);
        const poQty = toScaled4(String((poLine as any).qty));
        const poReceivedQty = toScaled4(String((poLine as any).received_qty));
        const remaining = poQty - poReceivedQty;

        let newReceivedQty: bigint;
        let overReceipt = false;

        if (grQty > remaining) {
          overReceipt = true;
          newReceivedQty = poReceivedQty + grQty;
          overReceiptWarnings.push(
            `Line ${i + 1}: Received qty ${line.qty} exceeds remaining PO qty ${fromScaled4(remaining)}. Over-receipt allowed.`
          );
        } else {
          newReceivedQty = poReceivedQty + grQty;
        }

        poLineUpdatesByIndex[i] = {
          po_line_id: line.po_line_id,
          gr_qty: grQty,
          remaining,
          new_received_qty: newReceivedQty,
          over_receipt: overReceipt
        };
      }
    }

    // Insert GR header
    const headerResult = await trx
      .insertInto("goods_receipts")
      .values({
        company_id: companyId,
        supplier_id: input.supplier_id,
        reference_number: input.reference_number,
        receipt_date: input.receipt_date,
        status: PURCHASE_ORDER_STATUS.RECEIVED,
        notes: input.notes ?? null,
        created_by_user_id: userId
      })
      .executeTakeFirst();

    const insertedId = Number(headerResult.insertId);
    if (!insertedId) throw new Error("Failed to create goods receipt");

    // Insert GR lines and update PO received_qty
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      await trx
        .insertInto("goods_receipt_lines")
        .values({
          company_id: companyId,
          receipt_id: insertedId,
          line_no: i + 1,
          po_line_id: line.po_line_id ?? null,
          item_id: line.item_id ?? null,
          description: line.description ?? null,
          qty: line.qty,
          unit: line.unit ?? null,
          over_receipt_allowed: poLineUpdatesByIndex[i]?.over_receipt ? 1 : 0
        })
        .executeTakeFirst();

      if (line.po_line_id !== undefined && line.po_line_id !== null) {
        const update = poLineUpdatesByIndex[i];
        if (!update) {
          throw new Error(`Missing PO line update metadata for input line index ${i}`);
        }
        await trx
          .updateTable("purchase_order_lines")
          .set({ received_qty: fromScaled4(update.new_received_qty) })
          .where("id", "=", update.po_line_id)
          .where("company_id", "=", companyId)
          .executeTakeFirst();
      }
    }

    // Auto-update PO status
    const affectedPOIds = new Set<number>();
    for (const line of input.lines) {
      if (line.po_line_id !== undefined && line.po_line_id !== null) {
        const poLine = await trx
          .selectFrom("purchase_order_lines")
          .where("id", "=", line.po_line_id)
          .select(["order_id"])
          .executeTakeFirst();
        if (poLine) affectedPOIds.add(Number(poLine.order_id));
      }
    }

    for (const poId of affectedPOIds) {
      const po = await trx
        .selectFrom("purchase_orders")
        .where("id", "=", poId)
        .select(["id", "status"])
        .executeTakeFirst();
      if (!po) continue;

      const currentStatus = Number(po.status);
      if (currentStatus !== PURCHASE_ORDER_STATUS.SENT &&
          currentStatus !== PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED) continue;

      const allLines = await trx
        .selectFrom("purchase_order_lines")
        .where("order_id", "=", poId)
        .select(["qty", "received_qty"])
        .execute();

      const allFullyReceived = allLines.every((l) => {
        const qty = toScaled4(String(l.qty));
        const receivedQty = toScaled4(String(l.received_qty));
        return receivedQty >= qty;
      });

      const anyPartiallyReceived = allLines.some((l) => {
        const qty = toScaled4(String(l.qty));
        const receivedQty = toScaled4(String(l.received_qty));
        return receivedQty < qty;
      });

      let newStatus: number | null = null;
      if (allFullyReceived) newStatus = PURCHASE_ORDER_STATUS.RECEIVED;
      else if (anyPartiallyReceived) newStatus = PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED;

      if (newStatus !== null && newStatus !== currentStatus) {
        await trx
          .updateTable("purchase_orders")
          .set({ status: newStatus, updated_by_user_id: userId })
          .where("id", "=", poId)
          .executeTakeFirst();
      }
    }

    return { insertedId, overReceiptWarnings };
  });

  // Fetch full GR result
  const receipt = await getGoodsReceiptById(companyId, result.insertedId);
  if (!receipt) throw new Error("Failed to fetch created goods receipt");

  return { receipt, warnings: result.overReceiptWarnings };
}
