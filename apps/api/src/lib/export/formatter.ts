// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Data Formatting and Column Mapping Utilities
 * 
 * Provides formatting functions for various field types and utilities for
 * mapping between column definitions and export output.
 */

import type {
  FieldType,
  FormatOptions,
  ExportColumn,
  ExportOptions,
  MoneyFormatOptions,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';
const DEFAULT_DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';
const DEFAULT_MONEY_FORMAT: MoneyFormatOptions = {
  symbol: '',
  decimals: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.',
  symbolPosition: 'prefix',
};

/**
 * Map of camelCase to friendly names
 */
const CAMEL_CASE_MAP: Record<string, string> = {
  id: 'ID',
  uuid: 'UUID',
  code: 'Code',
  name: 'Name',
  description: 'Description',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
  createdBy: 'Created By',
  updatedBy: 'Updated By',
  deletedAt: 'Deleted At',
  deletedBy: 'Deleted By',
  companyId: 'Company ID',
  outletId: 'Outlet ID',
  userId: 'User ID',
  status: 'Status',
  type: 'Type',
  category: 'Category',
  quantity: 'Quantity',
  price: 'Price',
  amount: 'Amount',
  total: 'Total',
  subtotal: 'Subtotal',
  tax: 'Tax',
  discount: 'Discount',
  rate: 'Rate',
  percentage: 'Percentage',
  date: 'Date',
  time: 'Time',
  startDate: 'Start Date',
  endDate: 'End Date',
  startTime: 'Start Time',
  endTime: 'End Time',
  effectiveDate: 'Effective Date',
  expirationDate: 'Expiration Date',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  city: 'City',
  state: 'State',
  country: 'Country',
  postalCode: 'Postal Code',
  zipCode: 'ZIP Code',
  notes: 'Notes',
  remark: 'Remark',
  reference: 'Reference',
  referenceNumber: 'Reference Number',
  invoiceNumber: 'Invoice Number',
  receiptNumber: 'Receipt Number',
  transactionId: 'Transaction ID',
  clientTxId: 'Client Transaction ID',
  batchId: 'Batch ID',
  sessionId: 'Session ID',
  outletName: 'Outlet Name',
  companyName: 'Company Name',
  userName: 'User Name',
  firstName: 'First Name',
  lastName: 'Last Name',
  fullName: 'Full Name',
  itemName: 'Item Name',
  variantName: 'Variant Name',
  itemCode: 'Item Code',
  sku: 'SKU',
  barcode: 'Barcode',
  unit: 'Unit',
  units: 'Units',
  variant: 'Variant',
  variants: 'Variants',
  account: 'Account',
  accountCode: 'Account Code',
  accountName: 'Account Name',
  journalId: 'Journal ID',
  entryId: 'Entry ID',
  postingDate: 'Posting Date',
  value: 'Value',
  balance: 'Balance',
  debit: 'Debit',
  credit: 'Credit',
  debitAmount: 'Debit Amount',
  creditAmount: 'Credit Amount',
};

// ============================================================================
// Value Formatters
// ============================================================================

/**
 * Format a value based on field type
 */
export function formatValue(
  value: unknown,
  fieldType: FieldType | undefined,
  options?: FormatOptions
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const effectiveFieldType = fieldType || options?.fieldType || 'string';
  const formatOpts = options || {};

  switch (effectiveFieldType) {
    case 'date':
      return formatDate(value, formatOpts.dateFormat || DEFAULT_DATE_FORMAT);
    
    case 'datetime':
      return formatDateTime(value, formatOpts.datetimeFormat || DEFAULT_DATETIME_FORMAT);
    
    case 'money':
      return formatMoney(value, formatOpts.moneyFormat || DEFAULT_MONEY_FORMAT);
    
    case 'boolean':
      return formatBoolean(value);
    
    case 'number':
    case 'integer':
      return formatNumber(value, effectiveFieldType === 'integer');
    
    case 'enum':
      if (formatOpts.enumLabels) {
        const stringValue = String(value);
        return formatOpts.enumLabels[stringValue] || stringValue;
      }
      return String(value);
    
    case 'string':
    default:
      return String(value);
  }
}

/**
 * Format a date value
 */
export function formatDate(value: unknown, format: string = DEFAULT_DATE_FORMAT): string {
  if (!value) return '';
  
  let date: Date;
  
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    // Assume unix timestamp in milliseconds
    date = new Date(value);
  } else if (typeof value === 'string') {
    // Try to parse string
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      return value; // Return original if parsing fails
    }
    date = parsed;
  } else {
    return String(value);
  }

  if (isNaN(date.getTime())) {
    return String(value);
  }

  return formatDateString(date, format);
}

