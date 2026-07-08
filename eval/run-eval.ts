import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { splitDataset } from "../lib/dataset";
import { evaluateReply } from "../lib/evaluate";
import { generateReply } from "../lib/generate";

loadEnvConfig(process.cwd());

async function main() {
  const { testSet } = splitDataset();
  const results = [];

  for (const item of testSet) {
    process.stdout.write(`Evaluating ${item.id}...\n`);
    const generation = await generateReply(item.incoming_email);
    const evaluation = await evaluateReply({
      incomingEmail: item.incoming_email,
      generatedReply: generation.reply,
      realSentReply: item.sent_reply
    });

    results.push({
      id: item.id,
      category: item.category,
      incoming_email: item.incoming_email,
      real_sent_reply: item.sent_reply,
      generated_reply: generation.reply,
      retrieved_example_ids: generation.retrievedExamples.map((example) => example.id),
      evaluation,
      human_score: null
    });
  }

  const rows = results.map((result) => ({
    id: result.id,
    category: result.category,
    similarity: result.evaluation.referenceSimilarityScore?.toFixed(1) ?? "n/a",
    rubricAverage: result.evaluation.rubricAverage.toFixed(2),
    combined: result.evaluation.combinedScore.toFixed(1)
  }));
  const meanCombined =
    results.reduce((sum, result) => sum + result.evaluation.combinedScore, 0) /
    results.length;

  console.table(rows);
  console.log(`Overall system score: ${meanCombined.toFixed(1)}`);

  const outputPath = path.join(process.cwd(), "eval", "results.json");
  await writeFile(outputPath, JSON.stringify(results, null, 2));
  console.log(`Saved full results to ${outputPath}`);
  console.log("Fill human_score values in eval/results.json, then run npm run validate.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
