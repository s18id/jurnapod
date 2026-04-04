import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function hasWorkspacePackageJson(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Boolean(pkg && pkg.workspaces);
  } catch {
    return false;
  }
}

function findMonorepoRootEnv(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  let fallbackEnv = null;

  while (true) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      if (!fallbackEnv) fallbackEnv = envPath;
      if (hasWorkspacePackageJson(dir)) return envPath;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return fallbackEnv;
}

const rootEnvPath = findMonorepoRootEnv();
if (rootEnvPath) {
  // Base defaults from monorepo root .env
  dotenv.config({ path: rootEnvPath, override: false });
}

const localEnvPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(localEnvPath) && localEnvPath !== rootEnvPath) {
  // Package-local .env overrides root defaults when present
  dotenv.config({ path: localEnvPath, override: true });
}