/**
 * Format a datetime value
 */
export function formatDateTime(
  value: unknown,
  format: string = DEFAULT_DATETIME_FORMAT
): string {
  return formatDate(value, format);
}

/**
 * Format a money value
 */
export function formatMoney(value: unknown, options: MoneyFormatOptions = DEFAULT_MONEY_FORMAT): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value));
  
  if (isNaN(num)) {
    return String(value);
  }

  const {
    symbol = '',
    decimals = 2,
    thousandsSeparator = ',',
    decimalSeparator = '.',
    symbolPosition = 'prefix',
  } = options;

  // Format the number parts
  const absNum = Math.abs(num);
  const fixed = absNum.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  // Apply thousands separator
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  
  // Combine with decimal
  const formattedNumber = decimals > 0 
    ? `${formattedInt}${decimalSeparator}${decPart}`
    : formattedInt;

  // Handle negative
  const sign = num < 0 ? '-' : '';
  
  // Apply symbol
  const numberWithSign = `${sign}${formattedNumber}`;
  
  if (!symbol) {
    return numberWithSign;
  }

  return symbolPosition === 'prefix'
    ? `${symbol}${numberWithSign}`
    : `${numberWithSign}${symbol}`;
}

/**
 * Format a boolean value
 */
export function formatBoolean(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(lower)) {
      return 'Yes';
    }
    if (['false', '0', 'no', 'n', 'off', ''].includes(lower)) {
      return 'No';
    }
  }
  
  if (typeof value === 'number') {
    return value !== 0 ? 'Yes' : 'No';
  }

  return String(value);
}

/**
 * Format a number value
 */
export function formatNumber(value: unknown, isInteger: boolean = false): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value));
  
  if (isNaN(num)) {
    return String(value);
  }

  return isInteger ? Math.round(num).toString() : num.toString();
}

// ============================================================================
// Date Formatting Helpers
// ============================================================================

/**
 * Format a Date object according to format string
 * Supports: yyyy, MM, dd, HH, mm, ss
 */
function formatDateString(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  return format
    .replace(/yyyy/g, String(year))
    .replace(/MM/g, padZero(month))
    .replace(/dd/g, padZero(day))
    .replace(/HH/g, padZero(hours))
    .replace(/mm/g, padZero(minutes))
    .replace(/ss/g, padZero(seconds));
}

/**
 * Pad number with leading zero
 */
function padZero(num: number, length: number = 2): string {
  return String(num).padStart(length, '0');
}

// ============================================================================
// Column Mapping Utilities
// ============================================================================

/**
 * Convert camelCase to friendly name
 */
export function camelCaseToFriendly(str: string): string {
  // Check predefined map first
  if (CAMEL_CASE_MAP[str]) {
    return CAMEL_CASE_MAP[str];
  }

  // Handle special cases
  // Insert space before uppercase letters and handle acronyms
  const spaced = str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

  return spaced;
}

/**
 * Get header name for a column
 */
export function getColumnHeader(key: string, customHeader?: string): string {
  if (customHeader) {
    return customHeader;
  }
  return camelCaseToFriendly(key);
}

/**
 * Build column map from column definitions
 */
