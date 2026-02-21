import { assertAppEnvReady } from "./src/lib/env";

export async function register() {
  assertAppEnvReady();
}
