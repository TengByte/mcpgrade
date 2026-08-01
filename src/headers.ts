/**
 * Parses `--header "Name: Value"` occurrences plus the MCPGRADE_HEADERS env var
 * (semicolon-separated) into a header map.
 *
 * Header values routinely carry bearer tokens, so they are only ever passed to
 * the transport — never written to the snapshot, the report, or the eval
 * fingerprint. MCP serve mode does not accept headers at all: there, the target
 * is chosen by a model, and a model should not be handing out credentials.
 */
export function parseHeaders(flags?: string[]): Record<string, string> | undefined {
  const raw = [
    ...(process.env.MCPGRADE_HEADERS?.split(";") ?? []),
    ...(flags ?? []),
  ]
    .map((h) => h.trim())
    .filter(Boolean);
  if (!raw.length) return undefined;
  const headers: Record<string, string> = {};
  for (const entry of raw) {
    const i = entry.indexOf(":");
    if (i <= 0) {
      throw new Error(`Bad header "${entry}". Expected "Name: Value".`);
    }
    headers[entry.slice(0, i).trim()] = entry.slice(i + 1).trim();
  }
  return headers;
}
