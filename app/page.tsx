"use client";

import { useMemo, useState } from "react";
import type { CandidateResult, RubricDimension } from "@/lib/replyRubric";

const dimensions: Array<{ key: RubricDimension; label: string }> = [
  { key: "relevance", label: "Relevance" },
  { key: "tone", label: "Tone" },
  { key: "correctnessGroundedness", label: "Groundedness" },
  { key: "completeness", label: "Completeness" },
  { key: "conciseness", label: "Conciseness" }
];

const strategyLabels: Record<string, string> = {
  concise: "Concise",
  empathetic: "Empathetic",
  "policy-strict": "Policy-strict"
};

export default function Home() {
  const [customerEmail, setCustomerEmail] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedStrategy, setCopiedStrategy] = useState<string | null>(null);

  const hasResults = candidates.length > 0;
  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => b.overallScore - a.overallScore),
    [candidates]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setCopiedStrategy(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ customerEmail, contextNotes })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to generate replies.");
      }

      setCandidates(data.candidates || []);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to generate replies."
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyReply(candidate: CandidateResult) {
    await navigator.clipboard.writeText(candidate.reply);
    setCopiedStrategy(candidate.strategy);
    window.setTimeout(() => setCopiedStrategy(null), 1600);
  }

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Reply + Rubric
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            Generate customer replies, then measure their quality.
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Paste a customer email and optional policy notes. The app drafts
            three reply strategies, judges each against the same rubric, and
            highlights groundedness risks.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1.2fr_0.8fr]"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-800">
              Customer email
            </span>
            <textarea
              required
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              className="min-h-48 resize-y rounded-md border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none ring-blue-500 transition focus:border-blue-500 focus:ring-2"
              placeholder="Paste the customer message here..."
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-800">
              Context/policy notes
            </span>
            <textarea
              value={contextNotes}
              onChange={(event) => setContextNotes(event.target.value)}
              className="min-h-48 resize-y rounded-md border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none ring-blue-500 transition focus:border-blue-500 focus:ring-2"
              placeholder="Add approved facts, policy notes, order details, or leave blank..."
            />
          </label>

          <div className="flex flex-col gap-3 lg:col-span-2 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "Generating..." : "Generate + score"}
            </button>
            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </div>
        </form>

        {loading ? (
          <section className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-80 animate-pulse rounded-lg border border-slate-200 bg-white"
              />
            ))}
          </section>
        ) : null}

        {hasResults && !loading ? (
          <section className="grid gap-5 lg:grid-cols-3">
            {sortedCandidates.map((candidate) => (
              <article
                key={candidate.strategy}
                className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      {strategyLabels[candidate.strategy]}
                    </h2>
                    {candidate.hallucination ? (
                      <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Hallucination risk
                      </span>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">
                    {candidate.overallScore.toFixed(1)}
                  </span>
                </div>

                <p className="mt-5 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-800">
                  {candidate.reply}
                </p>

                <button
                  type="button"
                  onClick={() => copyReply(candidate)}
                  className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  {copiedStrategy === candidate.strategy ? "Copied" : "Copy"}
                </button>

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
                      {dimensions.map((dimension) => (
                        <tr key={dimension.key} className="align-top">
                          <td className="px-3 py-3 font-medium text-slate-800">
                            {dimension.label}
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-950">
                            {candidate.scores[dimension.key].score}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {candidate.scores[dimension.key].justification}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
