import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TokenBudget } from "./rules/token.js";

export interface McpgradeConfig {
  disable?: string[];
  tokenBudget?: Partial<TokenBudget>;
}

/** Load config from --config path or ./.mcpgraderc.json if present. */
export async function loadConfig(explicitPath?: string): Promise<McpgradeConfig> {
  const path = explicitPath ?? resolve(process.cwd(), ".mcpgraderc.json");
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return raw as McpgradeConfig;
  } catch (err) {
    if (explicitPath) {
      throw new Error(`Could not read config file: ${explicitPath}`);
    }
    return {}; // no rc file — defaults
  }
}
