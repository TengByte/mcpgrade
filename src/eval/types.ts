import type { ToolDef } from "../types.js";

/** A synthetic user task targeting one tool (or none, for distractors). */
export interface EvalTask {
  id: string;
  prompt: string; // natural-language user request
  expectedTool: string | null; // null = model should decline / pick nothing
  kind: "direct" | "paraphrase" | "distractor";
}

export interface ToolChoice {
  toolName: string | null; // null = declined
  args: Record<string, unknown> | null;
  raw?: string;
}

export interface TaskResult {
  task: EvalTask;
  choice: ToolChoice;
  selectedCorrectly: boolean;
  argsValid: boolean | null; // null when no args expected/returned
}

export interface ConfusionPair {
  expected: string;
  got: string;
  count: number;
}

/**
 * Everything that must be pinned for two eval results to be comparable.
 * A score without this is not a measurement, it's an anecdote.
 */
export interface EnvFingerprint {
  server: {
    source: string;
    name?: string;
    toolCount: number;
    /** Content hash of the exact catalog the model was shown. */
    catalogHash: string;
  };
  model: {
    name: string;
    temperature: number | null;
  };
  harness: {
    mcpgradeVersion: string | null;
    promptVersion: number;
    promptHash: string;
    serializerVersion: number;
  };
  taskPolicy: {
    catalogPolicy: string;
    tasksPerTool: number;
    distractors: number;
    seed: number | null;
  };
  runAt: string;
}

export interface EvalReport {
  model: string;
  envFingerprint: EnvFingerprint;
  taskCount: number;
  selectionAccuracy: number; // 0-1 over all tasks
  refusalCorrectness: number; // 0-1 over distractor tasks
  argValidity: number; // 0-1 over tasks with args
  confusions: ConfusionPair[];
  perTool: Record<string, { total: number; correct: number }>;
  results: TaskResult[];
}

/** Minimal LLM client abstraction so the harness is model-agnostic. */
export interface ModelClient {
  name: string;
  /** Sampling temperature actually sent to the provider (null = provider default). */
  temperature?: number | null;
  /** Returns the assistant's raw text for a single-turn prompt. */
  complete(system: string, user: string): Promise<string>;
  /** Cumulative token usage, when the provider reports it. */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface EvalOptions {
  client: ModelClient;
  tasksPerTool: number; // direct+paraphrase tasks per tool
  distractors: number; // catalog-level distractor tasks
  seed?: number;
}

export type TaskSynthesizer = (
  tools: ToolDef[],
  opts: EvalOptions,
) => Promise<EvalTask[]>;
