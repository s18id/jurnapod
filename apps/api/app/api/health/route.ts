// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "jurnapod-api" });
}
