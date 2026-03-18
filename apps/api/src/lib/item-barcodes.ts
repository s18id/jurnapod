// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { getDbPool } from "./db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

export type BarcodeType = 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM';

export interface BarcodeValidationResult {
  valid: boolean;
  type: BarcodeType | null;
  error?: string;
}

export interface ItemWithBarcode extends RowDataPacket {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  barcode: string;
  barcode_type: BarcodeType;
  base_price: number;
  thumbnail_url: string | null;
}

export interface ItemVariantWithBarcode extends RowDataPacket {
  id: number;
  item_id: number;
  sku: string;
  variant_name: string;
  barcode: string;
  price: number;
}

/**
 * Detect barcode type based on format
 */
export function detectBarcodeType(barcode: string): BarcodeType {
  const cleanBarcode = barcode.trim();
  
  // EAN-13: 13 digits
  if (/^\d{13}$/.test(cleanBarcode)) {
    return 'EAN13';
  }
  
  // UPC-A: 12 digits
  if (/^\d{12}$/.test(cleanBarcode)) {
    return 'UPCA';
  }
  
  // Code128: Alphanumeric, 1-48 chars
  if (/^[A-Za-z0-9\-._\s]+$/.test(cleanBarcode) && cleanBarcode.length >= 1 && cleanBarcode.length <= 48) {
    return 'CODE128';
  }
  
  return 'CUSTOM';
}

/**
 * Validate EAN-13 checksum
 */
export function validateEAN13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  
  return checksum === parseInt(barcode[12]);
}

/**
 * Validate UPC-A checksum
 */
export function validateUPCA(barcode: string): boolean {
  if (!/^\d{12}$/.test(barcode)) return false;
  
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const checksum = (10 - (sum % 10)) % 10;
  
  return checksum === parseInt(barcode[11]);
}

/**
 * Validate Code128 format
 */
export function validateCode128(barcode: string): boolean {
  return /^[A-Za-z0-9\-._\s]+$/.test(barcode) && 
         barcode.length >= 1 && 
         barcode.length <= 48;
}

/**
 * Validate barcode based on its type
 */
export function validateBarcode(barcode: string, type?: BarcodeType): BarcodeValidationResult {
  const cleanBarcode = barcode.trim();
  
  if (!cleanBarcode) {
    return { valid: false, type: null, error: "Barcode cannot be empty" };
  }
  
  const detectedType = type || detectBarcodeType(cleanBarcode);
  
  switch (detectedType) {
    case 'EAN13':
      if (!validateEAN13(cleanBarcode)) {
        return { valid: false, type: 'EAN13', error: "Invalid EAN-13 barcode checksum" };
      }
      break;
      
    case 'UPCA':
      if (!validateUPCA(cleanBarcode)) {
        return { valid: false, type: 'UPCA', error: "Invalid UPC-A barcode checksum" };
      }
      break;
      
    case 'CODE128':
      if (!validateCode128(cleanBarcode)) {
        return { valid: false, type: 'CODE128', error: "Invalid Code128 format (must be 1-48 alphanumeric characters)" };
      }
      break;
      
    case 'CUSTOM':
      if (cleanBarcode.length > 100) {
        return { valid: false, type: 'CUSTOM', error: "Custom barcode exceeds 100 characters" };
      }
      break;
  }
  
  return { valid: true, type: detectedType };
}

/**
 * Check if barcode is unique within company (excluding a specific item if updating)
 */
