# GroundedReply

GroundedReply is a small full-stack Next.js app that generates AI-suggested customer-support email replies grounded in a synthetic dataset of past support exchanges. It also evaluates reply quality instead of only generating text, so the app can answer two questions:

1. Did retrieval find useful prior examples?
2. Is the generated reply good, grounded, and close to how a human support team might answer?

The project uses the Groq API for generation and judging. Retrieval and reference-reply similarity are computed locally with a small TF-IDF style cosine similarity helper, so no OpenAI key or embedding endpoint is required.

## What It Does

- Stores a synthetic support dataset in `data/email-dataset.json`.
- Splits the dataset programmatically into 40 reference examples and 10 held-out test examples.
- Retrieves the top 3 similar examples for a new incoming email using local token-based TF-IDF cosine similarity.
- Builds a few-shot prompt from the retrieved examples and generates one suggested reply.
- Evaluates generated replies with:
  - Local reference similarity to the known human reply when a ground-truth reply exists.
  - An LLM-judge rubric that works even for live queries without ground truth.
  - A combined score.

No database is used. The dataset and generated eval outputs are JSON files on disk.

## Dataset

`data/email-dataset.json` contains 50 realistic, varied, synthetic support-email exchanges. Each item has:

```ts
{
  id: string;
  category: "billing" | "technical_issue" | "refund_policy" | "general_inquiry" | "complaint";
  incoming_email: string;
  sent_reply: string;
}
```

The five categories are meant to represent a typical support inbox:

- `billing`: invoices, failed payments, tax details, seats, plan changes.
- `technical_issue`: broken exports, integrations, login trouble, API errors, delayed notifications.
- `refund_policy`: refund windows, accidental charges, service credits, setup fees.
- `general_inquiry`: product capabilities, onboarding, routing, imports, audit logs.
- `complaint`: frustrated customers, missed callbacks, slow product behavior, bad handoffs.

The dataset is explicitly synthetic. That keeps the repo self-contained and avoids customer-data privacy issues, but it also means the examples lack the messiness, contradictions, long threads, internal notes, and unusual edge cases of real production support data.

The split happens in `lib/dataset.ts`: every fifth item is held out as test data, leaving 40 reference pairs for retrieval and 10 test pairs for evaluation. Held-out test replies are never used for retrieval.

## Generation Approach

GroundedReply uses RAG/few-shot prompting instead of fine-tuning:

1. Vectorize the new incoming email with a small local TF-IDF style scorer.
2. Retrieve the top 3 most similar reference-set incoming emails by cosine similarity.
3. Put those retrieved `(incoming email, sent reply)` examples into the prompt.
4. Ask the model to write one reply grounded in the new email and the retrieved examples.

This is the right tradeoff at this scale because 40 reference examples are far too few for meaningful fine-tuning, and RAG is cheaper, easier to inspect, and faster to iterate. It also makes the grounding source transparent in the UI.

With a large real dataset, I would consider a retrieval index over thousands of tickets, stronger metadata filtering by category/account/plan, and possibly fine-tuning once there is enough clean, human-approved reply data. Fine-tuning would make more sense after validating that the target style and policy behavior are stable.

## Evaluation Philosophy

Exact match is the wrong metric for free-text replies. Two excellent replies can use different wording, different ordering, or different levels of empathy while still solving the customer’s problem.

GroundedReply uses two complementary signals:

- **Local reference similarity**: compares the generated reply and the known `sent_reply` with token-based TF-IDF cosine similarity, then scales the result to 0-100. This asks, “Did the generated reply use similar substance to what a human actually sent?”
- **LLM-judge rubric**: scores the reply on its own terms from 1-5 across relevance, tone, groundedness, and completeness. This works for live queries where no ground-truth reply exists.

The combined score is:

```text
40% local reference similarity + 60% rubric average scaled to 0-100
```

The rubric is weighted more heavily because the historical sent reply is not guaranteed to be perfect. A generated reply can be better than the old reply, especially if the old one was terse, incomplete, or awkwardly worded.

For live UI queries without a ground-truth reply, reference similarity is not available. In that case, the combined score equals the rubric average scaled to 0-100.

