export async function createChatCompletion(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { json?: boolean; temperature?: number } = {}
) {
  return createChatCompletionWithRetry(messages, options, 0);
}

async function createChatCompletionWithRetry(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { json?: boolean; temperature?: number },
  attempt: number
) {
  const apiKey = getApiKey();
  const chatModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    const body = await response.text();
    if (response.status === 429 && attempt < 3) {
      await sleep(1000 * (attempt + 1));
      return createChatCompletionWithRetry(messages, options, attempt + 1);
    }

    throw new Error(`Groq chat error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Groq chat response was empty.");
  }

  return content;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set.");
  }

  return apiKey;
}