export async function checkBarcodeUnique(
  companyId: number,
  barcode: string,
  excludeItemId?: number
): Promise<{ unique: boolean; existingItem?: ItemWithBarcode }> {
  const pool = getDbPool();
  
  let sql = `
    SELECT id, company_id, sku, name, barcode, barcode_type, 
           COALESCE((
             SELECT price FROM item_prices 
             WHERE item_id = items.id AND outlet_id IS NULL AND is_active = 1 
             LIMIT 1
           ), 0) as base_price,
           (
             SELECT thumbnail_url FROM item_images
             WHERE item_id = items.id AND company_id = items.company_id AND is_primary = TRUE
             LIMIT 1
           ) as thumbnail_url
    FROM items 
    WHERE company_id = ? AND barcode = ?
  `;
  const params: (number | string)[] = [companyId, barcode];
  
  if (excludeItemId) {
    sql += " AND id != ?";
    params.push(excludeItemId);
  }
  
  sql += " LIMIT 1";
  
  const [rows] = await pool.execute<ItemWithBarcode[]>(sql, params);
  
  if (rows.length > 0) {
    return { unique: false, existingItem: rows[0] };
  }
  
  // Also check variant barcodes
  let variantSql = `
    SELECT v.id, v.item_id, v.sku, v.variant_name as name, v.barcode, 
           'CUSTOM' as barcode_type, v.price_override as base_price
    FROM item_variants v
    JOIN items i ON v.item_id = i.id
    WHERE i.company_id = ? AND v.barcode = ?
  `;
  const variantParams: (number | string)[] = [companyId, barcode];
  
  if (excludeItemId) {
    variantSql += " AND v.item_id != ?";
    variantParams.push(excludeItemId);
  }
  
  variantSql += " LIMIT 1";
  
  const [variantRows] = await pool.execute<(ItemVariantWithBarcode & ItemWithBarcode)[]>(variantSql, variantParams);
  
  if (variantRows.length > 0) {
    return { 
      unique: false, 
      existingItem: {
        ...variantRows[0],
        company_id: companyId,
        thumbnail_url: null
      }
    };
  }
  
  return { unique: true };
}

/**
 * Update item barcode
 */
export async function updateItemBarcode(
  companyId: number,
  itemId: number,
  barcode: string,
  barcodeType: BarcodeType,
  userId: number
): Promise<ItemWithBarcode> {
  const pool = getDbPool();
  
  // Validate barcode
  const validation = validateBarcode(barcode, barcodeType);
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid barcode");
  }
  
  // Check uniqueness (app-level for friendly error message)
  const uniqueness = await checkBarcodeUnique(companyId, barcode, itemId);
  if (!uniqueness.unique) {
    throw new Error(`Barcode already in use by ${uniqueness.existingItem?.name || 'another item'}`);
  }
  
  // Update item (DB-level uniqueness constraint will catch races)
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE items 
       SET barcode = ?, barcode_type = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [barcode, barcodeType, itemId, companyId]
    );
    
    if (result.affectedRows === 0) {
      throw new Error("Item not found or no changes made");
    }
  } catch (dbError: any) {
    // Handle DB duplicate key error (race condition)
    if (dbError.code === 'ER_DUP_ENTRY' || dbError.errno === 1062) {
      throw new Error(`Barcode already in use by another item (concurrent update detected)`);
    }
    throw dbError;
  }
  
  // Log audit event
  await pool.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       ip_address,
       payload_json
     ) VALUES (?, NULL, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      companyId,
      userId,
      'ITEM_BARCODE_UPDATE',
      JSON.stringify({ item_id: itemId, barcode, barcode_type: barcodeType })
    ]
  );
  
  // Return updated item
  const [rows] = await pool.execute<ItemWithBarcode[]>(
    `SELECT id, company_id, sku, name, barcode, barcode_type, 
            COALESCE((
              SELECT price FROM item_prices 
              WHERE item_id = items.id AND outlet_id IS NULL AND is_active = 1 
              LIMIT 1
            ), 0) as base_price,
            (
              SELECT thumbnail_url FROM item_images
              WHERE item_id = items.id AND company_id = items.company_id AND is_primary = TRUE
              LIMIT 1
            ) as thumbnail_url
     FROM items 
     WHERE id = ? AND company_id = ?`,
    [itemId, companyId]
  );
  
  if (rows.length === 0) {
    throw new Error("Item not found after update");
  }
  
  return rows[0];
}

/**
 * Find items by barcode (including variants)
 */
