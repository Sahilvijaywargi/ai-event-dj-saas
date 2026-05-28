"use client";

import { useEffect, useRef, useState } from "react";

type RuntimeState = {
  timestamp: string;
  unifiedConfidence: {
    unifiedConfidence: number;
    components: {
      transitionConfidence: number;
      crowdTrust: number;
      audioEngagement: number;
      recommendationHealth: number;
      playbackConsistency: number;
    };
  };
  stability: {
    value: number;
    reasons: string[];
  };
  autonomyReadiness: number;
  signalSummary: {
    autonomousLoopStatus: "running" | "stopped";
    transitionRiskLevel: "low" | "medium" | "high" | "n/a";
    crowdSentiment: number;
    audioEngagement: number;
    playbackSynced: boolean;
    recommendationFreshness: "fresh" | "stale" | "expired" | "unknown";
    safetyBlocked: boolean;
  };
  decision: {
    orchestrationPriority:
      | "stabilize_signals"
      | "refresh_recommendations"
      | "maintain_current_state"
      | "prepare_transition";
    activeRiskFactors: string[];
    signalConflicts: string[];
    operatorInterventions: string[];
  };
};

export function RuntimeIntelligenceCoordinatorPanel() {
  const [state, setState] = useState<RuntimeState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);

  async function refreshState() {
    if (isRefreshingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isRefreshingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/runtime-intelligence/state");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to load runtime intelligence.");
      if (isMountedRef.current) {
        setState(data.state ?? null);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load runtime intelligence.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }

  async function evaluateNow() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/runtime-intelligence/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistedAutonomousEnabled: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to evaluate runtime intelligence.");
      setState(data.state ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to evaluate runtime intelligence.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void refreshState();
    }, 0);
    const interval = setInterval(() => {
      void refreshState();
    }, 25000);
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <article
      id="runtime-intelligence-coordinator"
      className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Runtime Intelligence Coordinator</h2>
          <p className="mt-1 text-sm text-white/65">
            Unified runtime signal coordination for stable supervised orchestration decisions.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshState}
            disabled={isLoading}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Sync"}
          </button>
          <button
            onClick={evaluateNow}
            disabled={isLoading}
            className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
          >
            Evaluate
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Unified Confidence</p>
          <p className="mt-1 font-semibold">{state?.unifiedConfidence.unifiedConfidence ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Stability Score</p>
          <p className="mt-1 font-semibold">{state?.stability.value ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Autonomy Readiness</p>
          <p className="mt-1 font-semibold">{state?.autonomyReadiness ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Loop Status</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.autonomousLoopStatus ?? "stopped"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Priority</p>
          <p className="mt-1 font-semibold">{state?.decision.orchestrationPriority ?? "n/a"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Active Risk Factors</p>
          <ul className="mt-2 space-y-1">
            {(state?.decision.activeRiskFactors ?? []).slice(0, 6).map((factor) => (
              <li key={factor}>- {factor}</li>
            ))}
            {(state?.decision.activeRiskFactors ?? []).length === 0 ? (
              <li className="text-white/60">No active risk factors.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Signal Conflicts</p>
          <ul className="mt-2 space-y-1">
            {(state?.decision.signalConflicts ?? []).slice(0, 6).map((conflict) => (
              <li key={conflict}>- {conflict}</li>
            ))}
            {(state?.decision.signalConflicts ?? []).length === 0 ? (
              <li className="text-white/60">No signal conflicts detected.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Operator Interventions</p>
        <ul className="mt-2 space-y-1">
          {(state?.decision.operatorInterventions ?? []).slice(0, 6).map((item) => (
            <li key={item}>- {item}</li>
          ))}
          {(state?.decision.operatorInterventions ?? []).length === 0 ? (
            <li className="text-white/60">No operator interventions suggested.</li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}

