// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { requireAccess, withAuth } from "@/lib/auth-guard";
import { findItemsByBarcode } from "@/lib/item-barcodes";
import { getItemThumbnail } from "@/lib/item-images";
import { errorResponse, successResponse } from "@/lib/response";

type BarcodeImageLookupDeps = {
  findItemsByBarcodeFn: typeof findItemsByBarcode;
  getItemThumbnailFn: typeof getItemThumbnail;
};

const defaultDeps: BarcodeImageLookupDeps = {
  findItemsByBarcodeFn: findItemsByBarcode,
  getItemThumbnailFn: getItemThumbnail
};

function parseBarcode(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  // Extract barcode from pattern: /api/inventory/items/lookup/barcode/[barcode]/image
  const barcodeSegmentIndex = segments.indexOf("barcode");
  if (barcodeSegmentIndex < 0 || barcodeSegmentIndex + 1 >= segments.length) {
    return "";
  }

  const barcodeRaw = segments[barcodeSegmentIndex + 1];
  return decodeURIComponent(barcodeRaw);
}

export async function handleBarcodeImageLookup(
  request: Request,
  auth: { companyId: number },
  deps: BarcodeImageLookupDeps = defaultDeps
): Promise<Response> {
  try {
    let barcode: string;
    try {
      barcode = parseBarcode(request);
    } catch {
      return errorResponse("INVALID_REQUEST", "Barcode contains invalid URL encoding", 400);
    }

    if (!barcode.trim()) {
      return errorResponse("INVALID_REQUEST", "Barcode is required", 400);
    }

    // Lookup items by barcode (tenant-scoped via company_id)
    const items = await deps.findItemsByBarcodeFn(auth.companyId, barcode);

    // Return 404 if barcode not found
    if (items.length === 0) {
      return errorResponse("BARCODE_NOT_FOUND", "No item found with the specified barcode", 404);
    }

    // Return 409 if ambiguous (multiple items with same barcode)
    if (items.length > 1) {
      return Response.json(
        {
          success: false,
          error: {
            code: "AMBIGUOUS_BARCODE",
            message: "Multiple items found with this barcode. Please use specific item lookup.",
            candidates: items.map((item) => ({
              item_id: item.id,
              item_name: item.name,
              sku: item.sku,
              barcode: item.barcode,
              thumbnail_url: item.thumbnail_url
            }))
          }
        },
        { status: 409 }
      );
    }

    // Get the matched item (single match)
    const item = items[0];

    // Check if barcode matched a specific variant (not the parent item)
    const matchedVariant = item.variants?.find((v) => v.barcode === barcode);

    // Get primary thumbnail for the item (variants use parent item images)
    const thumbnailUrl = await deps.getItemThumbnailFn(auth.companyId, item.id);

    // Return 404 if no image thumbnail exists
    if (!thumbnailUrl) {
      return errorResponse("IMAGE_NOT_FOUND", "Item found but no thumbnail image is available", 404);
    }

    // Return success response with thumbnail URL
    return successResponse({
      item_id: item.id,
      item_name: item.name,
      sku: matchedVariant?.sku || item.sku,
      barcode: barcode,
      thumbnail_url: thumbnailUrl,
      variant: matchedVariant
        ? {
            id: matchedVariant.id,
            sku: matchedVariant.sku,
            variant_name: matchedVariant.variant_name
          }
        : undefined
    });
  } catch (error) {
    console.error("GET /api/inventory/items/lookup/barcode/[barcode]/image failed", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "Failed to retrieve item image", 500);
  }
}

export const GET = withAuth(
  async (request, auth) => handleBarcodeImageLookup(request, auth),
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT", "CASHIER"], module: "inventory", permission: "read" })]
);