export async function findItemsByBarcode(
  companyId: number,
  barcode: string
): Promise<Array<ItemWithBarcode & { variants?: ItemVariantWithBarcode[] }>> {
  const pool = getDbPool();
  
  // Find items with matching barcode
  const [itemRows] = await pool.execute<ItemWithBarcode[]>(
    `SELECT id, company_id, sku, name, barcode, barcode_type, 
            COALESCE((
              SELECT price FROM item_prices 
              WHERE item_id = items.id AND outlet_id IS NULL AND is_active = 1 
              LIMIT 1
            ), 0) as base_price,
            (
              SELECT thumbnail_url FROM item_images
              WHERE item_id = items.id AND company_id = items.company_id AND is_primary = TRUE
              LIMIT 1
            ) as thumbnail_url
     FROM items 
     WHERE company_id = ? AND barcode = ? AND is_active = 1`,
    [companyId, barcode]
  );
  
  // Find variants with matching barcode
  const [variantRows] = await pool.execute<ItemVariantWithBarcode[]>(
    `SELECT v.id, v.item_id, v.sku, v.variant_name, v.barcode,
            COALESCE(v.price_override, (
              SELECT price FROM item_prices 
              WHERE item_id = i.id AND outlet_id IS NULL AND is_active = 1 
              LIMIT 1
            ), 0) as price
     FROM item_variants v
     JOIN items i ON v.item_id = i.id
     WHERE i.company_id = ? AND v.barcode = ? AND v.is_active = 1 AND i.is_active = 1`,
    [companyId, barcode]
  );
  
  // Group variants by item
  const variantsByItem = new Map<number, ItemVariantWithBarcode[]>();
  for (const variant of variantRows) {
    if (!variantsByItem.has(variant.item_id)) {
      variantsByItem.set(variant.item_id, []);
    }
    variantsByItem.get(variant.item_id)!.push(variant);
  }
  
  // Build result with variants
  const result: Array<ItemWithBarcode & { variants?: ItemVariantWithBarcode[] }> = [];
  
  for (const item of itemRows) {
    result.push({
      ...item,
      variants: variantsByItem.get(item.id)
    });
  }
  
  // Add items that only have matching variants (not the parent item itself)
  for (const [itemId, variants] of variantsByItem) {
    const alreadyIncluded = itemRows.some(item => item.id === itemId);
    if (!alreadyIncluded) {
      // Fetch parent item details
      const [parentRows] = await pool.execute<ItemWithBarcode[]>(
        `SELECT id, company_id, sku, name, barcode, barcode_type, 
                COALESCE((
                  SELECT price FROM item_prices 
                  WHERE item_id = items.id AND outlet_id IS NULL AND is_active = 1 
                  LIMIT 1
                ), 0) as base_price,
                NULL as thumbnail_url
         FROM items 
         WHERE id = ? AND company_id = ?`,
        [itemId, companyId]
      );
      
      if (parentRows.length > 0) {
        result.push({
          ...parentRows[0],
          variants
        });
      }
    }
  }
  
  return result;
}

/**
 * Remove barcode from item
 */
export async function removeItemBarcode(
  companyId: number,
  itemId: number,
  userId: number
): Promise<void> {
  const pool = getDbPool();
  
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE items 
     SET barcode = NULL, barcode_type = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND company_id = ?`,
    [itemId, companyId]
  );
  
  if (result.affectedRows === 0) {
    throw new Error("Item not found or no changes made");
  }
  
  // Log audit event
  await pool.execute(
    `INSERT INTO audit_logs (
       company_id,
       outlet_id,
       user_id,
       action,
       result,
       success,
       ip_address,
       payload_json
     ) VALUES (?, NULL, ?, ?, 'SUCCESS', 1, NULL, ?)`,
    [
      companyId,
      userId,
      'ITEM_BARCODE_REMOVE',
      JSON.stringify({ item_id: itemId, barcode_removed: true })
    ]
  );
}
