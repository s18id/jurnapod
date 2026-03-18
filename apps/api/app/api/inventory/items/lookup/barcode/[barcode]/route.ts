// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { findItemsByBarcode } from "@/lib/item-barcodes";
import { errorResponse, successResponse } from "@/lib/response";

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const barcodeRaw = url.pathname.split('/').pop() || '';
      
      // Decode URL-encoded barcode (e.g., custom barcodes with spaces or special chars)
      let barcode: string;
      try {
        barcode = decodeURIComponent(barcodeRaw);
      } catch (decodeError) {
        return errorResponse("INVALID_REQUEST", "Barcode contains invalid URL encoding", 400);
      }
      
      if (!barcode.trim()) {
        return errorResponse("INVALID_REQUEST", "Barcode is required", 400);
      }

      const items = await findItemsByBarcode(auth.companyId, barcode);

      // Transform response to match BarcodeLookupResponse schema
      const response = {
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          barcode: item.barcode,
          base_price: Number(item.base_price) || 0,
          image_thumbnail_url: item.thumbnail_url,
          variants: item.variants?.map(v => ({
            id: v.id,
            sku: v.sku,
            variant_name: v.variant_name,
            barcode: v.barcode,
            price: Number(v.price) || 0
          }))
        }))
      };

      return successResponse(response);
    } catch (error) {
      console.error("GET /api/inventory/items/lookup/barcode/[barcode] failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to lookup barcode", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"], module: "inventory", permission: "read" })]
);
