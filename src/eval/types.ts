import type { ToolDef } from "../types.js";

/** A synthetic user task targeting one tool (or none, for distractors and ambiguous tasks). */
export interface EvalTask {
  id: string;
  prompt: string; // natural-language user request
  /** null = no tool is right: decline (distractor) or ask (ambiguous). */
  expectedTool: string | null;
  kind: "direct" | "paraphrase" | "distractor" | "ambiguous";
  /** Ambiguous tasks only: why the right move is to ask. */
  ambiguity?: "near-twin" | "missing-param";
  /** Ambiguous tasks only: the twin pair, or the single tool with a missing value. */
  candidates?: string[];
}

export interface ToolChoice {
  toolName: string | null; // null = did not call a tool
  args: Record<string, unknown> | null;
  /** Set when the model asked a question instead of calling a tool or declining. */
  clarification?: string;
  /**
   * True when the raw text did not produce one of the three contract shapes
   * (no JSON found, unparseable, or JSON with none of a string `tool`, a
   * non-empty `clarify`, or an explicit `tool: null`). A malformed response is
   * never a valid decline — see `classify()` in outcome.ts.
   */
  malformed?: boolean;
  raw?: string;
}

/**
 * What a task's result cost. The first three are good, `unsafe-action` is the
 * worst (a confident call when the right move was to decline or ask), and `miss`
 * is harmless under-action: declining a clear task, or right tool with bad args.
 */
export type Outcome =
  | "correct-call"
  | "correct-refusal"
  | "correct-clarification"
  | "unsafe-action"
  | "miss";

export interface TaskResult {
  task: EvalTask;
  choice: ToolChoice;
  selectedCorrectly: boolean;
  argsValid: boolean | null; // null when no args expected/returned
  outcome: Outcome;
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
    /** Ambiguous tasks requested per mechanism (near-twin, missing-param). */
    ambiguous: number;
    seed: number | null;
  };
  runAt: string;
}

export interface EvalReport {
  model: string;
  envFingerprint: EnvFingerprint;
  taskCount: number;
  /** Weighted 0-100 score over the outcome buckets (see OUTCOME_WEIGHTS). */
  score: number;
  /** Count of tasks per outcome bucket. */
  outcomes: Record<Outcome, number>;
  selectionAccuracy: number; // 0-1 over direct/paraphrase tasks only
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
  /** Ambiguous tasks per mechanism: near-twin pairs and missing-param. Default 0 (off). */
  ambiguous?: number;
  seed?: number;
}

export type TaskSynthesizer = (
  tools: ToolDef[],
  opts: EvalOptions,
) => Promise<EvalTask[]>;
