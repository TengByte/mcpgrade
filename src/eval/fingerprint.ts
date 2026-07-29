import { createHash } from "node:crypto";
import type { ServerSnapshot } from "../types.js";
import type { EnvFingerprint, EvalOptions } from "./types.js";

/**
 * Bump when the selection system prompt changes in a way that could move
 * scores. Two results with different promptVersion are not comparable.
 */
export const PROMPT_VERSION = 1;

/**
 * Bump when the shape of the tool catalog handed to the model changes
 * (field set, ordering, JSON formatting).
 */
export const SERIALIZER_VERSION = 1;

/** How the catalog shown to the model is assembled. */
export const CATALOG_POLICY = "full-catalog-single-shot";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Content hash of the exact catalog the model saw. Any schema drift —
 * a renamed tool, an added parameter, a reworded description — changes it,
 * which is what makes two runs comparable or visibly incomparable.
 */
export function catalogHash(serializedCatalog: string): string {
  return sha256(serializedCatalog).slice(0, 16);
}

export function buildFingerprint(args: {
  snapshot: ServerSnapshot;
  opts: EvalOptions;
  serializedCatalog: string;
  systemPrompt: string;
}): EnvFingerprint {
  const { snapshot, opts, serializedCatalog, systemPrompt } = args;
  return {
    server: {
      source: snapshot.source,
      name: snapshot.serverName,
      toolCount: snapshot.tools.length,
      catalogHash: catalogHash(serializedCatalog),
    },
    model: {
      name: opts.client.name,
      temperature: opts.client.temperature ?? null,
    },
    harness: {
      mcpgradeVersion: process.env.npm_package_version ?? null,
      promptVersion: PROMPT_VERSION,
      promptHash: sha256(systemPrompt).slice(0, 16),
      serializerVersion: SERIALIZER_VERSION,
    },
    taskPolicy: {
      catalogPolicy: CATALOG_POLICY,
      tasksPerTool: opts.tasksPerTool,
      distractors: opts.distractors,
      seed: opts.seed ?? null,
    },
    runAt: new Date().toISOString(),
  };
}

/** True when two runs are directly comparable (same server, model, harness). */
export function comparable(a: EnvFingerprint, b: EnvFingerprint): boolean {
  return (
    a.server.catalogHash === b.server.catalogHash &&
    a.model.name === b.model.name &&
    a.model.temperature === b.model.temperature &&
    a.harness.promptHash === b.harness.promptHash &&
    a.harness.serializerVersion === b.harness.serializerVersion &&
    a.taskPolicy.catalogPolicy === b.taskPolicy.catalogPolicy &&
    a.taskPolicy.tasksPerTool === b.taskPolicy.tasksPerTool &&
    a.taskPolicy.distractors === b.taskPolicy.distractors
  );
}
