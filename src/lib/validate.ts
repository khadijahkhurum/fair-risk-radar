// A strict request-body boundary.
//
// Audit findings S11/E1: validation was hand-rolled per route, so unknown keys
// passed through untouched and every check was one someone remembered to
// write. The checks nobody thought of (M5 duplicate threat IDs, M6 out-of-range
// and string-coerced numbers) were simply absent.
//
// The rules this enforces, which the old per-route checks did not:
//   * unknown keys are REJECTED, not ignored
//   * numbers must be finite and in range — rejected, never silently clamped
//   * arrays can be deduplicated and capped
//   * every failure reports a path, so the caller learns what was wrong
//
// ponytail: ~120 lines instead of a zod dependency, because this is the whole
// surface the API has. Swap in zod if the schema surface grows past a dozen
// routes or starts needing transforms/refinements — the Check shape below is
// deliberately zod-compatible so the call sites would not change.

export type Result<T> = { ok: true; value: T } | { ok: false; issues: string[] };

export interface Check<T> {
  parse(v: unknown, path: string): Result<T>;
  /** set on checks produced by optional(); object() uses it to allow absence */
  isOptional?: boolean;
}

export type Infer<C> = C extends Check<infer T> ? T : never;

const fail = (path: string, msg: string): Result<never> => ({ ok: false, issues: [`${path}: ${msg}`] });

export function str(opts: { min?: number; max?: number } = {}): Check<string> {
  return {
    parse(v, path) {
      if (typeof v !== "string") return fail(path, "must be a string");
      const s = v.trim();
      if (opts.min !== undefined && s.length < opts.min) return fail(path, `must be at least ${opts.min} characters`);
      if (opts.max !== undefined && s.length > opts.max) return fail(path, `must be at most ${opts.max} characters`);
      return { ok: true, value: s };
    },
  };
}

// Numbers are REJECTED when out of range, never clamped. Silently substituting
// a value the caller did not ask for is how wrong numbers reach board packs
// (M6) — a string where a percentage belongs previously produced a confident
// simulation at an assumed 0% coverage.
export function num(opts: { min?: number; max?: number; int?: boolean } = {}): Check<number> {
  return {
    parse(v, path) {
      if (typeof v !== "number" || !Number.isFinite(v)) return fail(path, "must be a finite number");
      if (opts.int && !Number.isInteger(v)) return fail(path, "must be an integer");
      if (opts.min !== undefined && v < opts.min) return fail(path, `must be >= ${opts.min}`);
      if (opts.max !== undefined && v > opts.max) return fail(path, `must be <= ${opts.max}`);
      return { ok: true, value: v };
    },
  };
}

/**
 * Strict boolean. Notably NOT truthiness: "false", 0 and "" are rejected
 * rather than coerced, for the same reason num() rejects rather than clamps
 * (M6) — a flag the caller did not actually set should fail loudly, not
 * silently resolve to whichever value JavaScript finds convenient.
 */
export function bool(): Check<boolean> {
  return {
    parse(v, path) {
      if (typeof v !== "boolean") return fail(path, "must be true or false");
      return { ok: true, value: v };
    },
  };
}

export function oneOf<const T extends readonly string[]>(allowed: T): Check<T[number]> {
  return {
    parse(v, path) {
      if (typeof v !== "string" || !allowed.includes(v)) return fail(path, `must be one of ${allowed.join(", ")}`);
      return { ok: true, value: v as T[number] };
    },
  };
}

/** Membership against a known catalogue — unknown IDs are rejected by name. */
export function idIn(known: ReadonlySet<string>, label: string): Check<string> {
  return {
    parse(v, path) {
      if (typeof v !== "string") return fail(path, "must be a string");
      if (!known.has(v)) return fail(path, `unknown ${label} "${v.slice(0, 64)}"`);
      return { ok: true, value: v };
    },
  };
}

// Deduplication and the cardinality cap are the M5 fix: 200 copies of one
// threat ID were instantiated as 200 independent threat communities, producing
// a $3.2bn "assessment". The engine was right; the input should never have
// been accepted.
export function arrayOf<T>(item: Check<T>, opts: { max: number; unique?: boolean } = { max: 64 }): Check<T[]> {
  return {
    parse(v, path) {
      if (!Array.isArray(v)) return fail(path, "must be an array");
      if (v.length > opts.max) return fail(path, `must contain at most ${opts.max} items`);
      const issues: string[] = [];
      const out: T[] = [];
      const seen = new Set<unknown>();
      v.forEach((raw, i) => {
        const r = item.parse(raw, `${path}[${i}]`);
        if (!r.ok) {
          issues.push(...r.issues);
          return;
        }
        if (opts.unique !== false) {
          if (seen.has(r.value)) return; // drop the duplicate rather than 400
          seen.add(r.value);
        }
        out.push(r.value);
      });
      return issues.length > 0 ? { ok: false, issues } : { ok: true, value: out };
    },
  };
}

export function nullable<T>(inner: Check<T>): Check<T | null> {
  return {
    parse: (v, path) => (v === null ? { ok: true, value: null } : inner.parse(v, path)),
  };
}

export function optional<T>(inner: Check<T>): Check<T | undefined> {
  return {
    isOptional: true,
    parse: (v, path) => (v === undefined ? { ok: true, value: undefined } : inner.parse(v, path)),
  };
}

export function withDefault<T>(inner: Check<T>, fallback: T): Check<T> {
  return {
    isOptional: true,
    parse: (v, path) => (v === undefined ? { ok: true, value: fallback } : inner.parse(v, path)),
  };
}

/** Strict object: any key not in the shape is an error, not an ignored extra. */
export function object<S extends Record<string, Check<unknown>>>(
  shape: S
): Check<{ [K in keyof S]: Infer<S[K]> }> {
  return {
    parse(v, path) {
      if (typeof v !== "object" || v === null || Array.isArray(v)) return fail(path || "body", "must be an object");
      const input = v as Record<string, unknown>;
      const issues: string[] = [];
      const out: Record<string, unknown> = {};

      for (const key of Object.keys(input)) {
        if (!Object.prototype.hasOwnProperty.call(shape, key)) {
          issues.push(`${path ? `${path}.` : ""}${key}: unexpected field`);
        }
      }
      for (const key of Object.keys(shape)) {
        const check = shape[key];
        const childPath = path ? `${path}.${key}` : key;
        const raw = input[key];
        if (raw === undefined && !check.isOptional) {
          issues.push(`${childPath}: required`);
          continue;
        }
        const r = check.parse(raw, childPath);
        if (!r.ok) issues.push(...r.issues);
        else if (r.value !== undefined) out[key] = r.value;
      }
      return issues.length > 0
        ? { ok: false, issues }
        : { ok: true, value: out as { [K in keyof S]: Infer<S[K]> } };
    },
  };
}
