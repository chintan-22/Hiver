import { splitDataset } from "./dataset";
import { createChatCompletion } from "./groq";
import { rankBySimilarity } from "./similarity";
import type { GeneratedReplyResult, RetrievedExample } from "./types";

export async function retrieveExamples(incomingEmail: string, count = 3) {
  const { referenceSet } = splitDataset();
  return rankBySimilarity(
    incomingEmail,
    referenceSet,
    (pair) => pair.incoming_email
  )
    .slice(0, count)
    .map(({ item, similarity }) => ({ ...item, similarity }));
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
