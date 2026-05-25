"use client";

import { useEffect, useState } from "react";

type SectionExplanation = {
  decisionReason: string;
  influencingSignals: string[];
  conflictingSignals: string[];
  recommendedOperatorActions: string[];
  suppressionRationale: string[];
  learnedMemorySignals?: string[];
  confidence: {
    score: number;
    rationale: string[];
  };
  risk: {
    level: string;
    rationale: string[];
  };
};

export function AiExplainabilityPanel() {
  const [runtime, setRuntime] = useState<SectionExplanation | null>(null);
  const [transition, setTransition] = useState<SectionExplanation | null>(null);
  const [autonomous, setAutonomous] = useState<SectionExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshExplainability() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [runtimeRes, transitionRes, loopRes] = await Promise.all([
        fetch("/api/explainability/runtime"),
        fetch("/api/explainability/transition?assisted=true"),
        fetch("/api/explainability/autonomous-loop"),
      ]);
      const runtimeData = await runtimeRes.json();
      const transitionData = await transitionRes.json();
      const loopData = await loopRes.json();
      if (!runtimeRes.ok) throw new Error(runtimeData.message ?? "Runtime explainability failed.");
      if (!transitionRes.ok)
        throw new Error(transitionData.message ?? "Transition explainability failed.");
      if (!loopRes.ok) throw new Error(loopData.message ?? "Autonomous explainability failed.");

      setRuntime(runtimeData.explanation ?? null);
      setTransition(transitionData.explanation ?? null);
      setAutonomous(loopData.explanation ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load explainability.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshExplainability();
    }, 0);
    const polling = setInterval(() => {
      void refreshExplainability();
    }, 8000);
    return () => {
      clearTimeout(timer);
      clearInterval(polling);
    };
  }, []);

  function renderSection(title: string, data: SectionExplanation | null) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">{title}</p>
        <p className="mt-1">{data?.decisionReason ?? "No explanation available."}</p>
        <p className="mt-1 text-white/70">
          Confidence: {data?.confidence.score ?? 0} | Risk: {data?.risk.level ?? "n/a"}
        </p>
        {(data?.influencingSignals ?? []).length ? (
          <ul className="mt-2 space-y-1 text-xs">
            {data?.influencingSignals.slice(0, 4).map((signal) => (
              <li key={signal}>- {signal}</li>
            ))}
          </ul>
        ) : null}
        {(data?.conflictingSignals ?? []).length ? (
          <p className="mt-2 text-amber-200">
            Conflicts: {data?.conflictingSignals.slice(0, 3).join(" | ")}
          </p>
        ) : null}
        {(data?.suppressionRationale ?? []).length ? (
          <p className="mt-1 text-red-200">
            Suppression: {data?.suppressionRationale.slice(0, 3).join(" | ")}
          </p>
        ) : null}
        {(data?.recommendedOperatorActions ?? []).length ? (
          <p className="mt-1 text-purple-100">
            Operator actions: {data?.recommendedOperatorActions.slice(0, 3).join(" | ")}
          </p>
        ) : null}
        {(data?.learnedMemorySignals ?? []).length ? (
          <p className="mt-1 text-sky-100">
            Learned memory: {data?.learnedMemorySignals?.slice(0, 3).join(" | ")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <article id="ai-explainability" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">AI Explainability</h2>
          <p className="mt-1 text-sm text-white/65">
            Traceable runtime reasoning summaries derived from live orchestration signals.
          </p>
        </div>
        <button
          onClick={refreshExplainability}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {renderSection("Runtime Orchestration", runtime)}
        {renderSection("Transition Reasoning", transition)}
        {renderSection("Autonomous Loop Reasoning", autonomous)}
      </div>
    </article>
  );
}

