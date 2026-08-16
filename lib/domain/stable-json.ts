/**
 * Stable JSON serialization for deterministic content hashing.
 *
 * Object keys are sorted recursively and primitive values are encoded
 * without locale-dependent formatting, so two runs that pass the same
 * logical input produce the exact same string. This is the foundation
 * of the Orcflo step cache: a step result may only be replayed when
 * its content hash is identical, never on a fuzzy or time-based match.
 *
 * `undefined` values are encoded as the string `"__undefined__"` so a
 * caller that forgot a Zod parse still gets a *stable* (if surprising)
 * hash instead of a runtime throw.
 */
export function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
      return String(value);
    case 'undefined':
      return '"__undefined__"';
    case 'bigint':
      return `${value}n`;
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
      }
      const entries = Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
      return `{${entries.join(',')}}`;
    }
    default:
      return JSON.stringify(String(value));
  }
}
