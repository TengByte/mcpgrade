/** Token counting with gpt-tokenizer, falling back to a chars/4 estimate. */
let encodeFn: ((s: string) => number[]) | null = null;

async function loadEncoder(): Promise<void> {
  if (encodeFn) return;
  try {
    const mod = await import("gpt-tokenizer");
    encodeFn = mod.encode;
  } catch {
    encodeFn = null;
  }
}

export async function countTokens(text: string): Promise<number> {
  await loadEncoder();
  if (encodeFn) {
    try {
      return encodeFn(text).length;
    } catch {
      /* fall through */
    }
  }
  return Math.ceil(text.length / 4);
}

export async function countToolTokens(tool: unknown): Promise<number> {
  return countTokens(JSON.stringify(tool));
}
