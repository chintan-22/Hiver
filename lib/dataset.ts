import dataset from "../data/email-dataset.json";
import type { EmailPair } from "./types";

export const allEmailPairs = dataset as EmailPair[];

export function splitDataset() {
  const testSet = allEmailPairs.filter((_, index) => (index + 1) % 5 === 0);
  const referenceSet = allEmailPairs.filter((_, index) => (index + 1) % 5 !== 0);

  return { referenceSet, testSet };
}
