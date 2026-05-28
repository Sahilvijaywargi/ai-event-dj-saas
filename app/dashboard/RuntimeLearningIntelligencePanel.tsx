"use client";

import { useEffect, useRef, useState } from "react";

type RuntimeLearningSignal = {
  source: string;
  signal: string;
  value: number;
  weight: number;
  polarity: "positive" | "negative" | "neutral";
};

type RuntimeMemoryPattern = {
  id: string;
  pattern_type: string;
  pattern_context: string;
  success_score: number;
  confidence_score: number;
  usage_count: number;
  reinforcement_state: "reinforced" | "neutral" | "decaying";
  learning_frozen: boolean;
  learned_signals: RuntimeLearningSignal[];
};

type RuntimeReinforcementAction =
  | "reinforce_pattern"
  | "penalize_pattern"
  | "reset_pattern_bias"
  | "freeze_pattern_learning"
  | "unfreeze_pattern_learning";

type RuntimeReversalAction =
  | "undo_reinforce_pattern"
  | "undo_penalize_pattern"
  | "undo_reset_pattern_bias"
  | "undo_freeze_pattern_learning"
  | "undo_unfreeze_pattern_learning";

type RuntimeReinforcementAudit = {
  id: string;
  pattern_id: string;
  action_type: RuntimeReinforcementAction | RuntimeReversalAction;
  previous_score: number;
  new_score: number;
  action_reason: string;
  reversed_by_audit_id?: string | null;
  reversal_reason?: string | null;
  created_at: string;
};

type RuntimeMemoryInsights = {
  successfulPatterns: RuntimeMemoryPattern[];
  failedPatterns: RuntimeMemoryPattern[];
  operatorAdaptationTrend: number;
  crowdAdaptationHistory: number;
  reinforcementStrength: number;
  frozenPatternCount: number;
  reversalEligibleCount: number;
  supervisedRationale: string[];
  learnedBiases: {
    transitionBias: number;
    energyBias: number;
    operatorBias: number;
    crowdBias: number;
    confidenceBias: number;
    rationale: string[];
  };
};

