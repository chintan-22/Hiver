import { loadEnvConfig } from "@next/env";
import { splitDataset } from "../lib/dataset";
import { judgeWithRubric } from "../lib/evaluate";
import { generateReply } from "../lib/generate";
import type { RubricDimension } from "../lib/types";

loadEnvConfig(process.cwd());

const dimensions: RubricDimension[] = [
  "relevance",
  "tone",
  "groundedness",
  "completeness"
];

const badReplies: Record<string, string> = {
  "bill-005":
    "Thanks for reaching out. Your password has been reset and your dashboard should load now. I reviewed your screenshots and escalated this to Priya.",
  "tech-005":
    "We have refunded your annual subscription because you are inside the 30-day refund window. You should see the money tomorrow.",
  "refund-005":
    "You can invite teammates from settings. We also changed your account plan to Enterprise, so SSO is enabled now."
};

const mediocreReplies: Record<string, string> = {
  "bill-005":
    "Thanks for contacting us. We can help send unpaid invoices for Northstar Labs, but please confirm the billing email address first.",
  "tech-005":
    "Sorry about the API issue. Please check your settings, try the request again, and let us know if it keeps happening.",
  "refund-005":
    "Sorry about the downtime. We can review this and see if any option is available. Please send your account details."
};

type ComparisonRow = {
  id: string;
  replyType: string;
  relevance: number;
  tone: number;
  groundedness: number;
  completeness: number;
  average: number;
  hallucinated_actions: boolean;
};

async function main() {
  const { testSet } = splitDataset();
  const selected = testSet.filter((item) =>
    ["bill-005", "tech-005", "refund-005"].includes(item.id)
  );
  const rows: ComparisonRow[] = [];

  for (const item of selected) {
    const good = await generateReply(item.incoming_email);
    const variants = [
      { type: "bad", reply: badReplies[item.id] },
      { type: "mediocre", reply: mediocreReplies[item.id] },
      { type: "good", reply: good.reply }
    ];

    for (const variant of variants) {
      const judge = await judgeWithRubric(item.incoming_email, variant.reply);
      const average =
        dimensions.reduce(
          (sum, dimension) => sum + judge.rubric[dimension].score,
          0
        ) / dimensions.length;

      rows.push({
        id: item.id,
        replyType: variant.type,
        relevance: judge.rubric.relevance.score,
        tone: judge.rubric.tone.score,
        groundedness: judge.rubric.groundedness.score,
        completeness: judge.rubric.completeness.score,
        average: Number(average.toFixed(2)),
        hallucinated_actions: judge.hallucinatedActions
      });
    }
  }

  console.table(rows);

  const warning = selected.some((item) => {
    const itemRows = rows.filter((row) => row.id === item.id);
    const bad = itemRows.find((row) => row.replyType === "bad")?.average ?? 0;
    const mediocre =
      itemRows.find((row) => row.replyType === "mediocre")?.average ?? 0;
    const good = itemRows.find((row) => row.replyType === "good")?.average ?? 0;

    return !(bad + 0.75 <= mediocre && mediocre + 0.5 <= good);
  });

  if (warning) {
    console.warn(
      "WARNING: judge is not discriminating well between bad/mediocre/good replies."
    );
  } else {
    console.log("Judge discrimination check passed: bad < mediocre < good.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
