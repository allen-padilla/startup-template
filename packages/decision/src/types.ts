// Types for TypeSafe's System One API (POST /v1/systemone, GET /v1/models),
// following its published OpenAPI schema. Field names of questions and answers
// match the API; usage and model metadata are exposed in camelCase.

/**
 * Plain text, or JSON that the model reads as structured guidance or content.
 */
export type DecisionContent =
  | string
  | { readonly [key: string]: unknown }
  | readonly unknown[];

/** A yes/no question or a statement to evaluate as true or false. */
export interface NoulQuestion {
  readonly type: "noul";
  readonly instructions?: DecisionContent | null;
  /** What counts as a yes (`true`) and a no (`false`) answer. */
  readonly criteria?: {
    readonly true?: DecisionContent | null;
    readonly false?: DecisionContent | null;
  } | null;
}

/** Selects one of the named choices in `criteria`. */
export interface ChoiceQuestion {
  readonly type: "choice";
  readonly instructions?: DecisionContent | null;
  /**
   * Choice names mapped to when each applies. A `null` description means the
   * choice is interpreted by its name alone.
   */
  readonly criteria: { readonly [choice: string]: DecisionContent | null };
}

/** Rates the content against an ordered rubric. */
export interface ScoreQuestion {
  readonly type: "score";
  readonly instructions?: DecisionContent | null;
  /** Ordered score levels. A level's position is its score, starting at 0. */
  readonly criteria: readonly DecisionContent[];
}

export type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

/** Questions keyed by a name you choose. Answers use the same names. */
export type DecisionQuestions = { readonly [name: string]: DecisionQuestion };

export interface NoulAnswer {
  readonly type: "noul";
  /**
   * Probability, from 0 to 1, of a yes answer or a true statement. Values near
   * 0.5 indicate uncertainty.
   */
  readonly noul: number;
}

export interface ChoiceAnswer<Choice extends string = string> {
  readonly type: "choice";
  /** The choice with the highest probability. */
  readonly choice: Choice;
  /** Confidence in `choice`, from 0 to 1. Not a guarantee of correctness. */
  readonly confidence: number;
  /** Probability of each choice, from 0 to 1. */
  readonly probabilities: Partial<Record<Choice, number>>;
}

export interface ScoreAnswer {
  readonly type: "score";
  /**
   * Expected score: the probability-weighted average of the rubric levels.
   * May fall between levels.
   */
  readonly score: number;
  /** Confidence in `score`, from 0 to 1. Not a guarantee of correctness. */
  readonly confidence: number;
  /** The requested criteria keyed by score level (`"0"`, `"1"`, ...). */
  readonly legend: Readonly<Record<string, unknown>>;
  /** Probability of each score level, keyed like `legend`. */
  readonly probabilities: Readonly<Record<string, number>>;
}

export type DecisionAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

/** The answer type that corresponds to a question type. */
export type AnswerFor<Question extends DecisionQuestion> = Question extends {
  readonly type: "noul";
}
  ? NoulAnswer
  : Question extends { readonly type: "choice"; readonly criteria: infer Criteria }
    ? ChoiceAnswer<Extract<keyof Criteria, string>>
    : ScoreAnswer;

export type DecisionAnswers<Questions extends DecisionQuestions> = {
  readonly [Name in keyof Questions]: AnswerFor<Questions[Name]>;
};

export interface DecisionRequest<Questions extends DecisionQuestions> {
  /** The content every question refers to. */
  readonly state: DecisionContent;
  readonly questions: Questions;
  /** Overrides the client's model for this request. */
  readonly model?: string;
  /** Cancels the request. Cancellation rejects with the signal's reason. */
  readonly signal?: AbortSignal;
}

export interface DecisionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface DecisionResult<Questions extends DecisionQuestions> {
  /** The model that answered. May differ from a requested alias. */
  readonly model: string;
  readonly answers: DecisionAnswers<Questions>;
  readonly usage: DecisionUsage;
}

export interface DecisionModel {
  /** Name or alias accepted as a request's `model`. */
  readonly name: string;
  readonly description: string;
  /** `YYYY-MM-DD`. */
  readonly releaseDate: string;
}
