import { readFile } from "node:fs/promises";
import path from "node:path";

type EvalResult = {
  id: string;
  evaluation: {
    rubricAverage: number;
    combinedScore: number;
  };
  human_score: number | null;
};

async function main() {
  const oldResults = await readResults("results.json");
  const newResults = await readResults("results-v2.json");

  printDistributionComparison(oldResults, newResults);

  if (!newResults.length) {
    console.log("No eval/results-v2.json found yet. Run npm run eval first.");
    return;
  }

  const oldLabelsById = new Map(
    oldResults
      .filter(isLabeled)
      .map((result) => [result.id, result.human_score as number])
  );
  const labeled = newResults
    .map((result) => ({
      ...result,
      humanLabel:
        typeof result.human_score === "number"
          ? result.human_score
          : oldLabelsById.get(result.id)
    }))
    .filter(
      (result) =>
        typeof result.humanLabel === "number" &&
        result.humanLabel >= 1 &&
        result.humanLabel <= 5
    );

  if (labeled.length < 2) {
    console.log(
      "Need at least two human_score labels from eval/results-v2.json or matching ids in eval/results.json to compute correlation."
    );
    return;
  }

  const humanScores = labeled.map((result) => result.humanLabel as number);
  const automatedScores = labeled.map((result) => result.evaluation.combinedScore);
  const correlation = pearson(humanScores, automatedScores);
  const strength =
    Math.abs(correlation) >= 0.7
      ? "strong"
      : Math.abs(correlation) >= 0.4
        ? "moderate"
        : "weak";

  console.log(`Validated ${labeled.length} labeled eval rows.`);
  console.log(`Pearson correlation vs new combined score: ${correlation.toFixed(3)}`);
  console.log(
    `A ${strength} correlation suggests the automated metric ${
      Math.abs(correlation) >= 0.4 ? "does" : "does not"
    } track human judgment well on this small sample. With only ${labeled.length} items, treat this as a directional signal rather than proof.`
  );
}

async function readResults(filename: string) {
  try {
    const resultsPath = path.join(process.cwd(), "eval", filename);
    return JSON.parse(await readFile(resultsPath, "utf8")) as EvalResult[];
  } catch {
    return [];
  }
}

function printDistributionComparison(
  oldResults: EvalResult[],
  newResults: EvalResult[]
) {
  const rows = [
    { run: "old results.json", ...distribution(oldResults) },
    { run: "new results-v2.json", ...distribution(newResults) }
  ];

  console.table(rows);
}

function distribution(results: EvalResult[]) {
  const values = results
    .map((result) => result.evaluation?.rubricAverage)
    .filter((value): value is number => typeof value === "number");

  if (!values.length) {
    return { count: 0, min: "n/a", max: "n/a", mean: "n/a", stddev: "n/a" };
  }

  return {
    count: values.length,
    min: Math.min(...values).toFixed(2),
    max: Math.max(...values).toFixed(2),
    mean: mean(values).toFixed(2),
    stddev: stddev(values).toFixed(3)
  };
}

function isLabeled(result: EvalResult) {
  return (
    typeof result.human_score === "number" &&
    result.human_score >= 1 &&
    result.human_score <= 5
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

function stddev(values: number[]) {
  const valueMean = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) /
    values.length;

  return Math.sqrt(variance);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
