import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { clientEnv } from "@startup/env/client";

import {
  createDecisionClient,
  DecisionAuthenticationError,
  DecisionConfigurationError,
  DecisionError,
  DecisionProviderError,
  DecisionRateLimitError,
  DecisionTimeoutError,
  DecisionValidationError,
  type ChoiceAnswer,
  type NoulAnswer,
  type ScoreAnswer,
} from "./index";

// Deterministic fixtures. Nothing here reaches TypeSafe: every client gets a
// fake fetch, and the global fetch fails the test if anything falls through.

const API_KEY = "test-typesafe-key-must-never-leak";
const MODEL = "test-model";

const questions = {
  relevant: {
    type: "noul",
    instructions: "Is this file important for understanding authentication?",
  },
  category: {
    type: "choice",
    instructions: "What role does this file primarily serve?",
    criteria: {
      implementation: "Application implementation",
      configuration: "Configuration",
      test: "Test code",
    },
  },
  importance: {
    type: "score",
    instructions: "How important is this file for onboarding?",
    criteria: ["Not useful", "Useful", "Very important"],
  },
} as const;

const state = {
  path: "packages/auth/src/index.ts",
  description: "Better Auth server configuration",
};

const evaluation = {
  model: "test-model-2026-09-15",
  answers: {
    relevant: { type: "noul", noul: 0.93 },
    category: {
      type: "choice",
      choice: "configuration",
      confidence: 0.81,
      probabilities: { implementation: 0.15, configuration: 0.81, test: 0.04 },
    },
    importance: {
      type: "score",
      score: 1.7,
      confidence: 0.64,
      legend: { "0": "Not useful", "1": "Useful", "2": "Very important" },
      probabilities: { "0": 0.05, "1": 0.2, "2": 0.75 },
    },
  },
  usage: { input_tokens: 120, output_tokens: 12 },
};

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function respondWith(response: Response | (() => Response)) {
  return vi.fn<typeof fetch>(async () =>
    typeof response === "function" ? response() : response,
  );
}

function configuredClient(fetch: typeof globalThis.fetch, timeoutMs?: number) {
  return createDecisionClient({ apiKey: API_KEY, model: MODEL, fetch, timeoutMs });
}

function evaluateWith(response: Response) {
  return configuredClient(respondWith(response)).evaluate({ state, questions });
}

