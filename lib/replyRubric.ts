export type Strategy = "concise" | "empathetic" | "policy-strict";

export type RubricDimension =
  | "relevance"
  | "tone"
  | "correctnessGroundedness"
  | "completeness"
  | "conciseness";

export type ScoreDetail = {
  score: number;
  justification: string;
};

export type CandidateResult = {
  strategy: Strategy;
  reply: string;
  scores: Record<RubricDimension, ScoreDetail>;
  overallScore: number;
  hallucination: boolean;
};

export type GenerateResult = {
  candidates: CandidateResult[];
};

type RawCandidate = {
  strategy: Strategy;
  reply: string;
};

const strategies: Strategy[] = ["concise", "empathetic", "policy-strict"];

const dimensions: RubricDimension[] = [
  "relevance",
  "tone",
  "correctnessGroundedness",
  "completeness",
  "conciseness"
];

const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function generateAndScoreReplies(input: {
  customerEmail: string;
  contextNotes?: string;
}): Promise<GenerateResult> {
  const customerEmail = input.customerEmail.trim();
  const contextNotes = input.contextNotes?.trim() || "";

  if (!customerEmail) {
    throw new Error("Customer email is required.");
  }

  const candidates = await generateCandidates(customerEmail, contextNotes);
  const scored = await scoreCandidates(customerEmail, contextNotes, candidates);

  return {
    candidates: scored.sort((a, b) => b.overallScore - a.overallScore)
  };
}

async function generateCandidates(
  customerEmail: string,
  contextNotes: string
): Promise<RawCandidate[]> {
  const content = await chatJson([
    {
      role: "system",
      content:
        "You generate support replies grounded only in the provided context notes. If the notes do not contain an answer, say so plainly and ask for the missing information instead of inventing policy."
    },
    {
      role: "user",
      content: `Customer email:\n${customerEmail}\n\nContext/policy notes:\n${contextNotes || "(No context notes provided.)"}\n\nReturn JSON with exactly this shape: {"candidates":[{"strategy":"concise","reply":"..."},{"strategy":"empathetic","reply":"..."},{"strategy":"policy-strict","reply":"..."}]}.\n\nRequirements:\n- Generate exactly 3 candidates, one for each strategy: concise, empathetic, policy-strict.\n- Do not contradict the context notes.\n- Do not state policies, dates, amounts, eligibility rules, account status, shipping facts, or commitments that are not present in the context notes.\n- Each reply should be ready to send to the customer.`
    }
  ]);

  const parsed = parseJson(content) as { candidates?: RawCandidate[] };
  const byStrategy = new Map(
    (parsed.candidates || []).map((candidate) => [candidate.strategy, candidate])
  );

  return strategies.map((strategy) => {
    const candidate = byStrategy.get(strategy);
    if (!candidate?.reply) {
      throw new Error(`Model did not return a ${strategy} candidate.`);
    }

    return {
      strategy,
      reply: candidate.reply.trim()
    };
  });
}

async function scoreCandidates(
  customerEmail: string,
  contextNotes: string,
  candidates: RawCandidate[]
): Promise<CandidateResult[]> {
  const content = await chatJson([
    {
      role: "system",
      content:
        "You are a strict support QA judge. Score replies against the customer email and the provided context notes. Treat the context notes as the only source of truth."
    },
    {
      role: "user",
      content: `Customer email:\n${customerEmail}\n\nContext/policy notes:\n${contextNotes || "(No context notes provided.)"}\n\nCandidate replies:\n${JSON.stringify(candidates, null, 2)}\n\nReturn JSON with this shape: {"candidates":[{"strategy":"concise","scores":{"relevance":{"score":1,"justification":"..."}, "tone":{"score":1,"justification":"..."}, "correctnessGroundedness":{"score":1,"justification":"..."}, "completeness":{"score":1,"justification":"..."}, "conciseness":{"score":1,"justification":"..."}}, "hallucination":false}]}.\n\nRubric:\n- relevance: answers the customer's actual ask.\n- tone: professional, helpful, and suitable for the customer's emotion.\n- correctnessGroundedness: sticks to the given facts and does not contradict or invent policy.\n- completeness: covers all answerable parts and clearly names missing information when needed.\n- conciseness: avoids unnecessary length while still being useful.\n\nScoring rules:\n- Use integers from 1 to 5 only.\n- Give one sentence of justification per category.\n- Set hallucination true if a reply states any fact, promise, policy, date, amount, eligibility rule, account status, or operational capability not present in the context notes. Generic empathy and requests for clarification are not hallucinations.\n- Do not include overall scores; they will be calculated by code.`
    }
  ]);

  const parsed = parseJson(content) as {
    candidates?: Array<{
      strategy: Strategy;
      scores: Record<RubricDimension, ScoreDetail>;
      hallucination: boolean;
    }>;
  };

  const scoresByStrategy = new Map(
    (parsed.candidates || []).map((candidate) => [candidate.strategy, candidate])
  );

  return candidates.map((candidate) => {
    const judged = scoresByStrategy.get(candidate.strategy);
    if (!judged) {
      throw new Error(`Model did not score the ${candidate.strategy} candidate.`);
    }

    const scores = normalizeScores(judged.scores);
    const overallScore = Number(
      (
        dimensions.reduce((sum, dimension) => sum + scores[dimension].score, 0) /
        dimensions.length
      ).toFixed(1)
    );

    return {
      strategy: candidate.strategy,
      reply: candidate.reply,
      scores,
      overallScore,
      hallucination: Boolean(judged.hallucination)
    };
  });
}

function normalizeScores(
  rawScores: Record<RubricDimension, ScoreDetail>
): Record<RubricDimension, ScoreDetail> {
  return dimensions.reduce(
    (normalized, dimension) => {
      const raw = rawScores?.[dimension];
      const score = Math.min(5, Math.max(1, Math.round(Number(raw?.score) || 1)));

      normalized[dimension] = {
        score,
        justification:
          raw?.justification?.trim() || "The judge did not provide a justification."
      };

      return normalized;
    },
    {} as Record<RubricDimension, ScoreDetail>
  );
}

async function chatJson(
  messages: Array<{ role: "system" | "user"; content: string }>
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI API returned an empty response.");
  }

  return content;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model response was not valid JSON.");
    }

    return JSON.parse(match[0]);
  }
}
