import { readFile } from "node:fs/promises";
import path from "node:path";

type EvalResult = {
  id: string;
  evaluation: { combinedScore: number };
  human_score: number | null;
};

async function main() {
  const resultsPath = path.join(process.cwd(), "eval", "results.json");
  const results = JSON.parse(await readFile(resultsPath, "utf8")) as EvalResult[];
  const labeled = results.filter(
    (result) =>
      typeof result.human_score === "number" &&
      result.human_score >= 1 &&
      result.human_score <= 5
  );

  if (labeled.length < 2) {
    throw new Error(
      "Need at least two eval results with human_score values from 1-5."
    );
  }

  const humanScores = labeled.map((result) => result.human_score as number);
  const automatedScores = labeled.map((result) => result.evaluation.combinedScore);
  const correlation = pearson(humanScores, automatedScores);
  const strength =
    Math.abs(correlation) >= 0.7
      ? "strong"
      : Math.abs(correlation) >= 0.4
        ? "moderate"
        : "weak";

  console.log(`Validated ${labeled.length} labeled eval rows.`);
  console.log(`Pearson correlation: ${correlation.toFixed(3)}`);
  console.log(
    `A ${strength} correlation suggests the automated metric ${
      Math.abs(correlation) >= 0.4 ? "does" : "does not"
    } track human judgment well on this small sample. With only ${labeled.length} items, treat this as a directional signal rather than proof.`
  );
}

function pearson(x: number[], y: number[]) {
  const meanX = mean(x);
  const meanY = mean(y);
  let numerator = 0;
  let sumX = 0;
  let sumY = 0;

  for (let index = 0; index < x.length; index += 1) {
    const dx = x[index] - meanX;
    const dy = y[index] - meanY;
    numerator += dx * dy;
    sumX += dx * dx;
    sumY += dy * dy;
  }

  const denominator = Math.sqrt(sumX * sumY);
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