/** Rejection of a promise, for asserting on the error itself. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject.");
}

function lastRequest(fetch: ReturnType<typeof respondWith>) {
  const [url, init] = fetch.mock.lastCall ?? [];
  return {
    url,
    method: init?.method,
    headers: new Headers(init?.headers),
    body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Tests must not use the real fetch.");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("configuration", () => {
  it("creates a client without any configuration", () => {
    expect(() => createDecisionClient()).not.toThrow();
  });

  it("requires TYPESAFE_API_KEY before sending anything", async () => {
    const fetch = respondWith(json(evaluation));
    const client = createDecisionClient({ model: MODEL, fetch });

    const error = await rejectionOf(client.evaluate({ state, questions }));

    expect(error).toBeInstanceOf(DecisionConfigurationError);
    expect(error).toMatchObject({
      variable: "TYPESAFE_API_KEY",
      message: "Decision model is not configured: TYPESAFE_API_KEY is not set.",
    });
    await expect(client.listModels()).rejects.toThrow(DecisionConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires TYPESAFE_MODEL to evaluate, naming the variable but no value", async () => {
    const fetch = respondWith(json(evaluation));
    const client = createDecisionClient({ apiKey: API_KEY, fetch });

    const error = await rejectionOf(client.evaluate({ state, questions }));

    expect(error).toBeInstanceOf(DecisionConfigurationError);
    expect(error).toMatchObject({
      variable: "TYPESAFE_MODEL",
      message: "Decision model is not configured: TYPESAFE_MODEL is not set.",
    });
    expect(String(error)).not.toContain(API_KEY);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not need a model to list models", async () => {
    const fetch = respondWith(json({ models: [] }));
    const client = createDecisionClient({ apiKey: API_KEY, fetch });

    await expect(client.listModels()).resolves.toEqual([]);
  });

  it("reads TYPESAFE_API_KEY and TYPESAFE_MODEL from the server environment", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", API_KEY);
    vi.stubEnv("TYPESAFE_MODEL", MODEL);
    vi.resetModules();
    const { createDecisionClient: createFromEnv } = await import("./client");
    const fetch = respondWith(json(evaluation));

    await createFromEnv({ fetch }).evaluate({ state, questions });

    const request = lastRequest(fetch);
    expect(request.headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
    expect(request.body).toMatchObject({ model: MODEL });
  });

  it("rejects an invalid timeout", () => {
    expect(() => createDecisionClient({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => createDecisionClient({ timeoutMs: 1.5 })).toThrow(RangeError);
  });
});

describe("evaluate request", () => {
  it("posts the state, configured model, and questions as authenticated JSON", async () => {
    const fetch = respondWith(json(evaluation));

    await configuredClient(fetch).evaluate({ state, questions });

    expect(fetch).toHaveBeenCalledOnce();
    const request = lastRequest(fetch);
    expect(request.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(request.method).toBe("POST");
    expect(request.headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.body).toEqual({ state, model: MODEL, questions });
  });

  it("sends each question type on its own", async () => {
    const cases = [
      [{ type: "noul", instructions: "Is this about billing?" }, evaluation.answers.relevant],
      [questions.category, evaluation.answers.category],
      [questions.importance, evaluation.answers.importance],
    ] as const;

    for (const [question, answer] of cases) {
      const fetch = respondWith(
        json({ ...evaluation, answers: { only: answer } }),
      );

      const result = await configuredClient(fetch).evaluate({
        state: "Please refund the duplicate charge.",
        questions: { only: question },
      });

      expect(lastRequest(fetch).body).toMatchObject({
        state: "Please refund the duplicate charge.",
        questions: { only: question },
      });
      expect(result.answers.only).toEqual(answer);
    }
  });

  it("sends noul criteria and lets a request override the model", async () => {
    const fetch = respondWith(json({ ...evaluation, answers: { spam: { type: "noul", noul: 0.1 } } }));
    const spam = {
      type: "noul",
      instructions: "This message contains unsolicited advertising.",
      criteria: { true: "Unsolicited advertising", false: "A legitimate conversation" },
    } as const;

    await configuredClient(fetch).evaluate({
      state: ["first message", "second message"],
      questions: { spam },
      model: "pinned-model",
    });

    expect(lastRequest(fetch).body).toEqual({
      state: ["first message", "second message"],
      model: "pinned-model",
      questions: { spam },
    });
  });

  it.each([
    ["no questions", { state, questions: {} }, []],
    [
      "an unknown question type",
      { state, questions: { tone: { type: "sentiment" } } },
      ["questions", "tone", "type"],
    ],
    [
      "a choice question without choices",
      { state, questions: { tone: { type: "choice", criteria: {} } } },
      ["questions", "tone", "criteria"],
    ],
    [
      "a score question without levels",
      { state, questions: { urgency: { type: "score", criteria: [] } } },
      ["questions", "urgency", "criteria"],
    ],
    ["missing state", { questions }, ["state"]],
  ])("rejects %s locally without sending", async (_, request, path) => {
    const fetch = respondWith(json(evaluation));

    const error = await rejectionOf(
      // Deliberately invalid input, as untyped callers could send.
      configuredClient(fetch).evaluate(request as never),
    );

    expect(error).toBeInstanceOf(DecisionValidationError);
    expect(error).toMatchObject({ status: undefined });
    expect((error as DecisionValidationError).issues[0]?.path).toEqual(
      path.length ? path : ["questions"],
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("evaluate response", () => {
  it("returns typed answers for mixed question types, with model and usage", async () => {
    const result = await evaluateWith(json(evaluation));

    expect(result).toEqual({
      model: "test-model-2026-09-15",
      answers: evaluation.answers,
      usage: { inputTokens: 120, outputTokens: 12 },
    });

    expectTypeOf(result.answers.relevant).toEqualTypeOf<NoulAnswer>();
    expectTypeOf(result.answers.category).toEqualTypeOf<
      ChoiceAnswer<"implementation" | "configuration" | "test">
    >();
    expectTypeOf(result.answers.importance).toEqualTypeOf<ScoreAnswer>();
  });

  it("ignores unknown fields and answers to questions that were not asked", async () => {
    const result = await evaluateWith(
      json({
        ...evaluation,
        answers: { ...evaluation.answers, unasked: { type: "noul", noul: 1 } },
        request_id: "abc",
      }),
    );

    expect(Object.keys(result.answers)).toEqual(["relevant", "category", "importance"]);
    expect(result).not.toHaveProperty("request_id");
  });

  it.each([
    ["a body that is not JSON", () => new Response("<html>oops</html>", { status: 200 })],
    ["a missing usage", () => json({ model: MODEL, answers: evaluation.answers })],
    [
      "a missing answer",
      () => json({ ...evaluation, answers: { relevant: evaluation.answers.relevant } }),
    ],
    [
      "an answer of the wrong type",
      () =>
        json({
          ...evaluation,
          answers: { ...evaluation.answers, relevant: evaluation.answers.category },
        }),
    ],
    [
      "a probability outside 0 to 1",
      () =>
        json({
          ...evaluation,
          answers: { ...evaluation.answers, relevant: { type: "noul", noul: 1.4 } },
        }),
    ],
    [
      "a choice that was not offered",
      () =>
        json({
          ...evaluation,
          answers: {
            ...evaluation.answers,
            category: { ...evaluation.answers.category, choice: "documentation" },
          },
        }),
    ],
  ])("rejects %s as an invalid response", async (_, response) => {
    const error = await rejectionOf(evaluateWith(response()));

    expect(error).toBeInstanceOf(DecisionProviderError);
    expect(error).toMatchObject({ reason: "invalid_response" });
  });
});

describe("evaluate errors", () => {
  it.each([401, 403] as const)("maps %i to an authentication error", async (status) => {
    const error = await rejectionOf(
      evaluateWith(json({ detail: "Invalid API key" }, { status })),
    );

    expect(error).toBeInstanceOf(DecisionAuthenticationError);
    expect(error).toMatchObject({ status });
  });

  it("maps 422 to a validation error with safe issue details", async () => {
    const error = await rejectionOf(
      evaluateWith(
        json(
          {
            detail: [
              {
                loc: ["body", "questions", "importance", "score", "criteria"],
                msg: "List should have at least 1 item after validation, not 0",
                type: "too_short",
                input: { secret: "state-content-that-must-not-leak" },
                ctx: { min_length: 1 },
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );

    expect(error).toBeInstanceOf(DecisionValidationError);
    expect(error).toMatchObject({
      status: 422,
      message:
        "TypeSafe rejected the request: questions.importance.score.criteria: List should have at least 1 item after validation, not 0",
      issues: [
        {
          path: ["questions", "importance", "score", "criteria"],
          message: "List should have at least 1 item after validation, not 0",
        },
      ],
    });
    expect(JSON.stringify(error)).not.toContain("state-content-that-must-not-leak");
  });

  it("maps a 422 with an unexpected body to a validation error without issues", async () => {
    const error = await rejectionOf(
      evaluateWith(new Response("not json", { status: 422 })),
    );

    expect(error).toBeInstanceOf(DecisionValidationError);
    expect(error).toMatchObject({ status: 422, issues: [] });
  });

  it("maps 429 to a rate-limit error with Retry-After", async () => {
    const limited = await rejectionOf(
      evaluateWith(json({}, { status: 429, headers: { "Retry-After": "30" } })),
    );
    const unspecified = await rejectionOf(evaluateWith(json({}, { status: 429 })));

    expect(limited).toBeInstanceOf(DecisionRateLimitError);
    expect(limited).toMatchObject({ status: 429, retryAfterSeconds: 30 });
    expect(unspecified).toMatchObject({ retryAfterSeconds: undefined });
  });

  it.each([500, 502, 503, 404])("maps %i to a provider error", async (status) => {
    const error = await rejectionOf(
      evaluateWith(new Response("upstream details", { status })),
    );

    expect(error).toBeInstanceOf(DecisionProviderError);
    expect(error).toMatchObject({
      reason: "status",
      status,
      message: `TypeSafe request failed (HTTP ${status}).`,
    });
  });

  it("maps a network failure to a provider error with a safe code", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      });
    });

    const error = await rejectionOf(
      configuredClient(fetch).evaluate({ state, questions }),
    );

    expect(error).toBeInstanceOf(DecisionProviderError);
    expect(error).toMatchObject({
      reason: "network",
      status: undefined,
      message: "Could not reach TypeSafe (ECONNREFUSED).",
    });
  });

  it("distinguishes a timeout from a provider failure", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    const error = await rejectionOf(
      configuredClient(fetch, 20).evaluate({ state, questions }),
    );

    expect(error).toBeInstanceOf(DecisionTimeoutError);
    expect(error).not.toBeInstanceOf(DecisionProviderError);
    expect(error).toMatchObject({ timeoutMs: 20 });
  });

  it("rejects with the caller's reason when the caller cancels", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const controller = new AbortController();
    const reason = new Error("client disconnected");

    const pending = configuredClient(fetch).evaluate({
      state,
      questions,
      signal: controller.signal,
    });
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });

  it("does not retry failed requests", async () => {
    const fetch = respondWith(() => json({}, { status: 503 }));

    await expect(configuredClient(fetch).evaluate({ state, questions })).rejects.toThrow(
      DecisionProviderError,
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("listModels", () => {
  it("gets the models available to the API key", async () => {
    const fetch = respondWith(
      json({
        models: [
          {
            name: "test-model",
            description: "General-purpose system one model.",
            release_date: "2026-09-15",
          },
        ],
      }),
    );

    const models = await configuredClient(fetch).listModels();

    const request = lastRequest(fetch);
    expect(request.url).toBe("https://api.typesafe.ai/v1/models");
    expect(request.method).toBe("GET");
    expect(request.headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
    expect(request.body).toBeUndefined();
    expect(models).toEqual([
      {
        name: "test-model",
        description: "General-purpose system one model.",
        releaseDate: "2026-09-15",
      },
    ]);
  });

  it("rejects an unexpected model list", async () => {
    const fetch = respondWith(json({ data: [{ id: "test-model" }] }));

    await expect(configuredClient(fetch).listModels()).rejects.toMatchObject({
      name: "DecisionProviderError",
      reason: "invalid_response",
    });
  });

  it("maps errors like evaluate does", async () => {
    await expect(
      configuredClient(respondWith(json({}, { status: 401 }))).listModels(),
    ).rejects.toThrow(DecisionAuthenticationError);
    await expect(
      configuredClient(respondWith(json({}, { status: 500 }))).listModels(),
    ).rejects.toThrow(DecisionProviderError);
  });
});

describe("secret handling", () => {
  it("never includes the API key in errors", async () => {
    const failures: Array<() => Response> = [
      () => json({ detail: `bad key ${API_KEY}` }, { status: 401 }),
      () => json({ detail: [{ loc: ["body"], msg: "invalid", type: "x", input: API_KEY }] }, { status: 422 }),
      () => json({ error: API_KEY }, { status: 429 }),
      () => new Response(`trace with Bearer ${API_KEY}`, { status: 500 }),
      () => json({ model: API_KEY }),
      () => new Response(`Bearer ${API_KEY}`, { status: 200 }),
    ];

    const errors = await Promise.all(
      failures.map((failure) => rejectionOf(evaluateWith(failure()))),
    );

    // Node's fetch quotes header values when it rejects them.
    const invalidHeader = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError(`Headers.append: "Bearer ${API_KEY}" is an invalid header value.`);
    });
    errors.push(
      await rejectionOf(configuredClient(invalidHeader).evaluate({ state, questions })),
    );

    for (const error of errors) {
      expect(error).toBeInstanceOf(DecisionError);
      const serialized = [
        String(error),
        (error as Error).stack,
        JSON.stringify(error),
        JSON.stringify((error as { cause?: unknown }).cause ?? null),
      ].join("\n");
      expect(serialized).not.toContain(API_KEY);
    }
  });

  it("does not expose the API key on the client", () => {
    const client = configuredClient(respondWith(json(evaluation)));

    expect(JSON.stringify(client)).not.toContain(API_KEY);
    expect(Object.values(client).map(String).join("")).not.toContain(API_KEY);
  });

  it("keeps TypeSafe configuration out of the browser environment", () => {
    expect(Object.keys(clientEnv).filter((name) => name.includes("TYPESAFE"))).toEqual([]);
  });
});
