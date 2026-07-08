const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "for",
  "from",
  "have",
  "i",
  "if",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "please",
  "that",
  "the",
  "this",
  "to",
  "we",
  "you",
  "your"
]);

type Vector = Map<string, number>;

export function textSimilarity(a: string, b: string) {
  const idf = buildIdf([a, b]);
  return cosineSimilarity(vectorize(a, idf), vectorize(b, idf));
}

export function rankBySimilarity<T>(
  query: string,
  items: T[],
  getText: (item: T) => string
) {
  const corpus = [query, ...items.map(getText)];
  const idf = buildIdf(corpus);
  const queryVector = vectorize(query, idf);

  return items
    .map((item) => ({
      item,
      similarity: cosineSimilarity(queryVector, vectorize(getText(item), idf))
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

function buildIdf(corpus: string[]) {
  const documentCount = corpus.length;
  const documentFrequency = new Map<string, number>();

  for (const text of corpus) {
    const uniqueTokens = new Set(tokenize(text));
    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [token, count] of documentFrequency) {
    idf.set(token, Math.log((documentCount + 1) / (count + 1)) + 1);
  }

  return idf;
}

function vectorize(text: string, idf: Map<string, number>) {
  const tokens = tokenize(text);
  const vector: Vector = new Map();

  for (const token of tokens) {
    vector.set(token, (vector.get(token) || 0) + 1);
  }

  for (const [token, count] of vector) {
    vector.set(token, (count / tokens.length) * (idf.get(token) || 1));
  }

  return vector;
}

function cosineSimilarity(a: Vector, b: Vector) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of a.values()) {
    normA += value * value;
  }

  for (const value of b.values()) {
    normB += value * value;
  }

  for (const [token, value] of a) {
    dot += value * (b.get(token) || 0);
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
