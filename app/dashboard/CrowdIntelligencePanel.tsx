"use client";

import { useEffect, useState } from "react";

type CrowdFeedbackTimelineItem = {
  id: string;
  feedback_type: string;
  feedback_source: string;
  energy_impact: number;
  confidence_impact: number;
  created_at: string;
};

type CrowdSummary = {
  crowdSentiment: number;
  operatorInterventionRate: number;
  transitionTrustScore: number;
  energyAdaptationTrend: number;
  recentTimeline: CrowdFeedbackTimelineItem[];
};

export function CrowdIntelligencePanel() {
  const [summary, setSummary] = useState<CrowdSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshSummary() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/crowd-feedback/summary?limit=80");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to load crowd intelligence.");
      setSummary(data.summary ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load crowd intelligence.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshSummary();
    }, 0);
    const interval = setInterval(() => {
      void refreshSummary();
    }, 8000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <article id="crowd-intelligence" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Crowd Intelligence</h2>
          <p className="mt-1 text-sm text-white/65">
            Behavioral feedback trends powering adaptive transition trust and energy control.
          </p>
        </div>
        <button
          onClick={refreshSummary}
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

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Sentiment</p>
          <p className="mt-1 font-semibold">{summary?.crowdSentiment ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Operator Intervention</p>
          <p className="mt-1 font-semibold">{summary?.operatorInterventionRate ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Transition Trust</p>
          <p className="mt-1 font-semibold">{summary?.transitionTrustScore ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Energy Adaptation</p>
          <p className="mt-1 font-semibold">{summary?.energyAdaptationTrend ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-white/80">
        <p className="text-xs uppercase tracking-widest text-white/60">Recent Feedback Timeline</p>
        <div className="mt-2 space-y-1">
          {(summary?.recentTimeline ?? []).slice(0, 8).map((event) => (
            <div
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 p-2"
            >
              <p className="font-semibold">
                {event.feedback_type} ({event.feedback_source})
              </p>
              <p className="text-white/65">
                E:{event.energy_impact.toFixed(2)} C:{event.confidence_impact.toFixed(2)}
              </p>
            </div>
          ))}
          {(summary?.recentTimeline ?? []).length === 0 ? (
            <p className="text-white/60">No crowd feedback yet.</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

