import { splitDataset } from "./dataset";
import { cosineSimilarity, embedText, loadReferenceEmbeddings } from "./embeddings";
import { createChatCompletion } from "./openai";
import type { GeneratedReplyResult, RetrievedExample } from "./types";

export async function retrieveExamples(incomingEmail: string, count = 3) {
  const { referenceSet } = splitDataset();
  const queryEmbedding = await embedText(incomingEmail);
  const referenceEmbeddings = await loadReferenceEmbeddings();
  const embeddingById = new Map(
    referenceEmbeddings.map((item) => [item.id, item.embedding])
  );

  return referenceSet
    .map((pair) => ({
      ...pair,
      similarity: cosineSimilarity(queryEmbedding, embeddingById.get(pair.id) || [])
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count);
}

export async function generateReply(
  incomingEmail: string
): Promise<GeneratedReplyResult> {
  const retrievedExamples = await retrieveExamples(incomingEmail, 3);
  const reply = await createChatCompletion(
    [
      {
        role: "system",
        content:
          "You write concise, helpful customer-support email replies. Ground your answer in the new incoming email and the retrieved historical examples. Do not invent account details, policy promises, dates, refunds, integrations, or technical facts that are not supported by the incoming email or examples. If information is missing, ask for it clearly."
      },
      {
        role: "user",
        content: buildFewShotPrompt(incomingEmail, retrievedExamples)
      }
    ],
    { temperature: 0.25 }
  );

  return { reply, retrievedExamples };
}

function buildFewShotPrompt(
  incomingEmail: string,
  retrievedExamples: RetrievedExample[]
) {
  const examples = retrievedExamples
    .map(
      (example, index) => `Example ${index + 1} (${example.id}, ${example.category}):
Incoming email:
${example.incoming_email}

Sent reply:
${example.sent_reply}`
    )
    .join("\n\n---\n\n");

  return `Use these retrieved support exchanges as style and policy guidance:

${examples}

---

New incoming email:
${incomingEmail}

Write one suggested reply. Return only the reply text.`;
}
