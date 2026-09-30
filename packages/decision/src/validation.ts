import { z } from "zod";

import type { DecisionIssue } from "./errors";
import type {
  DecisionAnswer,
  DecisionModel,
  DecisionQuestions,
  DecisionUsage,
} from "./types";

// Validates what the client sends and what TypeSafe returns. Only the fields
// the package relies on are checked; unknown response fields are dropped.

const content = z.union([
  z.string(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

const instructions = content.nullish();

const questionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("noul"),
    instructions,
    criteria: z
      .object({ true: content.nullish(), false: content.nullish() })
      .nullish(),
  }),
  z.object({
    type: z.literal("choice"),
    instructions,
    criteria: z
      .record(z.string(), content.nullable())
      .refine((criteria) => Object.keys(criteria).length > 0, {
        message: "At least one choice is required",
      }),
  }),
  z.object({
    type: z.literal("score"),
    instructions,
    criteria: z.array(content).min(1, "At least one score level is required"),
  }),
]);

const requestSchema = z.object({
  state: content,
  questions: z
    .record(z.string(), questionSchema)
    .refine((questions) => Object.keys(questions).length > 0, {
      message: "At least one question is required",
    }),
});

/** Returns the problems with a request, or an empty list when it is valid. */
export function findRequestIssues(request: {
  state: unknown;
  questions: unknown;
}): DecisionIssue[] {
  const result = requestSchema.safeParse({
    state: request.state,
    questions: request.questions,
  });

  return result.success ? [] : toIssues(result.error);
}

const probability = z.number().min(0).max(1);

const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: probability }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: probability,
    probabilities: z.record(z.string(), probability),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    confidence: probability,
    legend: z.record(z.string(), z.unknown()),
    probabilities: z.record(z.string(), probability),
  }),
]);

const evaluationSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), z.unknown()),
  usage: z.object({
    input_tokens: z.int().nonnegative(),
    output_tokens: z.int().nonnegative(),
  }),
});

export type ParsedEvaluation =
  | {
      success: true;
      model: string;
      answers: Record<string, DecisionAnswer>;
      usage: DecisionUsage;
    }
  | { success: false; problem: string };

/**
 * Validates a POST /v1/systemone response against the questions that were
 * asked: every question needs an answer of the same type, and a choice answer
 * may only name the question's choices.
 */
export function parseEvaluation(
  body: unknown,
  questions: DecisionQuestions,
): ParsedEvaluation {
  const parsed = evaluationSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, problem: describe(parsed.error) };
  }

  const answers: Record<string, DecisionAnswer> = {};

  for (const [name, question] of Object.entries(questions)) {
    if (!Object.prototype.hasOwnProperty.call(parsed.data.answers, name)) {
      return { success: false, problem: `missing answer "${name}"` };
    }

    const answer = answerSchema.safeParse(parsed.data.answers[name]);
    if (!answer.success) {
      return {
        success: false,
        problem: `answer "${name}": ${describe(answer.error)}`,
      };
    }

    if (answer.data.type !== question.type) {
      return {
        success: false,
        problem: `answer "${name}" has type ${answer.data.type}, expected ${question.type}`,
      };
    }

    if (answer.data.type === "choice" && question.type === "choice") {
      const choices = Object.keys(question.criteria);
      const named = [answer.data.choice, ...Object.keys(answer.data.probabilities)];
      if (!named.every((choice) => choices.includes(choice))) {
        return {
          success: false,
          problem: `answer "${name}" names a choice that was not offered`,
        };
      }
    }

    answers[name] = answer.data;
  }

  return {
    success: true,
    model: parsed.data.model,
    answers,
    usage: {
      inputTokens: parsed.data.usage.input_tokens,
      outputTokens: parsed.data.usage.output_tokens,
    },
  };
}

const modelListSchema = z.object({
  models: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string(),
      release_date: z.string(),
    }),
  ),
});

/** Validates a GET /v1/models response. Returns `undefined` when invalid. */
export function parseModelList(body: unknown): DecisionModel[] | undefined {
  const parsed = modelListSchema.safeParse(body);
  if (!parsed.success) return undefined;

  return parsed.data.models.map((model) => ({
    name: model.name,
    description: model.description,
    releaseDate: model.release_date,
  }));
}

const validationErrorSchema = z.object({
  detail: z.array(
    z.object({
      loc: z.array(z.union([z.string(), z.int()])),
      msg: z.string(),
    }),
  ),
});

/**
 * Extracts the location and message of each `422` validation error. The
 * `input` and `ctx` fields are dropped because they can echo request state.
 */
export function parseValidationIssues(body: unknown): DecisionIssue[] {
  const parsed = validationErrorSchema.safeParse(body);
  if (!parsed.success) return [];

  return parsed.data.detail.map((issue) => ({
    // Drop the leading "body" location so paths match the request fields.
    path: issue.loc[0] === "body" ? issue.loc.slice(1) : issue.loc,
    message: issue.msg,
  }));
}

function toIssues(error: z.ZodError): DecisionIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (segment): segment is string | number => typeof segment !== "symbol",
    ),
    message: issue.message,
  }));
}

// Describes a validation failure by location and message only; zod messages
// name expected types, not received values.
function describe(error: z.ZodError): string {
  const [issue] = error.issues;
  if (!issue) return "invalid";

  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
