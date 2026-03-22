import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const constantsJs = readFileSync("./packages/shared/dist/constants/table-states.js", "utf8");
const schemasJs = readFileSync("./packages/shared/dist/schemas/table-reservation.js", "utf8");

assert(constantsJs.includes("BOOKED: 1"), "ReservationStatusId.BOOKED missing in build output");
assert(constantsJs.includes("NO_SHOW: 7"), "ReservationStatusId.NO_SHOW missing in build output");
assert(constantsJs.includes("OCCUPIED: 5"), "OutletTableStatusId.OCCUPIED missing in build output");
assert(constantsJs.includes("UNAVAILABLE: 7"), "OutletTableStatusId.UNAVAILABLE missing in build output");

assert(schemasJs.includes("OptionalOrderIdSchema"), "OptionalOrderIdSchema not emitted");
assert(schemasJs.includes("clientTxId: z.string().min(1).max(255)"), "clientTxId hardening not emitted");
assert(schemasJs.includes("companyId: IdSchema"), "companyId requirement not emitted");
assert(schemasJs.includes("outletId: IdSchema"), "outletId requirement not emitted");

console.log("table-reservation schema build artifacts validated");
