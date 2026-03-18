// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NumericIdSchema } from "@jurnapod/shared";
import { ZodError } from "zod";
import { requireAccess, withAuth } from "@/lib/auth-guard";
import { getDbPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { errorResponse } from "@/lib/response";
import bwipjs from "bwip-js";
import type { BarcodeType } from "@/lib/item-barcodes";
import { generatePdfFromHtml } from "@/lib/pdf-generator";

/**
 * Map internal barcode types to bwip-js encoding formats
 */
export function getBwipFormat(barcodeType: BarcodeType | null | string): string {
  switch (barcodeType) {
    case 'EAN13':
      return 'ean13';
    case 'UPCA':
      return 'upca';
    case 'CODE128':
      return 'code128';
    case 'CUSTOM':
    default:
      return 'code128';
  }
}

/**
 * Supported output formats for barcode labels
 */
export type BarcodeFormat = 'svg' | 'png' | 'pdf';

/**
 * Supported label sizes
 */
export type LabelSize = '2x1' | '3x2' | 'a4';

/**
 * Validate format query parameter
 */
export function isValidFormat(format: string): format is BarcodeFormat {
  return format === 'svg' || format === 'png' || format === 'pdf';
}

/**
 * Validate size query parameter
 */
export function isValidSize(size: string): size is LabelSize {
  return size === '2x1' || size === '3x2' || size === 'a4';
}

/**
 * Get size configuration for barcode generation
 * Returns dimensions for PDF page size and barcode rendering
 */
export function getSizeConfig(size: LabelSize | null): {
  scale: number;
  height: number;
  width?: number;
  padding: number;
  pdfPageSize?: string;
} {
  switch (size) {
    case '2x1':
      return { scale: 2, height: 8, padding: 4, pdfPageSize: '2in 1in' };
    case '3x2':
      return { scale: 3, height: 12, padding: 6, pdfPageSize: '3in 2in' };
    case 'a4':
      return { scale: 4, height: 16, padding: 8, pdfPageSize: 'A4' };
    default:
      return { scale: 3, height: 10, padding: 4, pdfPageSize: '2in 1in' };
  }
}

/**
 * Generate barcode using bwip-js
 * Supports SVG, PNG, and PDF output formats
 */
export async function generateBarcode(
  barcode: string,
  barcodeType: BarcodeType | null,
  format: BarcodeFormat,
  size: LabelSize | null = null
): Promise<{ data: Buffer | string; contentType: string }> {
  const bwipFormat = getBwipFormat(barcodeType);
  const sizeConfig = getSizeConfig(size);
  
  // Common barcode options
  const options: bwipjs.ToBufferOptions = {
    bcid: bwipFormat,
    text: barcode,
    scale: sizeConfig.scale,
    height: sizeConfig.height,
    includetext: true,
    textxalign: 'center',
  };

  if (format === 'svg') {
    // Generate SVG - toSVG exists but isn't in type definitions (synchronous)
    const svg = (bwipjs as unknown as { toSVG: (opts: typeof options) => string }).toSVG({
      ...options,
      scale: sizeConfig.scale,
      height: sizeConfig.height,
    });
    return {
      data: svg,
      contentType: 'image/svg+xml',
    };
  } else if (format === 'pdf') {
    // Generate SVG first, then convert to PDF
    const svg = (bwipjs as unknown as { toSVG: (opts: typeof options) => string }).toSVG({
      ...options,
      scale: sizeConfig.scale,
      height: sizeConfig.height,
    });
    
    // Convert SVG to PDF using puppeteer
    const pdfBuffer = await convertSvgToPdf(svg, sizeConfig.padding, sizeConfig.pdfPageSize || '2in 1in');
    
    return {
      data: pdfBuffer,
      contentType: 'application/pdf',
    };
  } else {
    // Generate PNG
    const buffer = await bwipjs.toBuffer(options);
    return {
      data: buffer,
      contentType: 'image/png',
    };
  }
}

/**
 * Convert SVG barcode to PDF
 * @param svg - SVG string to convert
 * @param padding - Padding in pixels
 * @param pageSize - CSS page size string (e.g., "2in 1in", "A4")
 */
async function convertSvgToPdf(svg: string, padding: number, pageSize: string): Promise<Buffer> {
  // Parse page size for body dimensions
  // For standard sizes like "A4", let CSS handle it naturally
  const isStandardSize = pageSize === 'A4' || pageSize === 'Letter';
  const bodyDimensions = isStandardSize
    ? 'width: 100%; height: 100%;'
    : `width: calc(${pageSize.split(' ')[0]} - ${padding * 2}px); height: calc(${pageSize.split(' ')[1]} - ${padding * 2}px);`;

  // Create HTML page with the SVG centered and padded
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          @page {
            size: ${pageSize};
            margin: 0;
          }
          body {
            margin: 0;
            padding: ${padding}px;
            display: flex;
            justify-content: center;
            align-items: center;
            ${bodyDimensions}
          }
          svg {
            max-width: 100%;
            max-height: 100%;
          }
        </style>
      </head>
      <body>
        ${svg}
      </body>
    </html>
  `;
  
  // Let CSS @page size control the page dimensions
  // Only use format for standard sizes; for custom sizes, rely on CSS
  const pdfOptions: any = {
    printBackground: true,
  };
  
  if (isStandardSize) {
    pdfOptions.format = pageSize as "A4" | "Letter";
  }
  
  return generatePdfFromHtml(html, pdfOptions);
}

export const GET = withAuth(
  async (request, auth) => {
    try {
      const url = new URL(request.url);
      const itemIdRaw = url.pathname.split('/').slice(-2)[0];
      const itemId = NumericIdSchema.parse(itemIdRaw);

      // Parse format query parameter, default to SVG
      const formatParam = url.searchParams.get('format')?.toLowerCase() || 'svg';
      if (!isValidFormat(formatParam)) {
        return errorResponse(
          "INVALID_FORMAT",
          `Invalid format "${formatParam}". Supported formats: svg, png, pdf`,
          400
        );
      }
      const format = formatParam;

      // Parse size query parameter (optional)
      const sizeParam = url.searchParams.get('size')?.toLowerCase();
      if (sizeParam && !isValidSize(sizeParam)) {
        return errorResponse(
          "INVALID_SIZE",
          `Invalid size "${sizeParam}". Supported sizes: 2x1, 3x2, a4`,
          400
        );
      }
      const size = sizeParam || null;

      const pool = getDbPool();
      
      // Get item with barcode
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT name, barcode, barcode_type FROM items WHERE id = ? AND company_id = ?`,
        [itemId, auth.companyId]
      );

      if (rows.length === 0) {
        return errorResponse("NOT_FOUND", "Item not found", 404);
      }

      const item = rows[0];
      
      if (!item.barcode) {
        return errorResponse("NOT_FOUND", "Item has no barcode", 404);
      }

      // Generate barcode in requested format and size
      const { data, contentType } = await generateBarcode(
        item.barcode,
        item.barcode_type,
        format,
        size as LabelSize | null
      );

      // Convert Buffer to Uint8Array for Response body
      const body = Buffer.isBuffer(data) ? new Uint8Array(data) : data;

      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse("INVALID_REQUEST", "Invalid request", 400);
      }

      // Handle bwip-js specific errors
      if (error instanceof Error && error.message.includes('Barcode')) {
        return errorResponse(
          "INVALID_BARCODE",
          `Failed to generate barcode: ${error.message}`,
          400
        );
      }

      console.error("GET /api/inventory/items/[itemId]/barcode-label failed", error);
      return errorResponse("INTERNAL_SERVER_ERROR", "Failed to generate barcode label", 500);
    }
  },
  [requireAccess({ roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"], module: "inventory", permission: "read" })]
);
