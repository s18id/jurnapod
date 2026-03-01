const ROUTE_MOVED_RESPONSE = {
  ok: false,
  error: {
    code: "ROUTE_MOVED",
    new_path: "/api/inventory/item-prices/:priceId"
  }
};

function moved(): Response {
  return Response.json(ROUTE_MOVED_RESPONSE, { status: 410 });
}

export const GET = moved;
export const PATCH = moved;
export const DELETE = moved;
