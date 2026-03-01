// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";

export const UUID = z.string().uuid();
export const NumericIdSchema = z.coerce.number().int().positive();

export const RoleSchema = z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "CASHIER", "ACCOUNTANT"]);

export const DocumentStatusSchema = z.enum(["DRAFT", "POSTED", "VOID"]);

export const PosStatusSchema = z.enum(["COMPLETED", "VOID", "REFUND"]);

export const MoneySchema = z.number().finite();

export type Role = z.infer<typeof RoleSchema>;
export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;
export type PosStatus = z.infer<typeof PosStatusSchema>;
