const chatModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

export async function createChatCompletion(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { json?: boolean; temperature?: number } = {}
) {
  const apiKey = getApiKey();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: chatModel,
      temperature: options.temperature ?? 0.2,
      response_format: options.json ? { type: "json_object" } : undefined,
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI chat error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI chat response was empty.");
  }

  return content;
}

export async function createEmbeddings(inputs: string[]) {
  const apiKey = getApiKey();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: inputs
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding: number[]; index: number }>;
  };

  return (data.data || [])
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export function parseJson<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model did not return valid JSON.");
    }

    return JSON.parse(match[0]) as T;
  }
}

function getApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  return apiKey;
}
