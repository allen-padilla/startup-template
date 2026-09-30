import { serverEnv } from "@startup/env";

import {
  DecisionAuthenticationError,
  DecisionConfigurationError,
  DecisionProviderError,
  DecisionRateLimitError,
  DecisionTimeoutError,
  DecisionValidationError,
} from "./errors";
import type {
  DecisionModel,
  DecisionQuestions,
  DecisionRequest,
  DecisionResult,
} from "./types";
import {
  findRequestIssues,
  parseEvaluation,
  parseModelList,
  parseValidationIssues,
} from "./validation";

const API_URL = "https://api.typesafe.ai";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface DecisionClientOptions {
  /** TypeSafe API key. Defaults to `TYPESAFE_API_KEY`. */
  apiKey?: string;
  /** Model name or alias. Defaults to `TYPESAFE_MODEL`. */
  model?: string;
  /** Per-request timeout, including reading the response. Default 10 seconds. */
  timeoutMs?: number;
  /** HTTP transport. Defaults to the global `fetch`; tests inject a fake. */
  fetch?: typeof fetch;
}

export interface DecisionClient {
  /**
   * Answers bounded questions about `state` in one request. Answers are keyed
   * by question name, and each answer's type matches its question's type.
   */
  evaluate<const Questions extends DecisionQuestions>(
    request: DecisionRequest<Questions>,
  ): Promise<DecisionResult<Questions>>;

  /** Lists the models and aliases available to the API key. */
  listModels(options?: { signal?: AbortSignal }): Promise<DecisionModel[]>;
}

/**
 * Creates a server-only client for bounded decisions, backed by TypeSafe's
 * System One API. Creating a client never requires configuration; calling it
 * does. Failed requests are not retried.
 */
export function createDecisionClient(
  options: DecisionClientOptions = {},
): DecisionClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive integer.");
  }

  const transport = options.fetch ?? globalThis.fetch;

  // Read lazily so a client can be created where TypeSafe is not configured.
  const apiKey = () =>
    required("TYPESAFE_API_KEY", options.apiKey || serverEnv.TYPESAFE_API_KEY);

  async function send(
    path: string,
    init: { method: "GET" } | { method: "POST"; body: unknown },
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey()}`,
    };
    if (init.method === "POST") headers["Content-Type"] = "application/json";

    const timeout = AbortSignal.timeout(timeoutMs);
    const failure = (error: unknown, reason: "network" | "invalid_response") => {
      if (timeout.aborted) return new DecisionTimeoutError(timeoutMs);
      // Caller cancellation is not a provider failure: surface the caller's reason.
      if (signal?.aborted) return signal.reason;
      return reason === "network"
        ? new DecisionProviderError("network", networkMessage(error))
        : new DecisionProviderError(
            "invalid_response",
            "TypeSafe returned a response that is not valid JSON.",
          );
    };

    let response: Response;
    try {
      response = await transport(`${API_URL}${path}`, {
        method: init.method,
        headers,
        body: init.method === "POST" ? JSON.stringify(init.body) : undefined,
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });
    } catch (error) {
      throw failure(error, "network");
    }

    if (!response.ok) {
      throw await errorForStatus(response);
    }

    try {
      return await response.json();
    } catch (error) {
      throw failure(error, "invalid_response");
    }
  }

  return {
    async evaluate(request) {
      apiKey();
      const model = required(
        "TYPESAFE_MODEL",
        request.model || options.model || serverEnv.TYPESAFE_MODEL,
      );

      const issues = findRequestIssues(request);
      if (issues.length > 0) {
        throw new DecisionValidationError(undefined, issues);
      }

      const body = await send(
        "/v1/systemone",
        {
          method: "POST",
          body: { state: request.state, model, questions: request.questions },
        },
        request.signal,
      );

      const parsed = parseEvaluation(body, request.questions);
      if (!parsed.success) {
        throw invalidResponse(parsed.problem);
      }

      return {
        model: parsed.model,
        // parseEvaluation checked each answer's type against its question.
        answers: parsed.answers as DecisionResult<typeof request.questions>["answers"],
        usage: parsed.usage,
      };
    },

    async listModels({ signal } = {}) {
      const models = parseModelList(await send("/v1/models", { method: "GET" }, signal));
      if (!models) {
        throw invalidResponse("unexpected model list");
      }

      return models;
    },
  };
}

function required(variable: string, value: string | undefined): string {
  if (!value) {
    throw new DecisionConfigurationError(variable);
  }

  return value;
}

async function errorForStatus(response: Response): Promise<Error> {
  const { status } = response;

  if (status === 422) {
    const body: unknown = await response.json().catch(() => undefined);
    return new DecisionValidationError(422, parseValidationIssues(body));
  }

  // Other error bodies are never surfaced, so release the connection.
  await response.body?.cancel().catch(() => undefined);

  if (status === 401 || status === 403) {
    return new DecisionAuthenticationError(status);
  }
  if (status === 429) {
    return new DecisionRateLimitError(
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }

  return new DecisionProviderError(
    "status",
    `TypeSafe request failed (HTTP ${status}).`,
    status,
  );
}

function invalidResponse(problem: string): DecisionProviderError {
  return new DecisionProviderError(
    "invalid_response",
    `TypeSafe returned an unexpected response: ${problem}.`,
  );
}

// The original fetch error is not attached: its message can quote request
// header values, including the Authorization header. Only an errno-style code,
// such as ECONNREFUSED, is kept.
function networkMessage(error: unknown): string {
  const cause =
    error && typeof error === "object" && "cause" in error ? error.cause : undefined;
  const code =
    cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;

  return typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code)
    ? `Could not reach TypeSafe (${code}).`
    : "Could not reach TypeSafe.";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;

  if (/^\d+$/.test(value.trim())) return Number(value);

  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