export function buildColumnMap<T>(
  columns: ExportColumn<T>[],
  options?: ExportOptions
): ExportColumn<T>[] {
  let result = [...columns];

  // Filter to selected columns if specified
  if (options?.selectedColumns && options.selectedColumns.length > 0) {
    const selectedSet = new Set(options.selectedColumns);
    result = result.filter((col) => selectedSet.has(col.key));
  }

  // Reorder if column order specified
  if (options?.columnOrder && options.columnOrder.length > 0) {
    const orderMap = new Map(options.columnOrder.map((key, index) => [key, index]));
    result.sort((a, b) => {
      const aOrder = orderMap.get(a.key);
      const bOrder = orderMap.get(b.key);
      if (aOrder === undefined && bOrder === undefined) return 0;
      if (aOrder === undefined) return 1;
      if (bOrder === undefined) return -1;
      return aOrder - bOrder;
    });
  }

  return result;
}

/**
 * Extract value from row using column definition
 */
export function extractColumnValue<T>(
  row: T,
  column: ExportColumn<T>
): unknown {
  if (column.formatter) {
    return column.formatter(
      column.field ? getFieldValue(row, column.field) : undefined,
      row
    );
  }

  if (column.field) {
    return getFieldValue(row, column.field);
  }

  // If no field specified, use key to look up
  return getFieldValue(row, column.key);
}

/**
 * Get nested field value from object using dot notation
 */
function getFieldValue<T>(obj: T, path: string | ((row: T) => unknown)): unknown {
  if (typeof path === 'function') {
    return path(obj);
  }

  if (typeof obj !== 'object' || obj === null) {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Resolve all values from a row based on column definitions
 */
export function resolveRowValues<T>(
  row: T,
  columns: ExportColumn<T>[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const column of columns) {
    result[column.key] = extractColumnValue(row, column);
  }

  return result;
}

// ============================================================================
// Format Options Utilities
// ============================================================================

/**
 * Merge format options with defaults
 */
export function mergeFormatOptions(
  columnOptions?: FormatOptions,
  globalOptions?: ExportOptions
): FormatOptions {
  return {
    fieldType: columnOptions?.fieldType,
    dateFormat: columnOptions?.dateFormat || globalOptions?.dateFormat || DEFAULT_DATE_FORMAT,
    datetimeFormat: columnOptions?.datetimeFormat || globalOptions?.datetimeFormat || DEFAULT_DATETIME_FORMAT,
    moneyFormat: columnOptions?.moneyFormat || globalOptions?.moneyFormat || DEFAULT_MONEY_FORMAT,
    formatter: columnOptions?.formatter,
    enumLabels: columnOptions?.enumLabels,
  };
}

/**
 * Create format options from field type
 */
export function createFormatOptions(fieldType: FieldType): FormatOptions {
  return {
    fieldType,
    ...(fieldType === 'date' && { dateFormat: DEFAULT_DATE_FORMAT }),
    ...(fieldType === 'datetime' && { datetimeFormat: DEFAULT_DATETIME_FORMAT }),
    ...(fieldType === 'money' && { moneyFormat: DEFAULT_MONEY_FORMAT }),
  };
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate column configuration
 */
export function validateColumns<T>(columns: ExportColumn<T>[]): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();

  for (const column of columns) {
    if (!column.key) {
      errors.push('Column key is required');
      continue;
    }

    if (keys.has(column.key)) {
      errors.push(`Duplicate column key: ${column.key}`);
    }
    keys.add(column.key);

    if (!column.header) {
      errors.push(`Column header is required for key: ${column.key}`);
    }
  }

  return errors;
}

/**
 * Validate export options
 */
export function validateExportOptions(options: ExportOptions): string[] {
  const errors: string[] = [];

  if (options.format && !['csv', 'xlsx'].includes(options.format)) {
    errors.push(`Invalid format: ${options.format}. Supported: csv, xlsx`);
  }

  if (options.maxRows !== undefined && options.maxRows < 0) {
    errors.push('maxRows must be a non-negative number');
  }

  return errors;
}

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Escape CSV field value
 */
export function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  
  // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Check if value is empty (null, undefined, or empty string after trim)
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  
  return false;
}

/**
 * Convert value to safe string for export
 */
export function toExportString(value: unknown, fieldType?: FieldType): string {
  if (isEmptyValue(value)) {
    return '';
  }

  if (fieldType) {
    return formatValue(value, fieldType);
  }

  if (value instanceof Date) {
    return formatDate(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
