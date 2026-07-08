import { writeFile } from "node:fs/promises";
import path from "node:path";
import samples from "./sample-emails.json";
import { generateAndScoreReplies } from "../lib/replyRubric";

type SampleEmail = {
  id: string;
  customerEmail: string;
  contextNotes: string;
};

type EvalResult = SampleEmail & Awaited<ReturnType<typeof generateAndScoreReplies>>;

async function main() {
  const results: EvalResult[] = [];

  for (const sample of samples as SampleEmail[]) {
    process.stdout.write(`Evaluating ${sample.id}...\n`);
    const result = await generateAndScoreReplies({
      customerEmail: sample.customerEmail,
      contextNotes: sample.contextNotes
    });

    results.push({ ...sample, ...result });
  }

  const rows = results.map((result) => {
    const best = result.candidates[0];

    return {
      id: result.id,
      bestStrategy: best.strategy,
      bestOverallScore: best.overallScore.toFixed(1),
      hallucinationFlags: result.candidates.some((candidate) => candidate.hallucination)
        ? "yes"
        : "no"
    };
  });

  console.table(rows);

  const outputPath = path.join(process.cwd(), "eval", "results.json");
  await writeFile(outputPath, JSON.stringify(results, null, 2));
  process.stdout.write(`Saved full results to ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
