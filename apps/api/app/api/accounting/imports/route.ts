const ROUTE_MOVED_RESPONSE = {
  ok: false,
  error: {
    code: "ROUTE_MOVED",
    new_path: "/api/accounts/imports"
  }
};

function moved(): Response {
  return Response.json(ROUTE_MOVED_RESPONSE, { status: 410 });
}

export const POST = moved;
