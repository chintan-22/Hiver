export type EmailCategory =
  | "billing"
  | "technical_issue"
  | "refund_policy"
  | "general_inquiry"
  | "complaint";

export type EmailPair = {
  id: string;
  category: EmailCategory;
  incoming_email: string;
  sent_reply: string;
};

export type RetrievedExample = EmailPair & {
  similarity: number;
};

export type RubricDimension =
  | "relevance"
  | "tone"
  | "groundedness"
  | "completeness";

export type RubricScore = {
  score: number;
  justification: string;
};

export type EvaluationResult = {
  referenceSimilarityScore: number | null;
  rubric: Record<RubricDimension, RubricScore>;
  rubricAverage: number;
  combinedScore: number;
  weighting: string;
};

export type GeneratedReplyResult = {
  reply: string;
  retrievedExamples: RetrievedExample[];
};
