"use client";

import { useMemo, useState } from "react";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { TransitionSimulationResult } from "@/lib/ai/transition-simulation";

type TransitionEnginePanelProps = {
  queueRecommendations: QueueRecommendationWithMeta[];
};

export function TransitionEnginePanel({ queueRecommendations }: TransitionEnginePanelProps) {
  const [assistedEnabled, setAssistedEnabled] = useState(false);
  const [evaluation, setEvaluation] = useState<TransitionEvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<TransitionSimulationResult | null>(null);

  const flattenedCount = useMemo(
    () => queueRecommendations.reduce((sum, item) => sum + (item.spotifyEnhancedRecommendations?.length ?? 0), 0),
    [queueRecommendations],
  );

  async function evaluateEngine() {
    setIsLoading(true);
    setErrorMessage(null);
    setExecutionMessage(null);
    try {
      const response = await fetch("/api/transition-engine/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistedAutonomousEnabled: assistedEnabled,
          queueRecommendations,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Transition evaluation failed.");
      setEvaluation(data.evaluation ?? null);
      setSimulation(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transition evaluation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function simulateTimeline() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/transition-engine/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistedAutonomousEnabled: assistedEnabled,
          queueRecommendations,
          evaluation,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Transition simulation failed.");
      setEvaluation(data.evaluation ?? evaluation);
      setSimulation(data.simulation ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transition simulation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function executePlan(mode: "review_only" | "execute") {
    if (!evaluation) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/transition-engine/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluation, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Transition execution failed.");
      setExecutionMessage(data.message ?? "Transition request completed.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transition execution failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <article id="transition-engine" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Transition Engine</h2>
          <p className="mt-1 text-sm text-white/65">
            Supervised semi-autonomous transition planning with guardrail-aware execution.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={assistedEnabled}
            onChange={(event) => setAssistedEnabled(event.target.checked)}
          />
          Assisted-autonomous mode
        </label>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Readiness</p>
          <p className="mt-1 font-semibold">{evaluation?.autonomousReadiness ?? "not evaluated"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Confidence</p>
          <p className="mt-1 font-semibold">{evaluation?.confidence.score ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Risk</p>
          <p className="mt-1 font-semibold">{evaluation?.riskLevel ?? "n/a"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">AI Tracks Available</p>
          <p className="mt-1 font-semibold">{flattenedCount}</p>
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}
      {executionMessage ? (
        <p className="mb-3 rounded-xl border border-purple-300/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-100">
          {executionMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={evaluateEngine}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isLoading ? "Evaluating..." : "Evaluate"}
        </button>
        <button
          onClick={() => executePlan("review_only")}
          disabled={isLoading || !evaluation}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          Review Only
        </button>
        <button
          onClick={simulateTimeline}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          Simulate x3
        </button>
        <button
          onClick={() => executePlan("execute")}
          disabled={isLoading || !evaluation || !assistedEnabled}
          className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
        >
          Execute Plan
        </button>
      </div>

      {evaluation ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Decision</p>
            <p className="mt-1">Should transition: {String(evaluation.decision.shouldTransition)}</p>
            <p>Hold: {String(evaluation.decision.holdEnergy)}</p>
            <p>Ramp: {String(evaluation.decision.rampEnergy)}</p>
            <p>Cooldown: {String(evaluation.decision.cooldownEnergy)}</p>
            <p className="mt-1 text-white/70">Reason: {evaluation.decision.reason}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Execution Plan</p>
            <p className="mt-1">Next action: {evaluation.executionPlan.nextAction}</p>
            <p>Target track: {evaluation.executionPlan.targetTrackLabel ?? "none"}</p>
            <p>Target phase: {evaluation.executionPlan.targetPhase}</p>
            <p>Target energy: {evaluation.executionPlan.targetEnergy.toFixed(2)}</p>
            <p>Target bpm: {evaluation.executionPlan.targetBpm}</p>
          </div>
        </div>
      ) : null}

      {simulation ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Simulation Timeline</p>
            <div className="mt-2 space-y-2">
              {simulation.timeline.steps.map((step) => (
                <div key={step.index} className="rounded-lg border border-white/10 bg-black/25 p-2">
                  <p className="font-semibold">
                    Step {step.index}: {step.predictedAction}
                  </p>
                  <p>Track: {step.predictedTrackLabel ?? "none"}</p>
                  <p>
                    Energy/BPM/Momentum: {step.projectedEnergy.toFixed(2)} / {step.projectedBpm} /{" "}
                    {step.projectedMomentum}
                  </p>
                  <p>
                    Confidence/Risk: {step.confidence}% / {step.riskLevel}
                  </p>
                  {step.interventionHint ? <p className="text-amber-200">Intervention: {step.interventionHint}</p> : null}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Projected Energy Curve</p>
              <div className="mt-2 flex items-end gap-2">
                {simulation.timeline.projectedEnergyCurve.map((value, index) => (
                  <div key={`energy-${index}`} className="flex-1">
                    <div
                      className="rounded-t bg-gradient-to-t from-purple-500/70 to-purple-200/80"
                      style={{ height: `${Math.max(value * 10, 16)}px` }}
                    />
                    <p className="mt-1 text-center text-[10px] text-white/65">{value.toFixed(1)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Projected BPM Evolution</p>
              <ul className="mt-2 space-y-1">
                {simulation.timeline.projectedBpmFlow.map((value, index) => (
                  <li key={`bpm-${index}`}>
                    Step {index + 1}: <span className="text-purple-200">{value} BPM</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-white/70">
                Confidence drift: {simulation.confidenceForecast.confidenceDrift.toFixed(2)} | Risk escalation:{" "}
                {simulation.riskForecast.escalationProbability.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

