// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

const ROUTE_MOVED_RESPONSE = {
  ok: false,
  error: {
    code: "ROUTE_MOVED",
    new_path: "/api/inventory/item-prices/active"
  }
};

function moved(): Response {
  return Response.json(ROUTE_MOVED_RESPONSE, { status: 410 });
}

export const GET = moved;
