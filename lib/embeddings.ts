import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { splitDataset } from "./dataset";
import { createEmbeddings } from "./openai";

type CachedEmbedding = {
  id: string;
  embedding: number[];
};

type EmbeddingCache = {
  datasetHash: string;
  model: string;
  embeddings: CachedEmbedding[];
};

const cachePath = path.join(process.cwd(), "data", "embeddings.json");

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function embedText(text: string) {
  const [embedding] = await createEmbeddings([text]);
  if (!embedding) {
    throw new Error("OpenAI did not return an embedding.");
  }

  return embedding;
}

export async function loadReferenceEmbeddings() {
  const { referenceSet } = splitDataset();
  const datasetHash = hashReferenceSet();
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const cached = await readCache();

  if (
    cached?.datasetHash === datasetHash &&
    cached.model === model &&
    cached.embeddings.length === referenceSet.length
  ) {
    return cached.embeddings;
  }

  const embeddings = await createEmbeddings(
    referenceSet.map((pair) => pair.incoming_email)
  );

  const cache: EmbeddingCache = {
    datasetHash,
    model,
    embeddings: referenceSet.map((pair, index) => ({
      id: pair.id,
      embedding: embeddings[index]
    }))
  };

  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2));

  return cache.embeddings;
}

async function readCache() {
  try {
    return JSON.parse(await readFile(cachePath, "utf8")) as EmbeddingCache;
  } catch {
    return null;
  }
}

function hashReferenceSet() {
  const { referenceSet } = splitDataset();
  return createHash("sha256")
    .update(JSON.stringify(referenceSet.map((pair) => [pair.id, pair.incoming_email])))
    .digest("hex");
}
