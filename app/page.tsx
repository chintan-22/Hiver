"use client";

import { useState } from "react";
import type {
  EvaluationResult,
  RetrievedExample,
  RubricDimension
} from "@/lib/types";

type GenerateResponse = {
  reply: string;
  retrievedExamples: RetrievedExample[];
  evaluation: EvaluationResult;
};

const rubricLabels: Record<RubricDimension, string> = {
  relevance: "Relevance",
  tone: "Tone",
  groundedness: "Groundedness",
  completeness: "Completeness"
};

const rubricOrder: RubricDimension[] = [
  "relevance",
  "tone",
  "groundedness",
  "completeness"
];

export default function Home() {
  const [incomingEmail, setIncomingEmail] = useState("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incomingEmail })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to generate a reply.");
      }

      setResult(data);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to generate a reply."
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyReply() {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(result.reply);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-950 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            GroundedReply
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
            Draft support replies grounded in past conversations.
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            The app retrieves similar synthetic support exchanges, generates a
            suggested reply, and evaluates the answer with a quality rubric.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold">New incoming email</span>
            <textarea
              required
              value={incomingEmail}
              onChange={(event) => setIncomingEmail(event.target.value)}
              className="min-h-44 resize-y rounded-md border border-slate-300 px-3 py-3 text-sm leading-6 outline-none ring-cyan-500 transition focus:border-cyan-600 focus:ring-2"
              placeholder="Paste a customer email here..."
            />
          </label>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-cyan-700 px-5 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Generating..." : "Generate Reply"}
            </button>
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        </form>

        {loading ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white" />
            <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white" />
          </div>
        ) : null}

        {result && !loading ? (
          <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Suggested reply</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Combined live score:{" "}
                    <span className="font-semibold text-slate-800">
                      {result.evaluation.combinedScore.toFixed(1)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyReply}
                  className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold transition hover:bg-slate-50"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              <p className="mt-5 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                {result.reply}
              </p>

              <details className="mt-5 rounded-md border border-slate-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                  Retrieved examples used
                </summary>
                <div className="divide-y divide-slate-200">
                  {result.retrievedExamples.map((example) => (
                    <div key={example.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <span>{example.id}</span>
                        <span>{example.category.replace("_", " ")}</span>
                        <span>
                          similarity {(example.similarity * 100).toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-800">
                        Incoming
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {example.incoming_email}
                      </p>
                      <p className="mt-3 text-sm font-medium text-slate-800">
                        Sent reply
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {example.sent_reply}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </article>

            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Evaluation</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Semantic similarity is unavailable for live queries because
                there is no ground-truth sent reply. The live score uses the
                rubric scaled to 0-100.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Rubric average
                  </p>
                  <p className="mt-1 text-2xl font-semibold">
                    {result.evaluation.rubricAverage.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Similarity
                  </p>
                  <p className="mt-1 text-2xl font-semibold">N/A</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-md border border-slate-200">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-32 px-3 py-2 font-semibold">Metric</th>
                      <th className="w-16 px-3 py-2 font-semibold">Score</th>
                      <th className="px-3 py-2 font-semibold">Why</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rubricOrder.map((dimension) => (
                      <tr key={dimension} className="align-top">
                        <td className="px-3 py-3 font-medium">
                          {rubricLabels[dimension]}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {result.evaluation.rubric[dimension].score}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {result.evaluation.rubric[dimension].justification}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}
