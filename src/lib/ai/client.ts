// The model call. Everything that touches the network lives here, so the
// reasoning in evidence-review.ts stays pure and testable without a key.
//
// NO SDK. The Anthropic Messages API is one POST with a JSON body, and `fetch`
// is built into the runtime. Adding @anthropic-ai/sdk would mean a dependency,
// a version to keep current, and a supply-chain surface, in exchange for
// saving about fifteen lines. If this grows to need streaming, tool use or
// retries with backoff, take the SDK then.
//
// ponytail: no retry on 429/5xx. A failed review is an inconvenience the
// analyst can repeat by hand, not data loss, and a retry loop on a paid
// endpoint is a bill waiting to happen. Add bounded backoff if real usage
// shows transient failures actually matter.

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export type CompletionResult =
  | { ok: true; text: string; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; error: string; retryable: boolean };

export interface ModelProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/**
 * Pinned, not "latest". A model swap can change outputs, and this feature is
 * already the one non-reproducible thing in the product — floating the version
 * on top of that would mean nobody could ever say what produced a stored
 * finding. Changing this is a deliberate act that gets recorded on the review
 * rows it affects.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Beyond this the model is padding, and the cost is real money per call. */
const DEFAULT_MAX_TOKENS = 2000;

/** A hung request must not hold a serverless invocation open to its timeout. */
const REQUEST_TIMEOUT_MS = 45_000;

export function anthropicProvider(apiKey: string, model = DEFAULT_MODEL): ModelProvider {
  return {
    name: model,
    async complete({ system, user, maxTokens = DEFAULT_MAX_TOKENS }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          // The upstream body can echo request content, so it is logged rather
          // than returned to the browser.
          const detail = await res.text().catch(() => "");
          console.error("Anthropic request failed", res.status, detail.slice(0, 500));
          return {
            ok: false,
            error: `The analysis service returned ${res.status}.`,
            retryable: res.status === 429 || res.status >= 500,
          };
        }

        const data = (await res.json()) as {
          content?: { type: string; text?: string }[];
          model?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = (data.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("");

        if (!text) {
          return { ok: false, error: "The analysis service returned an empty response.", retryable: true };
        }

        return {
          ok: true,
          text,
          model: data.model ?? model,
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        };
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        console.error("Anthropic request errored", err);
        return {
          ok: false,
          error: aborted ? "The analysis timed out." : "Could not reach the analysis service.",
          retryable: true,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/**
 * Returns a scripted response. Exists so the whole path — route, verification,
 * storage, UI — is exercisable in tests and demoable with no key and no spend.
 *
 * It is NOT a stand-in for the real model in any claim about quality; it only
 * proves the plumbing and the controls around the model, which is exactly what
 * the controls need to be tested against anyway.
 */
export function mockProvider(text: string, name = "mock"): ModelProvider {
  return {
    name,
    async complete() {
      return { ok: true, text, model: name, inputTokens: 0, outputTokens: 0 };
    },
  };
}

/**
 * The provider for this deployment, or null when no key is configured.
 *
 * Null is a supported state, not an error: the rest of the product works
 * without this feature, and a missing key should surface as "analysis is not
 * configured" rather than as a 500.
 */
export function providerFromEnv(): ModelProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return anthropicProvider(key, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);
}
