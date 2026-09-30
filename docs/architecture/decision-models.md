# Decision Models

## Purpose

`@startup/decision` answers bounded questions about content: classification, routing, scoring, gating, and yes/no decisions, each with probabilities that let the application branch on how certain the answer is.

It is not a generative model layer. It does not produce prose, chat replies, code, explanations, or arbitrary structured output.

## Choosing a Mechanism

| Decision                                                           | Use                            |
| ------------------------------------------------------------------ | ------------------------------ |
| Expressible reliably in code (a status check, a threshold, a rule) | deterministic application code |
| Fuzzy but bounded: a fixed set of answers or an ordered rubric     | `@startup/decision`            |
| Open-ended: reasoning, prose, code, explanations, free-form output | a generative model             |

Generative models reason and generate open-ended output. Decision (System One) models classify, route, score, and gate, and return a probability or a distribution instead of text.

## Provider

The implementation is TypeSafe's System One API (`POST /v1/systemone`, `GET /v1/models`), called with the global `fetch`. The package follows TypeSafe's published OpenAPI schema at <https://api.typesafe.ai/openapi.json>. It was written against API version 0.2.0.

The TypeSafe model family is Jev. It is currently early access, so it is isolated behind the package:

- Application code depends on `@startup/decision`, a semantic capability, rather than on TypeSafe. Only `@startup/decision` calls the TypeSafe API.
- Question and answer shapes follow the API (`noul`, `choice`, `score`). Usage and model metadata are exposed in camelCase.
- Replacing or supplementing the provider is a change inside the package.

The package does not add workflows, agents, routing frameworks, or provider registries. Products compose decisions in their own code.

## Questions and Answers

One request sends one `state` (a string, object, or array) and one or more named questions. Question types can be mixed. Answers use the question names, and each answer's type matches its question's type, including in TypeScript.

| Question | Asks                                        | Answer                                                                     |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `noul`   | a yes/no question or a true/false statement | `noul`: probability of yes or true                                         |
| `choice` | pick one of named choices (`criteria`)      | `choice`, `confidence`, `probabilities` per choice                         |
| `score`  | rate against an ordered rubric (`criteria`) | `score` (expected level, may fall between levels), `confidence`, `legend`, `probabilities` per level |

The client validates requests before sending and validates every response at runtime. A response is rejected when an asked question has no answer, an answer's type differs from its question's type, a probability falls outside 0 to 1, or a choice answer names a choice that was not offered.

## Uncertainty

Answers are probabilistic estimates. A high probability or confidence is not a guarantee that the answer is correct.

Products decide how to act on each answer:

- **High confidence:** the application may act automatically, if product policy allows it for that decision.
- **Intermediate confidence:** product-specific handling.
- **Low confidence:** fall back to human review, a generative model, or a deterministic rule.

The template defines no confidence thresholds. Thresholds depend on the decision, its cost of error, and observed accuracy, so they belong in the product code that owns the decision.

## Configuration

| Variable           | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `TYPESAFE_API_KEY` | TypeSafe API key. Secret.                              |
| `TYPESAFE_MODEL`   | Model name or alias sent with every evaluation request |

Both are server-only, validated by `@startup/env`, and optional. The template installs, builds, runs, and passes verification without them. Calling the client without a value it needs raises `DecisionConfigurationError`, which names the variable but never its value. Both can also be passed to `createDecisionClient` directly, and a request may override the model.

The model is configuration: the package hard-codes no model name. `listModels()` returns the names available to the API key. Evaluations do not call it.

Neither variable is read at build time, so neither is listed in `turbo.json`.

## Failures

Every error extends `DecisionError`. Messages never contain the API key, request headers, request state, or provider response bodies.

| Error                         | Cause                                                                     |
| ----------------------------- | ------------------------------------------------------------------------- |
| `DecisionConfigurationError`  | a required variable is not set                                            |
| `DecisionValidationError`     | the request is invalid: rejected locally (`status` undefined) or by TypeSafe (`422`), with `issues` |
| `DecisionAuthenticationError` | `401` or `403`                                                            |
| `DecisionRateLimitError`      | `429`, with `retryAfterSeconds` when TypeSafe sends `Retry-After`         |
| `DecisionTimeoutError`        | no response within `timeoutMs` (default 10 seconds)                       |
| `DecisionProviderError`       | `reason` is `network`, `status` (other statuses, including `5xx`), or `invalid_response` |

The client does not retry. Whether a failure is worth retrying, and when to fall back, is product policy. Caller cancellation through `signal` rejects with the signal's reason.

## Testing

Automated tests never call TypeSafe. They inject a fake `fetch`, replace the global `fetch` with one that fails the test, and run with both variables empty (`packages/decision/vitest.config.ts`).
