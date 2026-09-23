// Sliding-window rate limiting for compute-heavy endpoints (audit S7).
//
// The finding: ten concurrent 4,000-trial Monte Carlo requests, all served, no
// throttling — and the what-if panel firing 1 + N of them per 400ms of slider
// drag. On a metered serverless platform that is a bill, not just a load
// curve.
//
// The auditor's fix was Upstash/Vercel KV. This is in-process instead, and the
// trade is deliberate: a KV-backed limiter means a new dependency, an external
// service, an account and two environment variables, all of which have to be
// right or the app fails to deploy. An in-process limiter is zero of those and
// stops the thing actually demonstrated — a burst from one client, which lands
// on one warm instance because that is how connection reuse works.
//
// ponytail: per-instance counters, so the effective global limit is
// limit × instances, and a scale-out or a cold start resets the window.
// Swap the store for Upstash/Vercel KV when the limit has to hold across
// instances — the interface below is deliberately the same shape.
//
// The window is a log of timestamps rather than a counter because a fixed
// counter lets a caller fire 2× the limit across a window boundary, which is
// precisely the burst this exists to stop.

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the oldest request ages out; 0 when allowed. */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
  /** Test seam — nothing in the app calls this. */
  size(): number;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  /** Bound on distinct keys held, so a spray of keys cannot grow the map without end. */
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    for (const [key, times] of hits) {
      const live = times.filter((t) => now - t < windowMs);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
    // Dropping expired keys is not a bound: a spray of DISTINCT keys that are
    // all still inside the window prunes nothing and grows the map without
    // end — which is the resource-exhaustion vector this module exists to
    // reduce. So once expiry has done what it can, evict least-recently-seen
    // keys until the cap actually holds.
    //
    // ponytail: evicting a live key resets that key's budget, so a spray could
    // in principle evict its own limit. Keys here are authenticated user IDs,
    // so that costs an attacker one valid session per key — a far higher bar
    // than the memory growth it replaces. A KV-backed store removes the
    // trade entirely.
    if (hits.size <= maxKeys) return;
    const byRecency = [...hits.entries()].sort(
      (a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1]
    );
    for (const [key] of byRecency.slice(0, hits.size - maxKeys)) hits.delete(key);
  }

  return {
    check(key, now = Date.now()) {
      // Sweeping only at the cap keeps the common path O(window) rather than
      // O(keys). Between sweeps the map may briefly exceed maxKeys by one.
      if (hits.size >= maxKeys) prune(now);

      const times = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (times.length >= limit) {
        const oldest = times[0];
        hits.set(key, times);
        return {
          allowed: false,
          remaining: 0,
          // Ceil, so a client that obeys the header never returns too early
          // and burns another rejection.
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
        };
      }
      times.push(now);
      hits.set(key, times);
      return { allowed: true, remaining: limit - times.length, retryAfterSeconds: 0 };
    },
    size() {
      return hits.size;
    },
  };
}

// Tuned against what the UI legitimately does. The what-if panel debounces at
// 400ms and now sends ONE batched request per tick (it used to send 1 + N), so
// sustained dragging is ~2.5 req/s; 60 per 30s leaves headroom for that plus
// the ceiling check, while the burst of ten the auditor fired lands well
// inside it and a scripted loop does not.
export const whatIfLimiter = createRateLimiter({ limit: 60, windowMs: 30_000 });

// Persisting an assessment is a deliberate, human-paced act that writes a row
// and an audit event. Nothing legitimate does it ten times a minute.
export const assessmentLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
