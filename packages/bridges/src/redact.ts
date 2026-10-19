// Removes secrets from text before it is logged or shown. The per-run MCP token is the one secret we create.

/** Replace every occurrence of each secret (6 or more characters; shorter values would match ordinary text) with `[redacted]`. */
export function redactSecrets(text: string, secrets: Iterable<string>): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 6) out = out.split(secret).join("[redacted]");
  }
  return out;
}
