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
  const [referenceSimilarityScore, judgeResult] = await Promise.all([
    input.realSentReply
      ? computeReferenceSimilarity(input.generatedReply, input.realSentReply)
      : Promise.resolve(null),
    judgeWithRubric(input.incomingEmail, input.generatedReply)
  ]);
  const { rubric, hallucinatedActions } = judgeResult;

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
    hallucinatedActions,
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

export async function judgeWithRubric(
  incomingEmail: string,
  generatedReply: string
): Promise<{
  rubric: Record<RubricDimension, RubricScore>;
  hallucinatedActions: boolean;
}> {
  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a calibrated, strict support QA judge. Score the generated reply only against the incoming customer email.

Most replies are NOT perfect. Reserve 5/5 only for replies with zero identifiable flaws on that dimension. Use the full 1-5 range; if you score most responses 4-5, you are being too lenient.

Calibration anchors:
- Relevance 1-2: answers a different issue, ignores the main ask, or gives unrelated instructions. Relevance 3: touches the topic but misses a key ask or gives a generic response. Relevance 4-5: directly addresses all major customer asks; 5 has no material miss.
- Tone 1-2: dismissive, defensive, robotic, or mismatched to frustration. Tone 3: polite but generic or under-empathetic. Tone 4-5: professional and appropriately empathetic; 5 is warm without overpromising.
- Groundedness 1-2: invents policy, eligibility, account status, timelines, refunds, integrations, or technical facts. Groundedness 3: mostly grounded but includes a risky unsupported assumption. Groundedness 4-5: stays within the customer email; 5 has no unsupported factual or policy claim.
- Completeness 1-2: omits most needed next steps or leaves the customer stuck. Completeness 3: partial answer with vague next steps. Completeness 4-5: covers answerable parts and asks for missing details; 5 handles all important edge cases visible in the email.

Also flag hallucinated_actions=true when the reply claims to have already done something the system has no way of doing or that is not grounded in the email, such as "I reviewed your screenshots", "I escalated this to Priya", "I checked your invoice", or "I reset your account". This is separate from unsupported policy/fact claims.

Every dimension must include a specific criticism, even for high scores. For high scores, write a concrete note like "No significant issue; it handled X well, though Y edge case was not explicit." Avoid rubber-stamp justifications.`
      },
      {
        role: "user",
        content: `Incoming email:
${incomingEmail}

Generated reply:
${generatedReply}

Return JSON with exactly this shape:
{"rubric":{"relevance":{"score":1,"justification":"specific criticism..."}, "tone":{"score":1,"justification":"specific criticism..."}, "groundedness":{"score":1,"justification":"specific criticism..."}, "completeness":{"score":1,"justification":"specific criticism..."}},"hallucinated_actions":false}

Use integer scores from 1 to 5. Each justification must be one sentence.`
      }
    ],
    { json: true, temperature: 0 }
  );

  const parsed = parseJson<{
    rubric?: Record<RubricDimension, RubricScore>;
    hallucinated_actions?: boolean;
  }>(content);

  const rubric = dimensions.reduce(
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

  return {
    rubric,
    hallucinatedActions: Boolean(parsed.hallucinated_actions)
  };
}
