import { createChatCompletion, parseJson } from "./groq";
import { textSimilarity } from "./similarity";
import type { EvaluationResult, RubricDimension, RubricScore } from "./types";

const dimensions: RubricDimension[] = [
  "relevance",
  "tone",
  "groundedness",
  "completeness"
];

export async function evaluateReply(input: {
  incomingEmail: string;
  generatedReply: string;
  realSentReply?: string;
}): Promise<EvaluationResult> {
  const [referenceSimilarityScore, rubric] = await Promise.all([
    input.realSentReply
      ? computeReferenceSimilarity(input.generatedReply, input.realSentReply)
      : Promise.resolve(null),
    judgeWithRubric(input.incomingEmail, input.generatedReply)
  ]);

  const rubricAverage = Number(
    (
      dimensions.reduce((sum, dimension) => sum + rubric[dimension].score, 0) /
      dimensions.length
    ).toFixed(2)
  );
  const rubricAsHundred = rubricAverage * 20;
  const combinedScore =
    referenceSimilarityScore === null
      ? Number(rubricAsHundred.toFixed(1))
      : Number((referenceSimilarityScore * 0.4 + rubricAsHundred * 0.6).toFixed(1));

  return {
    referenceSimilarityScore,
    rubric,
    rubricAverage,
    combinedScore,
    weighting:
      referenceSimilarityScore === null
        ? "No ground-truth reply available; combined score equals rubric average scaled to 0-100."
        : "Combined score = 40% local reference similarity + 60% LLM rubric average scaled to 0-100."
  };
}

async function computeReferenceSimilarity(generatedReply: string, realSentReply: string) {
  const similarity = textSimilarity(generatedReply, realSentReply);
  return Number(Math.max(0, Math.min(100, similarity * 100)).toFixed(1));
}

async function judgeWithRubric(
  incomingEmail: string,
  generatedReply: string
): Promise<Record<RubricDimension, RubricScore>> {
  const content = await createChatCompletion(
    [
      {
        role: "system",
        content:
          "You are a strict but fair support QA judge. Score the generated reply only against the incoming customer email. Groundedness means the reply avoids invented facts, policies, account state, timelines, refunds, or promises not supported by the customer email."
      },
      {
        role: "user",
        content: `Incoming email:
${incomingEmail}

Generated reply:
${generatedReply}

Return JSON with exactly this shape:
{"rubric":{"relevance":{"score":1,"justification":"..."}, "tone":{"score":1,"justification":"..."}, "groundedness":{"score":1,"justification":"..."}, "completeness":{"score":1,"justification":"..."}}}

Use integer scores from 1 to 5. Each justification must be one sentence.`
      }
    ],
    { temperature: 0 }
  );

  const parsed = parseJson<{ rubric?: Record<RubricDimension, RubricScore> }>(content);

  return dimensions.reduce(
    (normalized, dimension) => {
      const raw = parsed.rubric?.[dimension];
      normalized[dimension] = {
        score: Math.min(5, Math.max(1, Math.round(Number(raw?.score) || 1))),
        justification:
          raw?.justification?.trim() || "The judge did not provide a justification."
      };

      return normalized;
    },
    {} as Record<RubricDimension, RubricScore>
  );
}