## Rubric

The LLM judge scores each generated reply from 1 to 5 on:

| Dimension | What it checks |
| --- | --- |
| Relevance | Whether the reply addresses the customer’s actual request |
| Tone | Whether the reply is professional, helpful, and emotionally appropriate |
| Groundedness | Whether the reply avoids invented facts, policies, account state, timelines, refunds, or promises not supported by the incoming email |
| Completeness | Whether the reply covers the answerable parts and asks for missing details when needed |

Each score includes a one-sentence justification. The average rubric score is computed in code, not by the model.

## Validation

The validation flow is:

1. Run `npm run eval`.
2. Open `eval/results.json`.
3. Review each generated reply honestly.
4. Fill `human_score` with a 1-5 human rating.
5. Run `npm run validate`.

`eval/validate.ts` computes Pearson correlation between the human scores and the automated combined scores, then prints a short interpretation.

I could not report a real correlation number in this README because this environment does not have a usable `GROQ_API_KEY` set, so I could not generate eval results and label the actual model outputs. Once eval results are produced and labeled, this section should be updated with the computed correlation.

Even with a completed run, a 10-sample correlation is only a directional smoke test. At scale, I would use more samples, multiple human labelers, inter-rater agreement checks, category-level slices, and calibration against production outcomes such as resolution rate, escalation rate, customer satisfaction, and agent edit distance.

## Setup

```bash
npm install
cp .env.example .env
```

Set your Groq key:

```bash
GROQ_API_KEY=replace-with-your-groq-key
GROQ_MODEL=llama-3.3-70b-versatile
```

`GROQ_MODEL` is optional because the app defaults to `llama-3.3-70b-versatile`.

## Run the App

```bash
npm run dev
```

Open `http://localhost:3000`.

Paste a new incoming customer email, click **Generate Reply**, and the app will show:

- The generated reply.
- The 3 retrieved examples that informed it.
- Rubric scores and justifications.
- A live combined score based on the rubric.

## Run Checks

```bash
npm run lint
npm run build
```

`npm run lint` runs TypeScript checking with `tsc --noEmit`.

## Run Evaluation

```bash
npm run eval
```

This runs the full generation and evaluation pipeline on the 10 held-out test examples, prints per-email scores plus an overall mean combined score, and writes:

```bash
eval/results.json
```

`eval/results.json` includes `human_score: null` for each item. Fill those values manually after reviewing the generated replies.

## Validate Automated Scores

```bash
npm run validate
```

This reads `eval/results.json`, requires at least two filled `human_score` values, computes Pearson correlation between human scores and automated combined scores, and prints an interpretation.

## Important Files

- `data/email-dataset.json`: synthetic dataset.
- `lib/dataset.ts`: deterministic reference/test split.
- `lib/similarity.ts`: local token-based TF-IDF cosine similarity for retrieval and held-out reply comparison.
- `lib/groq.ts`: Groq chat-completions calls.
- `lib/generate.ts`: local retrieval plus few-shot reply generation.
- `lib/evaluate.ts`: reference similarity, rubric judging, and combined score.
- `app/api/generate/route.ts`: app API route.
- `eval/run-eval.ts`: held-out evaluation harness.
- `eval/validate.ts`: human-label correlation check.

## Limitations and Next Steps

- The dataset is synthetic and small.
- Local TF-IDF similarity is weaker than embedding similarity and can miss paraphrases.
- The LLM judge is prompt-based and not calibrated against a large human-labeled benchmark.
- Groundedness is checked against the incoming email for evaluation, not a full policy corpus.
- The UI does not stream tokens or show partial retrieval progress.
- There is no auth, persistence, rate limiting, retry logic, or production observability.
- The validation set has only 10 items, so correlation results will be noisy.

With more time, I would add a real retrieval layer over policy docs and historical tickets, citations for retrieved grounding, stronger category-aware retrieval, multiple judge prompts, human-label calibration, and agent feedback loops that measure how often generated replies are edited before sending.

## AI Assistance Disclosure

This submission was built with AI coding assistance from Codex, per the challenge rules.