export function RuntimeLearningIntelligencePanel() {
  const [insights, setInsights] = useState<RuntimeMemoryInsights | null>(null);
  const [auditRows, setAuditRows] = useState<RuntimeReinforcementAudit[]>([]);
  const [reversalRows, setReversalRows] = useState<RuntimeReinforcementAudit[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);

  async function refreshInsights(applyDecay = false) {
    if (isRefreshingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isRefreshingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/runtime-memory/insights?limit=80${applyDecay ? "&applyDecay=true" : ""}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load runtime learning insights.");
      }
      if (isMountedRef.current) {
        setInsights(data.insights ?? null);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load runtime learning insights.",
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }

  async function applyAction(
    patternId: string,
    actionType: RuntimeReinforcementAction,
    reason: string,
  ) {
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/runtime-memory/reinforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patternId,
          actionType,
          actionReason: reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed supervised reinforcement action.");
      }
      await refreshInsights(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Supervised action failed.");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function undoLastAction(patternId?: string) {
    const confirmed = window.confirm(
      "Undo latest eligible supervised action? This creates a linked reversal audit entry.",
    );
    if (!confirmed) return;
    setIsActionLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/runtime-memory/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patternId,
          reversalReason: "Operator initiated safe bounded reversal",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to undo latest action.");
      }
      await Promise.all([refreshInsights(false), ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Undo failed.");
    } finally {
      setIsActionLoading(false);
    }
  }

useEffect(() => {
  isMountedRef.current = true;
  const timer = setTimeout(() => {
    void refreshInsights(false);
  }, 0);

  const interval = setInterval(() => {
    void refreshInsights(false);
  }, 45000);

  return () => {
    isMountedRef.current = false;
    clearTimeout(timer);
    clearInterval(interval);
  };
}, []);

  return (
    <article
      id="runtime-learning-intelligence"
      className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Runtime Learning Intelligence</h2>
          <p className="mt-1 text-sm text-white/65">
            Bounded adaptive memory for explainable orchestration learning and reinforcement.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refreshInsights(false)}
            disabled={isLoading}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => refreshInsights(true)}
            disabled={isLoading}
            className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
          >
            Apply Decay
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
          <p className="text-xs uppercase tracking-widest text-white/60">Reinforcement</p>
          <p className="mt-1 font-semibold">{insights?.reinforcementStrength ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Operator Adaptation</p>
          <p className="mt-1 font-semibold">{insights?.operatorAdaptationTrend ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Adaptation</p>
          <p className="mt-1 font-semibold">{insights?.crowdAdaptationHistory ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Success Patterns</p>
          <p className="mt-1 font-semibold">{insights?.successfulPatterns.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Failed Patterns</p>
          <p className="mt-1 font-semibold">{insights?.failedPatterns.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Frozen Patterns</p>
          <p className="mt-1 font-semibold">{insights?.frozenPatternCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Reversal Eligible</p>
          <p className="mt-1 font-semibold">{insights?.reversalEligibleCount ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Learned Orchestration Biases</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <p>Transition: {insights?.learnedBiases.transitionBias ?? 0}</p>
          <p>Energy: {insights?.learnedBiases.energyBias ?? 0}</p>
          <p>Operator: {insights?.learnedBiases.operatorBias ?? 0}</p>
          <p>Crowd: {insights?.learnedBiases.crowdBias ?? 0}</p>
          <p>Confidence: {insights?.learnedBiases.confidenceBias ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-emerald-100">
          <p className="text-xs uppercase tracking-widest text-emerald-200/80">Learned Successful Patterns</p>
          <ul className="mt-2 space-y-1">
            {(insights?.successfulPatterns ?? []).slice(0, 6).map((pattern) => (
              <li key={pattern.id}>
                {pattern.pattern_type} | {pattern.pattern_context} | score {pattern.success_score} | conf{" "}
                {pattern.confidence_score}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => undoLastAction(pattern.id)}
                    disabled={isActionLoading || !insights?.reversalEligibleCount}
                    className="rounded-full border border-amber-300/40 px-3 py-1 uppercase tracking-wide hover:bg-amber-500/10 disabled:opacity-60"
                  >
                    Undo Last
                  </button>
                  <button
                    onClick={() =>
                      applyAction(pattern.id, "reinforce_pattern", "Operator reinforced successful pattern")
                    }
                    disabled={isActionLoading}
                    className="rounded-full border border-emerald-300/40 px-3 py-1 uppercase tracking-wide hover:bg-emerald-500/10 disabled:opacity-60"
                  >
                    Reinforce
                  </button>
                  <button
                    onClick={() =>
                      applyAction(pattern.id, "penalize_pattern", "Operator penalized pattern performance")
                    }
                    disabled={isActionLoading || pattern.learning_frozen}
                    className="rounded-full border border-rose-300/40 px-3 py-1 uppercase tracking-wide hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    Penalize
                  </button>
                  <button
                    onClick={() =>
                      applyAction(pattern.id, "reset_pattern_bias", "Operator reset learned pattern bias")
                    }
                    disabled={isActionLoading}
                    className="rounded-full border border-white/30 px-3 py-1 uppercase tracking-wide hover:bg-white/10 disabled:opacity-60"
                  >
                    Reset Bias
                  </button>
                  <button
                    onClick={() =>
                      applyAction(
                        pattern.id,
                        pattern.learning_frozen ? "unfreeze_pattern_learning" : "freeze_pattern_learning",
                        pattern.learning_frozen
                          ? "Operator unfroze pattern learning"
                          : "Operator froze pattern learning",
                      )
                    }
                    disabled={isActionLoading}
                    className="rounded-full border border-sky-300/40 px-3 py-1 uppercase tracking-wide hover:bg-sky-500/10 disabled:opacity-60"
                  >
                    {pattern.learning_frozen ? "Unfreeze" : "Freeze"}
                  </button>
                </div>
              </li>
            ))}
            {(insights?.successfulPatterns ?? []).length === 0 ? (
              <li className="text-emerald-100/70">No successful patterns learned yet.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 text-sm text-rose-100">
          <p className="text-xs uppercase tracking-widest text-rose-200/80">Failed/Weak Patterns</p>
          <ul className="mt-2 space-y-1">
            {(insights?.failedPatterns ?? []).slice(0, 6).map((pattern) => (
              <li key={pattern.id}>
                {pattern.pattern_type} | {pattern.pattern_context} | score {pattern.success_score} | state{" "}
                {pattern.reinforcement_state}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => undoLastAction(pattern.id)}
                    disabled={isActionLoading || !insights?.reversalEligibleCount}
                    className="rounded-full border border-amber-300/40 px-3 py-1 uppercase tracking-wide hover:bg-amber-500/10 disabled:opacity-60"
                  >
                    Undo Last
                  </button>
                  <button
                    onClick={() =>
                      applyAction(pattern.id, "reinforce_pattern", "Operator attempted recovery reinforcement")
                    }
                    disabled={isActionLoading || pattern.learning_frozen}
                    className="rounded-full border border-emerald-300/40 px-3 py-1 uppercase tracking-wide hover:bg-emerald-500/10 disabled:opacity-60"
                  >
                    Reinforce
                  </button>
                  <button
                    onClick={() =>
                      applyAction(pattern.id, "penalize_pattern", "Operator penalized weak pattern")
                    }
                    disabled={isActionLoading || pattern.learning_frozen}
                    className="rounded-full border border-rose-300/40 px-3 py-1 uppercase tracking-wide hover:bg-rose-500/10 disabled:opacity-60"
                  >
                    Penalize
                  </button>
                  <button
                    onClick={() =>
                      applyAction(
                        pattern.id,
                        pattern.learning_frozen ? "unfreeze_pattern_learning" : "freeze_pattern_learning",
                        pattern.learning_frozen
                          ? "Operator unfroze weak pattern learning"
                          : "Operator froze weak pattern learning",
                      )
                    }
                    disabled={isActionLoading}
                    className="rounded-full border border-sky-300/40 px-3 py-1 uppercase tracking-wide hover:bg-sky-500/10 disabled:opacity-60"
                  >
                    {pattern.learning_frozen ? "Unfreeze" : "Freeze"}
                  </button>
                </div>
              </li>
            ))}
            {(insights?.failedPatterns ?? []).length === 0 ? (
              <li className="text-rose-100/70">No failed patterns observed.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Supervised Learning Rationale</p>
        <ul className="mt-2 space-y-1">
          {(insights?.supervisedRationale ?? []).map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Reinforcement Audit History</p>
        <ul className="mt-2 space-y-1">
          {auditRows.slice(0, 10).map((row) => (
            <li key={row.id}>
              {row.action_type} | score {row.previous_score} → {row.new_score} | {row.action_reason}
            </li>
          ))}
          {auditRows.length === 0 ? (
            <li className="text-white/60">No operator reinforcement actions logged yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Reversal History Timeline</p>
          <button
            onClick={() => undoLastAction(undefined)}
            disabled={isActionLoading || !insights?.reversalEligibleCount}
            className="rounded-full border border-amber-300/40 px-3 py-1 text-xs uppercase tracking-wide hover:bg-amber-500/10 disabled:opacity-60"
          >
            Undo Last Action
          </button>
        </div>
        <ul className="mt-2 space-y-1">
          {reversalRows.slice(0, 10).map((row) => (
            <li key={row.id}>
              {row.action_type} | {row.action_reason}
              {row.reversal_reason ? ` | rationale: ${row.reversal_reason}` : ""}
              {row.reversed_by_audit_id ? ` | linked reversal: ${row.reversed_by_audit_id}` : ""}
            </li>
          ))}
          {reversalRows.length === 0 ? (
            <li className="text-white/60">No reversals recorded yet.</li>
          ) : null}
        </ul>
        <p className="mt-2 text-xs text-white/60">
          Safety constraints: only latest unreversed operator action is eligible; reversals are linked audits, not history rewrites.
        </p>
      </div>
    </article>
  );
}

