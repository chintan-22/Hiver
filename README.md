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
2. Open `eval/results-v2.json`.
3. Review each generated reply honestly.
4. Fill `human_score` with a 1-5 human rating.
5. Run `npm run validate`.

`eval/validate.ts` prints old-vs-new rubric score distributions, computes Pearson correlation between human scores and the new automated combined scores, then prints a short interpretation.

The current `eval/results-v2.json` has human labels filled in from 3.5 to 4.75. `npm run validate` reports a Pearson correlation of `0.786` between those human scores and the new combined score.

Even with a completed run, a 10-sample correlation is only a directional smoke test. At scale, I would use more samples, multiple human labelers, inter-rater agreement checks, category-level slices, and calibration against production outcomes such as resolution rate, escalation rate, customer satisfaction, and agent edit distance.

## Evaluation Iteration: Fixing Rubric Saturation

The first evaluator showed a clear ceiling effect: the LLM judge scored nearly every generated reply between 4.5 and 5.0. The reference-similarity scores varied, but the rubric was not adding much independent signal.

Original saturated eval table from `eval/results.json`:

| Email id | Category | Reference similarity | Rubric average | Combined |
| --- | --- | ---: | ---: | ---: |
| bill-005 | billing | 7.8 | 4.75 | 68.5 |
| bill-010 | billing | 8.3 | 4.50 | 67.3 |
| tech-005 | technical_issue | 11.0 | 5.00 | 64.4 |
| tech-010 | technical_issue | 9.4 | 5.00 | 63.8 |
| refund-005 | refund_policy | 7.8 | 5.00 | 63.1 |
| refund-010 | refund_policy | 11.0 | 5.00 | 64.4 |
| gen-005 | general_inquiry | 3.0 | 4.75 | 61.2 |
| gen-010 | general_inquiry | 14.3 | 5.00 | 65.7 |
| comp-005 | complaint | 17.5 | 5.00 | 67.0 |
| comp-010 | complaint | 18.1 | 5.00 | 67.2 |

Diagnosis: LLM-as-judge scoring without calibration anchors tends to be lenient, especially when the generated reply is fluent and plausible. The original prompt asked for scores in isolation, so the judge had no concrete reference for what “bad”, “mediocre”, and “great” should look like.

Fix implemented:

- Added compact calibration anchors for each rubric dimension: relevance, tone, groundedness, and completeness.
- Instructed the judge to reserve 5/5 for replies with no identifiable flaw and to use the full 1-5 range.
- Added `hallucinated_actions`, a boolean flag for replies that claim to have done actions the system cannot know or perform, such as already reviewing screenshots or escalating to a named person.
- Required specific criticism for every dimension, even when the score is high.
- Added JSON-mode judge calls and a small retry for transient Groq 429 rate limits.

Adversarial calibration test from `npm run test-judge`:

| Email id | Reply type | Relevance | Tone | Groundedness | Completeness | Average | Hallucinated actions |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| bill-005 | bad | 1 | 1 | 1 | 1 | 1.00 | true |
| bill-005 | mediocre | 3 | 3 | 5 | 2 | 3.25 | false |
| bill-005 | good | 5 | 5 | 5 | 4 | 4.75 | false |
| tech-005 | bad | 1 | 1 | 1 | 1 | 1.00 | false |
| tech-005 | mediocre | 2 | 3 | 4 | 2 | 2.75 | false |
| tech-005 | good | 5 | 5 | 5 | 4 | 4.75 | false |
| refund-005 | bad | 1 | 1 | 1 | 1 | 1.00 | true |
| refund-005 | mediocre | 4 | 3 | 5 | 2 | 3.50 | false |
| refund-005 | good | 4 | 4 | 5 | 4 | 4.25 | false |

The adversarial test now passes its ordering check: bad replies score clearly below mediocre replies, and mediocre replies score below good replies.

Full eval v2 from `eval/results-v2.json`:

| Email id | Category | Reference similarity | Rubric average | Hallucinated actions | Combined | Human score |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| bill-005 | billing | 35.1 | 5.00 | no | 74.0 | 4.75 |
| bill-010 | billing | 34.0 | 5.00 | no | 73.6 | 4.25 |
| tech-005 | technical_issue | 6.2 | 4.00 | no | 50.5 | 3.50 |
| tech-010 | technical_issue | 11.4 | 5.00 | no | 64.6 | 4.00 |
| refund-005 | refund_policy | 7.8 | 4.50 | no | 57.1 | 3.75 |
| refund-010 | refund_policy | 11.0 | 4.75 | no | 61.4 | 4.00 |
| gen-005 | general_inquiry | 14.1 | 4.75 | no | 62.6 | 4.25 |
| gen-010 | general_inquiry | 14.4 | 5.00 | no | 65.8 | 3.75 |
| comp-005 | complaint | 20.4 | 5.00 | no | 68.2 | 4.00 |
| comp-010 | complaint | 18.1 | 4.75 | no | 64.2 | 4.25 |

Rubric distribution comparison from `npm run validate`:

| Run | Count | Min | Max | Mean | Stddev |
| --- | ---: | ---: | ---: | ---: | ---: |
| old results.json | 10 | 4.50 | 5.00 | 4.90 | 0.166 |
| new results-v2.json | 10 | 4.00 | 5.00 | 4.78 | 0.305 |

This is an improvement: the standard deviation increased from 0.166 to 0.305 and the minimum score dropped from 4.50 to 4.00. It is not a complete fix; the full eval still skews high. The adversarial test shows the judge can discriminate when quality differences are clear, while the held-out generated replies remain mostly strong or the judge is still somewhat lenient.

Correlation update: after filling the v2 human labels, `npm run validate` reports Pearson correlation `0.786` against the new combined score. That is encouraging but still only directional because the sample has 10 items and one labeler.

With more time, I would calibrate the judge with real human-labeled examples, use a stronger or different model as the judge than the one generating replies to reduce self-preference bias, evaluate pairwise comparisons instead of only absolute scores, and track per-category calibration because support-quality failures vary by category.

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
eval/results-v2.json
```

`eval/results-v2.json` includes filled `human_score` values from 3.5 to 4.75 for the current run. If you regenerate the eval file, review the new replies and update the labels again before validating.

## Run Judge Calibration Test

```bash
npm run test-judge
```

This runs three hard-coded bad/mediocre/good reply sets through the rubric judge and warns if the judge does not separate the quality levels.

## Validate Automated Scores

```bash
npm run validate
```

This reads both `eval/results.json` and `eval/results-v2.json`, prints old-vs-new rubric score distributions, and computes Pearson correlation when at least two human labels are available.

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
- `eval/adversarial-test.ts`: bad/mediocre/good calibration test for the judge.

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
