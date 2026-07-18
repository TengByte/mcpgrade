import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TokenBudget } from "./rules/token.js";

export interface McplintConfig {
  disable?: string[];
  tokenBudget?: Partial<TokenBudget>;
}

/** Load config from --config path or ./.mcplintrc.json if present. */
export async function loadConfig(explicitPath?: string): Promise<McplintConfig> {
  const path = explicitPath ?? resolve(process.cwd(), ".mcplintrc.json");
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return raw as McplintConfig;
  } catch (err) {
    if (explicitPath) {
      throw new Error(`Could not read config file: ${explicitPath}`);
    }
    return {}; // no rc file — defaults
  }
}
