"use client";

import { useMemo, useState } from "react";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { TransitionSimulationResult } from "@/lib/ai/transition-simulation";
import { analyzeRuntimeDrift } from "@/lib/ai/runtime-outcome-analysis";
import {
  buildConfidenceCalibrationSnapshot,
  recordCalibrationFromDrift,
} from "@/lib/ai/runtime-confidence-calibration";
import { buildRuntimeRecoverySnapshot } from "@/lib/ai/runtime-recovery-intelligence";
import { buildRuntimeNarrativeSnapshot } from "@/lib/ai/runtime-narrative-orchestration";
import type { RuntimeRecoveryExecutionContext } from "@/lib/ai/runtime-recovery-intelligence";
import type { OrchestrationRefinementResult } from "@/lib/ai/orchestration-refinement-types";
import type {
  ExecutionRuntimeState,
  OrchestrationEvaluationState,
  TransportRuntimeState,
} from "@/lib/transition-orchestration/layer-state";

type TransitionEnginePanelProps = {
  queueRecommendations: QueueRecommendationWithMeta[];
};

function readinessStyles(state: "ready" | "prepare" | "guarded" | "blocked" | null) {
  if (state === "ready") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  if (state === "prepare") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (state === "guarded") return "border-orange-400/30 bg-orange-500/10 text-orange-100";
  if (state === "blocked") return "border-red-400/30 bg-red-500/10 text-red-100";
  return "border-white/10 bg-black/35 text-white/80";
}

function freshnessStyles(state: "healthy" | "aging" | "stale" | "expired") {
  if (state === "healthy") return "text-emerald-200";
  if (state === "aging") return "text-amber-200";
  if (state === "stale") return "text-orange-200";
  return "text-red-200";
}

function djScoreStyles(score: number) {
  if (score >= 75) return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  if (score >= 58) return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  return "border-red-400/35 bg-red-500/10 text-red-100";
}

function djRiskStyles(risk: "safe" | "moderate" | "risky" | "dangerous") {
  if (risk === "safe") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  if (risk === "moderate") return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  if (risk === "risky") return "border-orange-400/35 bg-orange-500/10 text-orange-100";
  return "border-red-400/35 bg-red-500/10 text-red-100";
}

function normalizedSeverityStyles(severity?: string) {
  if (severity === "none") return "border-emerald-400/25 bg-emerald-500/5 text-emerald-100";
  if (severity === "low") return "border-cyan-300/25 bg-cyan-500/5 text-cyan-100";
  if (severity === "moderate") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (severity === "high") return "border-orange-400/35 bg-orange-500/10 text-orange-100";
  if (severity === "critical") return "border-red-400/40 bg-red-500/12 text-red-100";
  return "border-white/10 bg-black/35 text-white/80";
}

function learningBiasStyles(value: number) {
  if (value >= 1.2) return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  if (value <= -1.2) return "border-orange-400/35 bg-orange-500/10 text-orange-100";
  return "border-white/15 bg-black/30 text-white/90";
}

function learningRiskStyles(value: number) {
  if (value >= 0.45) return "border-red-400/35 bg-red-500/10 text-red-100";
  if (value >= 0.2) return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  if (value <= -0.2) return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  return "border-white/15 bg-black/30 text-white/90";
}

function stabilizationPriorityStyles(value: number) {
  if (value >= 72) return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  if (value >= 56) return "border-cyan-300/30 bg-cyan-500/8 text-cyan-100";
  return "border-emerald-400/30 bg-emerald-500/8 text-emerald-100";
}

function escalationClampStyles(value: number) {
  if (value <= 0.32) return "border-orange-400/35 bg-orange-500/10 text-orange-100";
  if (value <= 0.42) return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
}

function deriveAdaptiveLearningInterpretation(input: {
  confidenceBias: number;
  riskBias: number;
  stabilizationPriority: number;
  escalationClamp: number;
}) {
  if (input.riskBias >= 0.45 || input.escalationClamp <= 0.3) {
    return "Operator correction pressure detected.";
  }
  if (input.stabilizationPriority >= 72) {
    return "Execution stabilization priority elevated.";
  }
  if (input.confidenceBias >= 1 && input.riskBias <= 0.2) {
    return "Adaptive trust cautiously improving.";
  }
  return "Learning influence currently minimal.";
}

function simulationActionStyles(action: string) {
  if (action === "proceed_supervised") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  if (action === "stabilize_first" || action === "reduce_energy") return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  if (action === "require_operator_review") return "border-orange-400/35 bg-orange-500/10 text-orange-100";
  return "border-red-400/35 bg-red-500/10 text-red-100";
}

export function TransitionEnginePanel({ queueRecommendations }: TransitionEnginePanelProps) {
  const [assistedEnabled, setAssistedEnabled] = useState(false);
  const [orchestrationEvaluationState, setOrchestrationEvaluationState] =
    useState<OrchestrationEvaluationState | null>(null);
  const [transportRuntimeState, setTransportRuntimeState] = useState<TransportRuntimeState | null>(null);
  const [executionRuntimeState, setExecutionRuntimeState] = useState<ExecutionRuntimeState | null>(null);
  const evaluation = orchestrationEvaluationState?.evaluation ?? null;
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPreparingWindow, setIsPreparingWindow] = useState(false);
  const [isPreparingQueue, setIsPreparingQueue] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<TransitionSimulationResult | null>(null);
  const [transportResult, setTransportResult] = useState<{
    success: boolean;
    mutationType: string;
    executionSafety: string;
    rollbackPrepared: boolean;
    synchronizationHealth: string;
    blockers: string[];
    warnings: string[];
    explainability: string[];
    recoverySuggested: boolean;
    data?: Record<string, unknown>;
    state?: {
      executionHealthClassification?: string;
      executionStabilityScore?: number;
      transportIntegrityScore?: number;
      mutationRecoverabilityScore?: number;
      degradationSeverity?: string;
      mutationLifecycle?: { state?: string };
      mutationVerification?: {
        verificationScore?: number;
        verificationConfidence?: number;
        passed?: boolean;
        retriable?: boolean;
        instabilityDetected?: boolean;
        reasons?: string[];
      };
      rollbackConfidence?: number;
      rollbackIntegrityScore?: number;
      rollbackAllowed?: boolean;
      restorationFeasibility?: number;
      rollbackBlockers?: string[];
      mutationHeartbeat?: {
        heartbeatStatus?: string;
        mutationHealthScore?: number;
        mutationDriftScore?: number;
        transportFreshnessScore?: number;
        propagationDelayMs?: number;
        reasoning?: string[];
      };
      graceState?: string;
      graceFailure?: boolean;
      graceConfidencePenalty?: number;
      freshnessGrace?: {
        graceWindowMs?: number;
        graceRemainingMs?: number;
        reasons?: string[];
      };
      mutationAuditTrail?: Array<{
        lifecycleState?: string;
        degradationReasons?: string[];
        verificationOutcome?: {
          verificationState?: string;
          verificationScore?: number;
        };
        heartbeatDiagnostics?: { heartbeatStatus?: string };
      }>;
      runtimeObservabilitySummary?: string[];
    };
  } | null>(null);
  const [adaptiveRefinement, setAdaptiveRefinement] = useState<OrchestrationRefinementResult | null>(null);
  const [reinforcement, setReinforcement] = useState<{
    reinforcementType: "reinforce" | "penalize" | "neutral";
    reinforcementStrength: number;
    reinforcementReason: string;
    confidenceAdjustment: number;
    riskAdjustment: number;
    continuityScore: number;
    stabilityScore: number;
    orchestrationSignature: string;
    telemetry: {
      successfulSimulationCount: number;
      riskySimulationCount: number;
      strongestReinforcedSignature: string;
      weakestOrchestrationPattern: string;
      continuityAverage: number;
      stabilityAverage: number;
    };
  } | null>(null);

  const flattenedCount = useMemo(
    () =>
      queueRecommendations.reduce(
        (sum, item) =>
          sum +
          Math.max(
            item.recommendedQueue?.length ?? 0,
            item.spotifyEnhancedRecommendations?.length ?? 0,
          ),
        0,
      ),
    [queueRecommendations],
  );
  const supervisionWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (transportRuntimeState) {
      if (
        transportRuntimeState.transportFreshness === "stale" ||
        transportRuntimeState.transportFreshness === "expired"
      ) {
        warnings.push("[Transport] Playback telemetry freshness degraded.");
      }
      if (transportRuntimeState.deviceSynchronizationConfidence < 50) {
        warnings.push("[Transport] Device synchronization unstable.");
      }
      if (transportRuntimeState.runtimeReconciliationStatus === "failed") {
        warnings.push("[Transport] Runtime reconciliation failed.");
      }
    }
    if (evaluation) {
      if (evaluation.executionReadiness === "blocked") {
        warnings.push("[Orchestration] Musical execution readiness blocked.");
      }
      if (evaluation.operatorAttentionRequired) {
        warnings.push("[Orchestration] High operator attention required for transition plan.");
      }
      if ((simulation?.timeline.steps?.filter((step) => step.executionStrategy === "fast_cut").length ?? 0) >= 2) {
        warnings.push("[Orchestration] Repeated fast_cut instability detected in simulation.");
      }
      if (evaluation.rollbackSafetyMargin < 42) {
        warnings.push("[Orchestration] Transition rollback margin insufficient for aggressive mix.");
      }
    }
    if (adaptiveRefinement?.adaptationWarnings.length) {
      for (const warning of adaptiveRefinement.adaptationWarnings.slice(0, 4)) {
        warnings.push(`[Adaptive] ${warning}`);
      }
    }
    return warnings;
  }, [evaluation, simulation, transportRuntimeState, adaptiveRefinement]);
  const playbackFreshnessState: "healthy" | "aging" | "stale" | "expired" =
    transportRuntimeState?.transportFreshness ?? "healthy";
  const runtimeSimulationObservability = useMemo(() => {
    if (!simulation || !evaluation) return null;
    const avgExecutionStability =
      simulation.timeline.projectedExecutionStability.reduce((sum, value) => sum + value, 0) /
      Math.max(simulation.timeline.projectedExecutionStability.length, 1);
    const avgProjectedConfidence =
      simulation.confidenceForecast.projectedConfidenceSeries.reduce((sum, value) => sum + value, 0) /
      Math.max(simulation.confidenceForecast.projectedConfidenceSeries.length, 1);
    const predictedTransitionSuccess = Math.min(
      100,
      Math.max(
        0,
        Number(
          (
            avgProjectedConfidence * 0.45 +
            avgExecutionStability * 0.2 +
            (100 - simulation.riskForecast.escalationProbability) * 0.2 +
            evaluation.transitionDiagnostics.compatibilityScore * 0.15
          ).toFixed(2),
        ),
      ),
    );
    const predictedCrowdRecovery = Math.min(
      100,
      Math.max(
        0,
        Number((evaluation.crowdRecoveryConfidence * 0.6 + evaluation.narrativeContinuity * 0.25 + avgExecutionStability * 0.15).toFixed(2)),
      ),
    );
    const predictedExecutionStability = Math.min(100, Math.max(0, Number(avgExecutionStability.toFixed(2))));
    const predictedEnergyFlow = Math.min(
      100,
      Math.max(
        0,
        Number(
          (
            evaluation.transitionDiagnostics.compatibilityEnergyFlowScore * 0.55 +
            evaluation.narrativeEnergyArc * 0.2 +
            evaluation.emotionalContinuity * 0.25
          ).toFixed(2),
        ),
      ),
    );
    const predictedRecoveryPressure = Math.min(
      100,
      Math.max(
        0,
        Number(
          (
            (100 - predictedCrowdRecovery) * 0.45 +
            simulation.riskForecast.escalationProbability * 0.3 +
            Math.max(0, 65 - predictedExecutionStability) * 0.25
          ).toFixed(2),
        ),
      ),
    );
    const predictedRiskShift = Number(
      Math.max(
        -100,
        Math.min(
          100,
          (
            simulation.riskForecast.escalationProbability * 0.8 +
            (evaluation.transitionDiagnostics.compatibilityRiskLevel === "dangerous"
              ? 25
              : evaluation.transitionDiagnostics.compatibilityRiskLevel === "risky"
                ? 12
                : evaluation.transitionDiagnostics.compatibilityRiskLevel === "moderate"
                  ? 4
                  : -6) -
            (100 - evaluation.confidence.score) * 0.35
          ),
        ),
      ).toFixed(2),
    );
    const recommendedAction =
      predictedTransitionSuccess < 45 || predictedExecutionStability < 50 || predictedRiskShift > 40
        ? "reject_transition"
        : predictedTransitionSuccess < 58 || predictedRecoveryPressure > 65
          ? "require_operator_review"
          : predictedEnergyFlow < 56
            ? "reduce_energy"
            : predictedRecoveryPressure > 52
              ? "stabilize_first"
              : "proceed_supervised";
    const interpretation =
      recommendedAction === "proceed_supervised"
        ? "Simulation predicts stable supervised execution."
        : recommendedAction === "require_operator_review"
          ? "Recovery burden elevated under current transport conditions."
          : recommendedAction === "reduce_energy"
            ? "Predicted vocal/energy pressure may destabilize continuity."
            : recommendedAction === "stabilize_first"
              ? "Simulation recommends stabilization before transition."
              : "Simulation recommends operator review with transition rejection bias.";
    const reasoning = Array.from(
      new Set(
        [
          ...simulation.riskForecast.riskReasons,
          reinforcement?.reinforcementReason,
          `Projected confidence drift: ${simulation.confidenceForecast.confidenceDrift.toFixed(2)}.`,
          `Projected execution stability: ${predictedExecutionStability.toFixed(2)}.`,
          `Recommended action: ${recommendedAction.replace(/_/g, " ")}.`,
        ].filter((line): line is string => typeof line === "string" && line.trim().length > 0),
      ),
    );
    return {
      predictedTransitionSuccess,
      predictedCrowdRecovery,
      predictedExecutionStability,
      predictedRiskShift,
      predictedEnergyFlow,
      predictedRecoveryPressure,
      recommendedAction,
      interpretation,
      reasoning,
    };
  }, [simulation, evaluation, reinforcement]);
  const runtimeSimulationDrift = useMemo(() => {
    if (!runtimeSimulationObservability || !evaluation) return null;
    const predictedRollbackRisk = runtimeSimulationObservability.predictedRiskShift >= 30 ? 80 : runtimeSimulationObservability.predictedRiskShift >= 10 ? 55 : 24;
    const predictedHeartbeatDegradation = Math.max(0, Math.min(100, 100 - runtimeSimulationObservability.predictedExecutionStability));
    const predictedTransportStability = Math.max(
      0,
      Math.min(
        100,
        evaluation.transportStability * 0.56 + runtimeSimulationObservability.predictedExecutionStability * 0.44,
      ),
    );
    const actualRecoveryPressure = Math.max(
      0,
      Math.min(
        100,
        evaluation.narrativeRecoveryPressure * 0.55 + (100 - evaluation.rollbackReadiness) * 0.45,
      ),
    );
    const actualExecutionStability = Math.max(
      0,
      Math.min(
        100,
        evaluation.orchestrationStability * 0.5 + evaluation.executionReadinessScore * 0.5,
      ),
    );
    const actualHeartbeatDegradation = Math.max(0, Math.min(100, 100 - evaluation.heartbeatContinuity + evaluation.heartbeatDrift * 0.5));
    const actualTransportStability = Math.max(0, Math.min(100, evaluation.transportStability));
    return analyzeRuntimeDrift({
      prediction: {
        predictedConfidence: runtimeSimulationObservability.predictedTransitionSuccess,
        predictedTransitionQuality: runtimeSimulationObservability.predictedTransitionSuccess,
        predictedRecoveryPressure: runtimeSimulationObservability.predictedRecoveryPressure,
        predictedExecutionStability: runtimeSimulationObservability.predictedExecutionStability,
        predictedRollbackRisk,
        predictedHeartbeatDegradation,
        predictedTransportStability,
        predictedEnergyFlow: runtimeSimulationObservability.predictedEnergyFlow,
      },
      actual: {
        actualConfidence: evaluation.confidence.score,
        actualTransitionQuality: Math.max(
          0,
          Math.min(
            100,
            evaluation.transitionDiagnostics.compatibilityScore * 0.5 + evaluation.executionReadinessScore * 0.5,
          ),
        ),
        actualRecoveryPressure,
        actualExecutionStability,
        rollbackTriggered: evaluation.rollbackReadiness < 40 || evaluation.executionReadiness === "blocked",
        actualHeartbeatDegradation,
        actualTransportStability,
        actualEnergyFlow: evaluation.transitionDiagnostics.compatibilityEnergyFlowScore,
      },
    });
  }, [runtimeSimulationObservability, evaluation]);
  const runtimeConfidenceCalibration = useMemo(() => {
    if (!runtimeSimulationDrift || !evaluation) return null;
    recordCalibrationFromDrift({
      userId: "transition-engine-replay",
      drift: runtimeSimulationDrift,
      rawOrchestrationConfidence: evaluation.confidence.score,
    });
    return buildConfidenceCalibrationSnapshot({
      userId: "transition-engine-replay",
      rawOrchestrationConfidence: evaluation.confidence.score,
      latestDrift: runtimeSimulationDrift,
    });
  }, [runtimeSimulationDrift, evaluation]);
  const runtimeRecoveryIntelligence = useMemo(() => {
    if (!runtimeSimulationDrift || !evaluation) return null;
    return buildRuntimeRecoverySnapshot({
      signalSummary: {
        executionReadinessScore: evaluation.executionReadinessScore,
        heartbeatContinuity: evaluation.heartbeatContinuity,
        transportStability: evaluation.transportStability,
        deviceSynchronizationConfidence: evaluation.deviceSynchronizationConfidence,
        narrativeEnergyArc: evaluation.narrativeEnergyArc,
        narrativeContinuity: evaluation.narrativeContinuity,
        narrativeFatigueRisk: evaluation.narrativeFatigueRisk,
        narrativeRecoveryPressure: evaluation.narrativeRecoveryPressure,
        narrativeTension: evaluation.narrativeTension,
        narrativeResolutionConfidence: evaluation.narrativeResolutionConfidence,
        crowdMomentumScore: evaluation.crowdMomentumScore,
        crowdEngagementConfidence: evaluation.crowdEngagementConfidence,
        cadenceEscalationPressure: evaluation.cadenceEscalationPressure,
        cadenceFatigueLoad: evaluation.cadenceFatigueLoad,
        orchestrationAlignment: evaluation.orchestrationAlignment,
        orchestrationStability: evaluation.orchestrationStability,
        orchestrationContinuityPriority: evaluation.orchestrationContinuityPriority,
      },
      playbackExecution: {
        executionStabilityScore: evaluation.executionReadinessScore,
        transportIntegrityScore: evaluation.transportStability,
        rollbackIntegrity: evaluation.rollbackReadiness,
        rollbackAllowed: evaluation.rollbackReadiness >= 40,
        retriableVerificationFailure: evaluation.executionBlockers.includes("stale_telemetry"),
        queueVerificationPassed: evaluation.executionReadiness === "ready",
        mutationState: evaluation.executionReadiness === "blocked" ? "rollback_ready" : "verifying",
        degradationSeverity:
          evaluation.executionReadiness === "blocked"
            ? "high"
            : evaluation.riskLevel === "high"
              ? "moderate"
              : "low",
        executionHealthClassification:
          evaluation.executionReadiness === "blocked"
            ? "rollback_sensitive"
            : evaluation.riskLevel === "high"
              ? "degraded"
              : "stabilizing",
      },
      calibrationSnapshot: runtimeConfidenceCalibration ?? undefined,
    });
  }, [runtimeSimulationDrift, evaluation, runtimeConfidenceCalibration]);
  const runtimeNarrativeOrchestration = useMemo(() => {
    if (!evaluation) return null;
    return buildRuntimeNarrativeSnapshot({
      signals: {
        narrativeFlowState: evaluation.narrativeFlowState,
        narrativeMomentum: evaluation.narrativeMomentum,
        narrativeTension: evaluation.narrativeTension,
        narrativeRecoveryPressure: evaluation.narrativeRecoveryPressure,
        narrativeContinuity: evaluation.narrativeContinuity,
        narrativeEnergyArc: evaluation.narrativeEnergyArc,
        narrativeFatigueRisk: evaluation.narrativeFatigueRisk,
        narrativeProgressionConfidence: evaluation.narrativeProgressionConfidence,
        narrativeJourneyAlignment: evaluation.narrativeJourneyAlignment,
        narrativeResolutionConfidence: evaluation.narrativeResolutionConfidence,
        crowdMomentumScore: evaluation.crowdMomentumScore,
        crowdFatiguePressure: evaluation.crowdFatiguePressure,
        crowdHypeSaturation: evaluation.crowdHypeSaturation,
        crowdEnergyVolatility: evaluation.crowdEnergyVolatility,
        cadenceState: evaluation.cadenceState,
        cadenceDensity: evaluation.cadenceDensity,
        cadenceAggression: evaluation.cadenceAggression,
        cadenceRecoverySpacing: evaluation.cadenceRecoverySpacing,
        cadenceEscalationPressure: evaluation.cadenceEscalationPressure,
        cadenceBreathingRoom: evaluation.cadenceBreathingRoom,
        cadenceStability: evaluation.cadenceStability,
        cadenceFatigueLoad: evaluation.cadenceFatigueLoad,
        cadenceNarrativeBalance: evaluation.cadenceNarrativeBalance,
        orchestrationAlignment: evaluation.orchestrationAlignment,
        orchestrationStability: evaluation.orchestrationStability,
        orchestrationConflictPressure: evaluation.orchestrationConflictPressure,
        transitionEnergyFlowScore: evaluation.transitionDiagnostics.compatibilityEnergyFlowScore,
        transitionCompatibilityScore: evaluation.transitionDiagnostics.compatibilityScore,
      },
      recoverySnapshot: runtimeRecoveryIntelligence ?? undefined,
      calibrationSnapshot: runtimeConfidenceCalibration ?? undefined,
    });
  }, [evaluation, runtimeRecoveryIntelligence, runtimeConfidenceCalibration]);

  async function evaluateEngine() {
    console.log("[ACTION] evaluate started");
    setIsEvaluating(true);
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
      const nextOrchestration =
        data.orchestrationEvaluation ??
        (data.evaluation
          ? {
              stateOrigin: "orchestration_evaluation" as const,
              updatedAt: new Date().toISOString(),
              evaluation: data.evaluation as TransitionEvaluationResult,
            }
          : null);
      setOrchestrationEvaluationState(nextOrchestration);
      console.log("[EVALUATION] orchestration recomputed");
      setSimulation(null);
      setTransportResult(null);
      setExecutionRuntimeState(null);
      setAdaptiveRefinement(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transition evaluation failed.");
    } finally {
      setIsEvaluating(false);
      console.log("[ACTION] evaluate finalized");
    }
  }

  async function simulateTimeline() {
    console.log("[ACTION] simulate started");
    setIsSimulating(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/transition-engine/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistedAutonomousEnabled: assistedEnabled,
          queueRecommendations,
          evaluation,
          transportRuntime: transportRuntimeState,
          executionRuntime: executionRuntimeState,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Transition simulation failed.");
      if (data.orchestrationEvaluation) {
        setOrchestrationEvaluationState(data.orchestrationEvaluation);
      } else if (data.evaluation) {
        setOrchestrationEvaluationState({
          stateOrigin: "orchestration_evaluation",
          updatedAt: new Date().toISOString(),
          evaluation: data.evaluation,
        });
      }
      setSimulation(data.simulation ?? null);
      setReinforcement(data.reinforcement ?? null);
      setAdaptiveRefinement(data.adaptiveRefinement ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transition simulation failed.");
    } finally {
      setIsSimulating(false);
      console.log("[ACTION] simulate finalized");
    }
  }

  async function executePlan(mode: "review_only" | "execute") {
    if (!evaluation) return;
    console.log(`[ACTION] execute plan started (${mode})`);
    setIsExecuting(true);
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
      setIsExecuting(false);
      console.log(`[ACTION] execute plan finalized (${mode})`);
    }
  }

  async function prepareTransport(queueTrack: boolean, recoveryMode = false) {
    if (!evaluation && !recoveryMode) return;

    const setBusy = recoveryMode
      ? setIsRecovering
      : queueTrack
        ? setIsPreparingQueue
        : setIsPreparingWindow;
    const actionLabel = recoveryMode
      ? "recover sync"
      : queueTrack
        ? "prepare queue"
        : "prepare window";

    console.log(`[ACTION] ${actionLabel} started`);
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/transport/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          recoveryMode
            ? { recoveryMode: true }
            : {
                queueTrack,
                recoveryMode: false,
                evaluation,
              },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Transport preparation failed.");

      if (data.transportRuntime) {
        setTransportRuntimeState(data.transportRuntime);
        if (recoveryMode) {
          console.log("[TRANSPORT] runtime recovery updated");
        } else {
          console.log("[TRANSPORT] transport runtime updated");
        }
      }

      if (recoveryMode) {
        const baseResult = data.recovery ?? null;
        setTransportResult(
          baseResult
            ? {
                ...baseResult,
                state: undefined,
              }
            : null,
        );
        return;
      }

      const baseResult = data.result ?? null;
      setTransportResult(baseResult ? { ...baseResult, state: data.state ?? baseResult.state } : null);
      if (data.executionRuntime) {
        setExecutionRuntimeState(data.executionRuntime);
        console.log("[EXECUTION] lifecycle updated");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transport preparation failed.");
    } finally {
      setBusy(false);
      console.log(`[ACTION] ${actionLabel} finalized`);
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

      <div className="mb-4 space-y-3">
        <div className="rounded-xl border border-amber-300/25 bg-amber-500/5 p-4">
          <p className="text-xs uppercase tracking-widest text-amber-100/80">Transport Runtime</p>
          <p className="mt-1 text-xs text-white/55">
            Can the runtime safely communicate with playback? (device sync, telemetry, reconciliation)
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Transport Freshness</p>
              <p className={`mt-1 font-semibold capitalize ${freshnessStyles(playbackFreshnessState)}`}>
                {transportRuntimeState?.transportFreshness ?? "unknown"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Heartbeat Continuity</p>
              <p className="mt-1 font-semibold">
                {transportRuntimeState?.heartbeatContinuity?.toFixed(0) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Device Sync</p>
              <p className="mt-1 font-semibold capitalize">
                {transportRuntimeState?.deviceSyncHealth ?? "unknown"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Reconciliation</p>
              <p className="mt-1 font-semibold capitalize">
                {transportRuntimeState?.runtimeReconciliationStatus ?? "unknown"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Rollback Continuity</p>
              <p className="mt-1 font-semibold">
                {transportRuntimeState?.rollbackContinuityScore?.toFixed(0) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Queue Continuity</p>
              <p className="mt-1 font-semibold">
                {transportRuntimeState?.queueContinuityScore?.toFixed(0) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Transport Stability</p>
              <p className="mt-1 font-semibold">
                {transportRuntimeState?.transportStability?.toFixed(0) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Sync Confidence</p>
              <p className="mt-1 font-semibold">
                {transportRuntimeState?.deviceSynchronizationConfidence?.toFixed(0) ?? "—"}%
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-violet-300/25 bg-violet-500/5 p-4">
          <p className="text-xs uppercase tracking-widest text-violet-100/80">Orchestration Evaluation</p>
          <p className="mt-1 text-xs text-white/55">
            Should the AI execute this transition musically? (compatibility, strategy, crowd, confidence)
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Readiness</p>
              <p className="mt-1 font-semibold">{evaluation?.autonomousReadiness ?? "not evaluated"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Confidence</p>
              <p className="mt-1 font-semibold">{evaluation?.confidence.score ?? "—"}%</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Transition Risk</p>
              <p className="mt-1 font-semibold">{evaluation?.riskLevel ?? "n/a"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Compatibility</p>
              <p className="mt-1 font-semibold">
                {evaluation?.transitionDiagnostics.compatibilityScore?.toFixed(0) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Phrase Alignment</p>
              <p className="mt-1 font-semibold">
                {evaluation?.transitionDiagnostics.phraseAlignmentScore?.toFixed(0) ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Execution Strategy</p>
              <p className="mt-1 font-semibold capitalize">
                {evaluation?.executionStrategy?.replace(/_/g, " ") ?? "n/a"}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">AI Tracks Available</p>
              <p className="mt-1 font-semibold">{flattenedCount}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Recommendation</p>
              <p className="mt-1 font-semibold capitalize">
                {evaluation?.decision.shouldTransition ? "transition" : "hold"}
              </p>
            </div>
          </div>
        </div>

        {executionRuntimeState || transportResult?.state ? (
          <div className="rounded-xl border border-purple-300/25 bg-purple-500/5 p-4">
            <p className="text-xs uppercase tracking-widest text-purple-100/80">Live Execution Runtime</p>
            <p className="mt-1 text-xs text-white/55">
              Mutation lifecycle, verification, rollback readiness, stabilization
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                <p className="text-xs uppercase tracking-widest text-white/60">Lifecycle</p>
                <p className="mt-1 font-semibold capitalize">
                  {executionRuntimeState?.lifecycleState ??
                    transportResult?.state?.mutationLifecycle?.state ??
                    "—"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                <p className="text-xs uppercase tracking-widest text-white/60">Verification</p>
                <p className="mt-1 font-semibold">
                  {executionRuntimeState?.verificationScore?.toFixed(0) ??
                    transportResult?.state?.mutationVerification?.verificationScore?.toFixed(0) ??
                    "—"}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                <p className="text-xs uppercase tracking-widest text-white/60">Rollback Ready</p>
                <p className="mt-1 font-semibold">
                  {String(
                    executionRuntimeState?.rollbackAllowed ??
                      transportResult?.state?.rollbackAllowed ??
                      false,
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                <p className="text-xs uppercase tracking-widest text-white/60">Mutation Health</p>
                <p className="mt-1 font-semibold">
                  {executionRuntimeState?.mutationHealthScore?.toFixed(0) ??
                    transportResult?.state?.mutationHeartbeat?.mutationHealthScore?.toFixed(0) ??
                    "—"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {supervisionWarnings.length > 0 ? (
        <div className="mb-3 rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <p className="text-xs uppercase tracking-widest text-red-200/85">Operator Supervision Warnings</p>
          <ul className="mt-2 space-y-1">
            {supervisionWarnings.slice(0, 6).map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
          disabled={isEvaluating}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isEvaluating ? "Evaluating..." : "Evaluate"}
        </button>
        <button
          onClick={() => executePlan("review_only")}
          disabled={isExecuting || !evaluation}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isExecuting ? "Reviewing..." : "Review Only"}
        </button>
        <button
          onClick={simulateTimeline}
          disabled={isSimulating}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isSimulating ? "Simulating..." : "Simulate x3"}
        </button>
        <button
          onClick={() => executePlan("execute")}
          disabled={isExecuting || !evaluation || !assistedEnabled}
          className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
        >
          {isExecuting ? "Executing..." : "Execute Plan"}
        </button>
        <button
          onClick={() => prepareTransport(false, false)}
          disabled={isPreparingWindow || !evaluation}
          className="rounded-full border border-sky-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-sky-100 hover:bg-sky-500/10 disabled:opacity-60"
        >
          {isPreparingWindow ? "Preparing..." : "Prepare Window"}
        </button>
        <button
          onClick={() => prepareTransport(true, false)}
          disabled={isPreparingQueue || !evaluation}
          className="rounded-full border border-cyan-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-60"
        >
          {isPreparingQueue ? "Preparing..." : "Prepare Queue"}
        </button>
        <button
          onClick={() => prepareTransport(false, true)}
          disabled={isRecovering}
          className="rounded-full border border-amber-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-100 hover:bg-amber-500/10 disabled:opacity-60"
        >
          {isRecovering ? "Recovering..." : "Recover Sync"}
        </button>
      </div>

      {evaluation ? (
        <div className="mt-4 space-y-3">
          {transportResult ? (
            <div
              className={`rounded-xl border p-3 text-sm ${
                transportResult.state?.degradationSeverity
                  ? normalizedSeverityStyles(transportResult.state.degradationSeverity)
                  : transportResult.executionSafety === "safe"
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                    : transportResult.executionSafety === "guarded"
                      ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                      : "border-red-400/30 bg-red-500/10 text-red-100"
              }`}
            >
              <p className="text-xs uppercase tracking-widest">Transport Preparation</p>
              <p className="mt-1 font-semibold">
                {transportResult.mutationType} | {transportResult.executionSafety} | sync{" "}
                {transportResult.synchronizationHealth}
              </p>
              <p className="text-xs">
                Rollback prepared: {String(transportResult.rollbackPrepared)} | Recovery suggested:{" "}
                {String(transportResult.recoverySuggested)}
              </p>
              <p className="mt-1 text-xs">
                Blockers:{" "}
                {transportResult.blockers.length
                  ? transportResult.blockers.map((item) => item.replace(/_/g, " ")).join(", ")
                  : "none"}
              </p>
              <p className="text-xs">
                Warnings:{" "}
                {transportResult.warnings.length
                  ? transportResult.warnings.map((item) => item.replace(/_/g, " ")).join(", ")
                  : "none"}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {transportResult.explainability.slice(0, 4).map((reason, index) => (
                  <li key={`${reason}-${index}`}>- {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {transportResult?.state ? (
            <>
              <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
                <p className="text-xs uppercase tracking-widest text-white/60">TRANSPORT MUTATION HEALTH</p>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <p>Health: {transportResult.state.executionHealthClassification ?? "stabilizing"}</p>
                  <p>Stability: {transportResult.state.executionStabilityScore?.toFixed(2) ?? "0.00"}</p>
                  <p>Transport Integrity: {transportResult.state.transportIntegrityScore?.toFixed(2) ?? "0.00"}</p>
                </div>
                <div className="mt-1 grid gap-3 md:grid-cols-3">
                  <p>Recoverability: {transportResult.state.mutationRecoverabilityScore?.toFixed(2) ?? "0.00"}</p>
                  <p>Degradation: {transportResult.state.degradationSeverity ?? "none"}</p>
                  <p>Lifecycle: {transportResult.state.mutationLifecycle?.state ?? "pending"}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
                  <p className="text-xs uppercase tracking-widest text-white/60">QUEUE VERIFICATION</p>
                  <p className="mt-1">
                    Score/Confidence: {transportResult.state.mutationVerification?.verificationScore?.toFixed(2) ?? "0.00"} /{" "}
                    {transportResult.state.mutationVerification?.verificationConfidence?.toFixed(2) ?? "0.00"}
                  </p>
                  <p>
                    Pass/Instability/Retry:{" "}
                    {transportResult.state.mutationVerification?.passed ? "pass" : "fail_or_pending"} /{" "}
                    {transportResult.state.mutationVerification?.instabilityDetected ? "unstable" : "stable"} /{" "}
                    {transportResult.state.mutationVerification?.retriable ? "retriable" : "not_retriable"}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {(transportResult.state.mutationVerification?.reasons ?? []).slice(0, 5).map((reason, index) => (
                      <li key={`${reason}-${index}`}>- {reason}</li>
                    ))}
                    {(transportResult.state.mutationVerification?.reasons ?? []).length === 0 ? (
                      <li className="text-white/60">No verification diagnostics yet.</li>
                    ) : null}
                  </ul>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
                  <p className="text-xs uppercase tracking-widest text-white/60">ROLLBACK STABILITY</p>
                  <p className="mt-1">
                    Confidence/Integrity: {transportResult.state.rollbackConfidence?.toFixed(2) ?? "0.00"} /{" "}
                    {transportResult.state.rollbackIntegrityScore?.toFixed(2) ?? "0.00"}
                  </p>
                  <p>
                    Allowed/Feasibility: {transportResult.state.rollbackAllowed ? "yes" : "no"} /{" "}
                    {transportResult.state.restorationFeasibility?.toFixed(2) ?? "0.00"}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {(transportResult.state.rollbackBlockers ?? []).slice(0, 5).map((blocker) => (
                      <li key={blocker}>- {blocker}</li>
                    ))}
                    {(transportResult.state.rollbackBlockers ?? []).length === 0 ? (
                      <li className="text-white/60">No rollback blockers.</li>
                    ) : null}
                  </ul>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
                  <p className="text-xs uppercase tracking-widest text-white/60">EXECUTION HEARTBEAT</p>
                  <p className="mt-1">
                    Status/Health: {transportResult.state.mutationHeartbeat?.heartbeatStatus ?? "degraded"} /{" "}
                    {transportResult.state.mutationHeartbeat?.mutationHealthScore?.toFixed(2) ?? "0.00"}
                  </p>
                  <p>
                    Drift/Freshness: {transportResult.state.mutationHeartbeat?.mutationDriftScore?.toFixed(2) ?? "0.00"} /{" "}
                    {transportResult.state.mutationHeartbeat?.transportFreshnessScore?.toFixed(2) ?? "0.00"}
                  </p>
                  <p>
                    Propagation delay: {transportResult.state.mutationHeartbeat?.propagationDelayMs ?? 0}ms
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {(transportResult.state.mutationHeartbeat?.reasoning ?? []).slice(0, 4).map((reason, index) => (
                      <li key={`${reason}-${index}`}>- {reason}</li>
                    ))}
                    {(transportResult.state.mutationHeartbeat?.reasoning ?? []).length === 0 ? (
                      <li className="text-white/60">No heartbeat reasoning.</li>
                    ) : null}
                  </ul>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
                  <p className="text-xs uppercase tracking-widest text-white/60">FRESHNESS GRACE</p>
                  <p className="mt-1">
                    State/Failure: {transportResult.state.graceState ?? "inactive"} /{" "}
                    {transportResult.state.graceFailure ? "yes" : "no"}
                  </p>
                  <p>
                    Confidence penalty: {transportResult.state.graceConfidencePenalty?.toFixed(2) ?? "0.00"}
                  </p>
                  <p>
                    Window/Remaining: {transportResult.state.freshnessGrace?.graceWindowMs ?? 0}ms /{" "}
                    {transportResult.state.freshnessGrace?.graceRemainingMs ?? 0}ms
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {(transportResult.state.freshnessGrace?.reasons ?? []).slice(0, 4).map((reason, index) => (
                      <li key={`${reason}-${index}`}>- {reason}</li>
                    ))}
                    {(transportResult.state.freshnessGrace?.reasons ?? []).length === 0 ? (
                      <li className="text-white/60">No freshness grace diagnostics.</li>
                    ) : null}
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
                <p className="text-xs uppercase tracking-widest text-white/60">MUTATION AUDIT STATUS</p>
                <p className="mt-1">Audit entries: {transportResult.state.mutationAuditTrail?.length ?? 0}</p>
                <p>
                  Latest lifecycle:{" "}
                  {transportResult.state.mutationAuditTrail?.[transportResult.state.mutationAuditTrail.length - 1]?.lifecycleState ??
                    "n/a"}
                </p>
                <p>
                  Latest verification:{" "}
                  {transportResult.state.mutationAuditTrail?.[transportResult.state.mutationAuditTrail.length - 1]?.verificationOutcome
                    ? `${transportResult.state.mutationAuditTrail[transportResult.state.mutationAuditTrail.length - 1]?.verificationOutcome?.verificationState ?? "n/a"} (${transportResult.state.mutationAuditTrail[transportResult.state.mutationAuditTrail.length - 1]?.verificationOutcome?.verificationScore?.toFixed(2) ?? "0.00"})`
                    : "n/a"}
                </p>
                <p>
                  Latest heartbeat:{" "}
                  {transportResult.state.mutationAuditTrail?.[transportResult.state.mutationAuditTrail.length - 1]?.heartbeatDiagnostics
                    ?.heartbeatStatus ?? "n/a"}
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {(transportResult.state.mutationAuditTrail?.[
                    transportResult.state.mutationAuditTrail.length - 1
                  ]?.degradationReasons ?? [])
                    .slice(0, 4)
                    .map((reason, index) => (
                      <li key={`${reason}-${index}`}>- {reason}</li>
                    ))}
                  {(transportResult.state.mutationAuditTrail?.[
                    transportResult.state.mutationAuditTrail.length - 1
                  ]?.degradationReasons ?? []).length === 0 ? (
                    <li className="text-white/60">No recent degradation reasons.</li>
                  ) : null}
                </ul>
                <ul className="mt-2 space-y-1 text-xs text-white/75">
                  {(transportResult.state.runtimeObservabilitySummary ?? []).slice(-4).map((line, index) => (
                    <li key={`${line}-${index}`}>- {line}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <div className={`rounded-xl border p-3 text-sm ${readinessStyles(evaluation.executionReadiness)}`}>
              <p className="text-xs uppercase tracking-widest">Execution Readiness</p>
              <p className="mt-1 font-semibold">
                {evaluation.executionReadiness} ({evaluation.executionReadinessScore.toFixed(2)})
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Execution Window</p>
              <p className="mt-1 font-semibold">{evaluation.executionWindowState}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Transport Stability</p>
              <p className="mt-1 font-semibold">{evaluation.transportStability.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Device Sync Confidence</p>
              <p className="mt-1 font-semibold">{evaluation.deviceSynchronizationConfidence.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Cue Preparation</p>
              <p className="mt-1 font-semibold">{evaluation.cuePreparationConfidence.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Rollback Readiness</p>
              <p className="mt-1 font-semibold">{evaluation.rollbackReadiness.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Execution Blockers</p>
              <p className="mt-1 text-white/80">
                {evaluation.executionBlockers.length
                  ? evaluation.executionBlockers.map((blocker) => blocker.replace(/_/g, " ")).join(", ")
                  : "No blockers"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-white/60">REAL DJ COMPATIBILITY</p>
              <p
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  djRiskStyles(evaluation.transitionDiagnostics.compatibilityRiskLevel)
                }`}
              >
                {evaluation.transitionDiagnostics.compatibilityRiskLevel}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className={`rounded-xl border p-3 ${djScoreStyles(evaluation.transitionDiagnostics.compatibilityScore)}`}>
                <p className="text-xs uppercase tracking-widest">Compatibility Score</p>
                <p className="mt-1 font-semibold">{evaluation.transitionDiagnostics.compatibilityScore.toFixed(2)}</p>
              </div>
              <div
                className={`rounded-xl border p-3 ${djScoreStyles(
                  evaluation.transitionDiagnostics.compatibilityPhraseAlignmentScore,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Phrase Alignment</p>
                <p className="mt-1 font-semibold">
                  {evaluation.transitionDiagnostics.compatibilityPhraseAlignmentScore.toFixed(2)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${djScoreStyles(
                  evaluation.transitionDiagnostics.compatibilityHarmonicScore,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Harmonic Continuity</p>
                <p className="mt-1 font-semibold">{evaluation.transitionDiagnostics.compatibilityHarmonicScore.toFixed(2)}</p>
              </div>
              <div
                className={`rounded-xl border p-3 ${djScoreStyles(
                  evaluation.transitionDiagnostics.compatibilityVocalClashScore,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Vocal Collision Safety</p>
                <p className="mt-1 font-semibold">{evaluation.transitionDiagnostics.compatibilityVocalClashScore.toFixed(2)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div
                className={`rounded-xl border p-3 ${djScoreStyles(
                  evaluation.transitionDiagnostics.compatibilityEnergyFlowScore,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Energy Flow</p>
                <p className="mt-1 font-semibold">{evaluation.transitionDiagnostics.compatibilityEnergyFlowScore.toFixed(2)}</p>
              </div>
              <div
                className={`rounded-xl border p-3 ${djScoreStyles(
                  evaluation.transitionDiagnostics.compatibilityTensionContinuityScore,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Tension Continuity</p>
                <p className="mt-1 font-semibold">
                  {evaluation.transitionDiagnostics.compatibilityTensionContinuityScore.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">DJ Archetype</p>
                <p className="mt-1 font-semibold">
                  {evaluation.transitionDiagnostics.recommendedArchetype.replace(/_/g, " ")}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Transition Health</p>
                <p className="mt-1 text-xs">
                  {evaluation.transitionDiagnostics.compatibilityPhraseAlignmentScore >= 72
                    ? "Phrase alignment healthy. "
                    : "Phrase alignment needs tighter bar lock. "}
                  {evaluation.transitionDiagnostics.compatibilityHarmonicScore < 60
                    ? "Potential harmonic instability. "
                    : "Harmonic continuity stable. "}
                  {evaluation.transitionDiagnostics.compatibilityVocalClashScore < 58
                    ? "Vocal overlap risk elevated. "
                    : "Vocal overlap risk controlled. "}
                  {evaluation.transitionDiagnostics.compatibilityEnergyFlowScore >= 68
                    ? "Energy progression stable."
                    : "Energy progression needs supervision."}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Compatibility Explainability</p>
              <ul className="mt-2 space-y-1 text-xs text-white/80">
                {evaluation.transitionDiagnostics.compatibilityReasoning.slice(0, 8).map((reason, index) => (
                  <li key={`${reason}-${index}`}>- {reason}</li>
                ))}
                {evaluation.transitionDiagnostics.compatibilityReasoning.length === 0 ? (
                  <li className="text-white/60">No compatibility explainability available yet.</li>
                ) : null}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">ADAPTIVE LEARNING</p>
            <div className="mt-2 grid gap-3 md:grid-cols-4">
              <div
                className={`rounded-xl border p-3 ${learningBiasStyles(
                  evaluation.transitionDiagnostics.learningConfidenceBias ?? 0,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Learning Confidence Bias</p>
                <p className="mt-1 font-semibold">
                  {(evaluation.transitionDiagnostics.learningConfidenceBias ?? 0) >= 0 ? "+" : ""}
                  {(evaluation.transitionDiagnostics.learningConfidenceBias ?? 0).toFixed(2)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${learningRiskStyles(
                  evaluation.transitionDiagnostics.learningRiskBias ?? 0,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Learning Risk Bias</p>
                <p className="mt-1 font-semibold">
                  {(evaluation.transitionDiagnostics.learningRiskBias ?? 0) >= 0 ? "+" : ""}
                  {(evaluation.transitionDiagnostics.learningRiskBias ?? 0).toFixed(2)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${stabilizationPriorityStyles(
                  evaluation.transitionDiagnostics.stabilizationPriority ?? 0,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Stabilization Priority</p>
                <p className="mt-1 font-semibold">
                  {(evaluation.transitionDiagnostics.stabilizationPriority ?? 0).toFixed(2)}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${escalationClampStyles(
                  evaluation.transitionDiagnostics.escalationClamp ?? 0,
                )}`}
              >
                <p className="text-xs uppercase tracking-widest">Escalation Clamp</p>
                <p className="mt-1 font-semibold">{(evaluation.transitionDiagnostics.escalationClamp ?? 0).toFixed(2)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-white/75">
              {deriveAdaptiveLearningInterpretation({
                confidenceBias: evaluation.transitionDiagnostics.learningConfidenceBias ?? 0,
                riskBias: evaluation.transitionDiagnostics.learningRiskBias ?? 0,
                stabilizationPriority: evaluation.transitionDiagnostics.stabilizationPriority ?? 0,
                escalationClamp: evaluation.transitionDiagnostics.escalationClamp ?? 0,
              })}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-white/80">
              {Array.from(
                new Set(
                  (evaluation.transitionDiagnostics.learningReasons ?? []).filter(
                    (reason): reason is string => typeof reason === "string" && reason.trim().length > 0,
                  ),
                ),
              )
                .slice(0, 8)
                .map((reason, index) => (
                  <li key={`${reason}-${index}`}>- {reason}</li>
                ))}
              {(evaluation.transitionDiagnostics.learningReasons ?? []).filter(
                (reason): reason is string => typeof reason === "string" && reason.trim().length > 0,
              ).length === 0 ? <li className="text-white/60">No adaptive learning diagnostics yet.</li> : null}
            </ul>
          </div>

          {adaptiveRefinement ? (
            <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/8 p-3 text-sm text-cyan-50">
              <p className="text-xs uppercase tracking-widest text-cyan-100/85">ADAPTIVE ORCHESTRATION</p>
              <p className="mt-1 text-xs text-white/65">
                Multi-candidate refinement after simulation — orchestration layer only (no transport mutation).
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Selected Strategy</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.selectedCandidate.strategy.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Previous Strategy</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.previousStrategy.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Aggression Decay</p>
                  <p className="mt-1 font-semibold">
                    {(adaptiveRefinement.refinementTelemetry.aggressionDecay * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Stability Delta</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.refinementTelemetry.stabilityDelta >= 0 ? "+" : ""}
                    {adaptiveRefinement.refinementTelemetry.stabilityDelta.toFixed(1)}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                  <p className="uppercase tracking-widest text-white/55">Execution Window Adaptation</p>
                  <p className="mt-1">{adaptiveRefinement.refinementTelemetry.executionWindowAdaptation}</p>
                  <p className="mt-2 uppercase tracking-widest text-white/55">Rollback Survivability Delta</p>
                  <p className="mt-1">
                    {adaptiveRefinement.refinementTelemetry.rollbackSurvivabilityDelta >= 0 ? "+" : ""}
                    {adaptiveRefinement.refinementTelemetry.rollbackSurvivabilityDelta.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                  <p className="uppercase tracking-widest text-white/55">Adaptation Reason</p>
                  <ul className="mt-1 space-y-1">
                    {adaptiveRefinement.adaptationReasoning.slice(0, 4).map((reason, index) => (
                      <li key={`${reason}-${index}`}>- {reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {adaptiveRefinement.adaptationWarnings.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-amber-100/90">
                  {adaptiveRefinement.adaptationWarnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>- {warning}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
                <p className="text-xs uppercase tracking-widest text-white/60">Candidate Rankings</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {adaptiveRefinement.rankedCandidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      className={
                        candidate.id === adaptiveRefinement.selectedCandidate.id
                          ? "text-emerald-200"
                          : candidate.rejected
                            ? "text-white/45 line-through"
                            : "text-white/75"
                      }
                    >
                      {candidate.rejected ? "✗" : "•"} {candidate.id.replace(/_/g, " ")} — score{" "}
                      {candidate.orchestrationScore.toFixed(1)} | stability{" "}
                      {candidate.executionStability.toFixed(1)}
                      {candidate.rejected && candidate.rejectionReasons.length
                        ? ` (${candidate.rejectionReasons.join(", ")})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-widest text-white/60">RUNTIME SIMULATION</p>
              <p
                className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  simulationActionStyles(runtimeSimulationObservability?.recommendedAction ?? "require_operator_review")
                }`}
              >
                {(runtimeSimulationObservability?.recommendedAction ?? "require_operator_review").replace(/_/g, " ")}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Predicted Transition Success</p>
                <p className="mt-1 font-semibold">
                  {runtimeSimulationObservability?.predictedTransitionSuccess.toFixed(2) ?? "0.00"}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Predicted Crowd Recovery</p>
                <p className="mt-1 font-semibold">
                  {runtimeSimulationObservability?.predictedCrowdRecovery.toFixed(2) ?? "0.00"}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Predicted Execution Stability</p>
                <p className="mt-1 font-semibold">
                  {runtimeSimulationObservability?.predictedExecutionStability.toFixed(2) ?? "0.00"}
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Predicted Recovery Pressure</p>
                <p className="mt-1 font-semibold">
                  {runtimeSimulationObservability?.predictedRecoveryPressure.toFixed(2) ?? "0.00"}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Predicted Energy Flow</p>
                <p className="mt-1 font-semibold">{runtimeSimulationObservability?.predictedEnergyFlow.toFixed(2) ?? "0.00"}</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Predicted Risk Shift</p>
                <p className="mt-1 font-semibold">{runtimeSimulationObservability?.predictedRiskShift.toFixed(2) ?? "0.00"}</p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-white/90">
                <p className="text-xs uppercase tracking-widest text-white/60">Simulation Readiness</p>
                <p className="mt-1 font-semibold">{runtimeSimulationObservability ? "available" : "not simulated"}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-white/75">
              {runtimeSimulationObservability?.interpretation ?? "Run simulation to inspect predicted orchestration behavior."}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-white/80">
              {(runtimeSimulationObservability?.reasoning ?? []).slice(0, 8).map((reason, index) => (
                <li key={`${reason}-${index}`}>- {reason}</li>
              ))}
              {(runtimeSimulationObservability?.reasoning ?? []).length === 0 ? (
                <li className="text-white/60">No runtime simulation reasoning available yet.</li>
              ) : null}
            </ul>
            <div className="mt-2 grid gap-2 text-xs text-white/70 md:grid-cols-3">
              <p>Prediction accuracy: {runtimeSimulationDrift ? (100 - runtimeSimulationDrift.normalizedDriftScore).toFixed(2) : "0.00"}</p>
              <p>Calibration status: {runtimeSimulationDrift?.confidenceCalibration.calibrationStatus ?? "n/a"}</p>
              <p>Drift severity: {runtimeSimulationDrift?.driftSeverity ?? "n/a"}</p>
            </div>
            <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
              <p>Confidence reliability: {runtimeSimulationDrift?.confidenceCalibration.confidenceReliability.toFixed(2) ?? "0.00"}</p>
              <p>Stabilization mismatch: {runtimeSimulationDrift?.executionStabilityDrift.toFixed(2) ?? "0.00"}</p>
              <p>Recovery mismatch: {runtimeSimulationDrift?.recoveryPressureDrift.toFixed(2) ?? "0.00"}</p>
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
              <p className="text-xs uppercase tracking-widest text-white/60">CONFIDENCE CALIBRATION</p>
              <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
                <p>Raw confidence: {runtimeConfidenceCalibration?.rawOrchestrationConfidence.toFixed(2) ?? "0.00"}</p>
                <p>Calibrated confidence: {runtimeConfidenceCalibration?.calibratedConfidence.toFixed(2) ?? "0.00"}</p>
                <p>Adjustment delta: {runtimeConfidenceCalibration?.confidenceAdjustmentDelta.toFixed(2) ?? "0.00"}</p>
              </div>
              <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
                <p>Calibration reliability: {runtimeConfidenceCalibration?.calibration.calibrationReliabilityScore.toFixed(2) ?? "0.00"}</p>
                <p>Optimism pressure: {runtimeConfidenceCalibration?.calibration.optimismBiasScore.toFixed(2) ?? "0.00"}</p>
                <p>Conservatism pressure: {runtimeConfidenceCalibration?.calibration.conservatismBiasScore.toFixed(2) ?? "0.00"}</p>
              </div>
              <p className="mt-1 text-xs text-white/65">
                Severity: {runtimeConfidenceCalibration?.calibration.calibrationSeverity ?? "n/a"} | Trend:{" "}
                {runtimeConfidenceCalibration?.calibration.reliabilityTrendDirection ?? "n/a"}
              </p>
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
              <p className="text-xs uppercase tracking-widest text-white/60">SUPERVISED RECOVERY</p>
              <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
                <p>Strategy: {(runtimeRecoveryIntelligence?.recommendation.plan.primaryStrategy ?? "n/a").replace(/_/g, " ")}</p>
                <p>Feasibility: {runtimeRecoveryIntelligence?.recommendation.confidence.recoveryFeasibility.toFixed(2) ?? "0.00"}</p>
                <p>Escalation pressure: {runtimeRecoveryIntelligence?.recommendation.escalation.rollbackEscalationPressure.toFixed(2) ?? "0.00"}</p>
              </div>
              <p className="mt-1 text-xs text-white/65">
                Continuity: {runtimeRecoveryIntelligence?.recommendation.continuity.continuityPreservationQuality.toFixed(2) ?? "0.00"} | Risk:{" "}
                {runtimeRecoveryIntelligence?.recommendation.risk.riskClassification ?? "n/a"} | Advisory only — rollback remains final authority
              </p>
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
              <p className="text-xs uppercase tracking-widest text-white/60">NARRATIVE ARC</p>
              <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
                <p>Stability: {runtimeNarrativeOrchestration?.recommendation.narrativeStability.toFixed(2) ?? "0.00"}</p>
                <p>Arc state: {runtimeNarrativeOrchestration?.recommendation.arc.flowState ?? "n/a"}</p>
                <p>Transition arc safety: {runtimeNarrativeOrchestration?.recommendation.continuity.transitionArcSafety.toFixed(2) ?? "0.00"}</p>
              </div>
              <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
                <p>Fatigue: {runtimeNarrativeOrchestration?.recommendation.fatigue.fatiguePressure.toFixed(2) ?? "0.00"}</p>
                <p>Pacing continuity: {runtimeNarrativeOrchestration?.recommendation.energyWave.pacingContinuity.toFixed(2) ?? "0.00"}</p>
                <p>Cooldown pressure: {runtimeNarrativeOrchestration?.recommendation.cooldownPressure.toFixed(2) ?? "0.00"}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Harmonic Compatibility</p>
              <p className="mt-1 font-semibold">{evaluation.harmonicCompatibility.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Emotional Continuity</p>
              <p className="mt-1 font-semibold">{evaluation.emotionalContinuity.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Harmonic Tension</p>
              <p className="mt-1 font-semibold">{evaluation.harmonicTension.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Emotional Momentum</p>
              <p className="mt-1 font-semibold">{evaluation.emotionalMomentum.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Emotional Transition Risk</p>
              <p className="mt-1 font-semibold">{evaluation.emotionalTransitionRisk.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Emotional Energy Drift</p>
              <p className="mt-1 font-semibold">{evaluation.emotionalEnergyDrift.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Emotional Alignment</p>
              <p className="mt-1 font-semibold">{evaluation.crowdEmotionalAlignment.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Harmonic Resolution Confidence</p>
              <p className="mt-1 font-semibold">{evaluation.harmonicResolutionConfidence.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Harmonic Emotion Summary</p>
            <ul className="mt-2 space-y-1 text-xs text-white/75">
              {evaluation.harmonicEmotionReasoning.slice(0, 5).map((reason, index) => (
                <li key={`${reason}-${index}`}>- {reason}</li>
              ))}
              {evaluation.harmonicEmotionReasoning.length === 0 ? (
                <li className="text-white/60">No harmonic-emotion reasoning available yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Energy State</p>
              <p className="mt-1 font-semibold">{evaluation.crowdEnergyState}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Momentum</p>
              <p className="mt-1 font-semibold">{evaluation.crowdMomentumScore.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Fatigue Pressure</p>
              <p className="mt-1 font-semibold">{evaluation.crowdFatiguePressure.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Recovery Confidence</p>
              <p className="mt-1 font-semibold">{evaluation.crowdRecoveryConfidence.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Engagement Confidence</p>
              <p className="mt-1">{evaluation.crowdEngagementConfidence.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Volatility</p>
              <p className="mt-1">{evaluation.crowdEnergyVolatility.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Hype Saturation</p>
              <p className="mt-1">{evaluation.crowdHypeSaturation.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Adaptation Confidence</p>
              <p className="mt-1">{evaluation.crowdAdaptationConfidence.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Crowd Adaptation Summary</p>
            <ul className="mt-2 space-y-1 text-xs text-white/75">
              {evaluation.crowdAdaptationReasoning.slice(0, 5).map((reason, index) => (
                <li key={`${reason}-${index}`}>- {reason}</li>
              ))}
              {evaluation.crowdAdaptationReasoning.length === 0 ? (
                <li className="text-white/60">No crowd adaptation reasoning available yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Flow State</p>
              <p className="mt-1 font-semibold">{evaluation.narrativeFlowState}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Momentum</p>
              <p className="mt-1 font-semibold">{evaluation.narrativeMomentum.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Tension</p>
              <p className="mt-1 font-semibold">{evaluation.narrativeTension.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Recovery Pressure</p>
              <p className="mt-1 font-semibold">{evaluation.narrativeRecoveryPressure.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Continuity</p>
              <p className="mt-1 font-semibold">{evaluation.narrativeContinuity.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Energy Arc</p>
              <p className="mt-1">{evaluation.narrativeEnergyArc.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Fatigue Risk</p>
              <p className="mt-1">{evaluation.narrativeFatigueRisk.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Progression Confidence</p>
              <p className="mt-1">{evaluation.narrativeProgressionConfidence.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Journey Alignment</p>
              <p className="mt-1">{evaluation.narrativeJourneyAlignment.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Resolution Confidence</p>
              <p className="mt-1">{evaluation.narrativeResolutionConfidence.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Narrative Flow Summary</p>
            <ul className="mt-2 space-y-1 text-xs text-white/75">
              {evaluation.narrativeReasoning.slice(0, 6).map((reason, index) => (
                <li key={`${reason}-${index}`}>- {reason}</li>
              ))}
              {evaluation.narrativeReasoning.length === 0 ? (
                <li className="text-white/60">No narrative flow reasoning available yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Cadence State</p>
              <p className="mt-1 font-semibold">{evaluation.cadenceState}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Cadence Density</p>
              <p className="mt-1 font-semibold">{evaluation.cadenceDensity.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Cadence Aggression</p>
              <p className="mt-1 font-semibold">{evaluation.cadenceAggression.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Recovery Spacing</p>
              <p className="mt-1 font-semibold">{evaluation.cadenceRecoverySpacing.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Breathing Room</p>
              <p className="mt-1 font-semibold">{evaluation.cadenceBreathingRoom.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Cadence Stability</p>
              <p className="mt-1">{evaluation.cadenceStability.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Escalation Pressure</p>
              <p className="mt-1">{evaluation.cadenceEscalationPressure.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Fatigue Load</p>
              <p className="mt-1">{evaluation.cadenceFatigueLoad.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Balance</p>
              <p className="mt-1">{evaluation.cadenceNarrativeBalance.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Adaptation Confidence</p>
              <p className="mt-1">{evaluation.cadenceAdaptationConfidence.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Cadence Summary</p>
            <ul className="mt-2 space-y-1 text-xs text-white/75">
              {evaluation.cadenceReasoning.slice(0, 6).map((reason, index) => (
                <li key={`${reason}-${index}`}>- {reason}</li>
              ))}
              {evaluation.cadenceReasoning.length === 0 ? (
                <li className="text-white/60">No adaptive cadence reasoning available yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Balance</p>
              <p className="mt-1 font-semibold">{evaluation.orchestrationBalanceScore.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Conflict Pressure</p>
              <p className="mt-1 font-semibold">{evaluation.orchestrationConflictPressure.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Alignment</p>
              <p className="mt-1 font-semibold">{evaluation.orchestrationAlignment.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Stability</p>
              <p className="mt-1 font-semibold">{evaluation.orchestrationStability.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Synthesis Confidence</p>
              <p className="mt-1 font-semibold">{evaluation.orchestrationSynthesisConfidence.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Recovery Priority</p>
              <p className="mt-1">{evaluation.orchestrationRecoveryPriority.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Escalation Priority</p>
              <p className="mt-1">{evaluation.orchestrationEscalationPriority.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Continuity Priority</p>
              <p className="mt-1">{evaluation.orchestrationContinuityPriority.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Fatigue Priority</p>
              <p className="mt-1">{evaluation.orchestrationFatiguePriority.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Narrative Priority</p>
              <p className="mt-1">{evaluation.orchestrationNarrativePriority.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Synthesis Summary</p>
            <ul className="mt-2 space-y-1 text-xs text-white/75">
              {evaluation.orchestrationSynthesisReasoning.slice(0, 6).map((reason, index) => (
                <li key={`${reason}-${index}`}>- {reason}</li>
              ))}
              {evaluation.orchestrationSynthesisReasoning.length === 0 ? (
                <li className="text-white/60">No orchestration synthesis reasoning available yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Phrase Position</p>
              <p className="mt-1 font-semibold">
                {evaluation.currentPhrasePosition.toFixed(2)} / {evaluation.currentPhraseLength.toFixed(0)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Phrase Alignment</p>
              <p className="mt-1 font-semibold">{evaluation.phraseAlignmentConfidence.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Phrase Window</p>
              <p className="mt-1 font-semibold">{evaluation.phraseTransitionWindow}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Transition Pressure</p>
              <p className="mt-1 font-semibold">{evaluation.transitionPressure.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Phrase Momentum</p>
              <p className="mt-1 font-semibold">{evaluation.phraseMomentum.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Phrase Timing Confidence</p>
              <p className="mt-1 font-semibold">{evaluation.transitionTimingConfidence.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Phrase Timing Risk</p>
              <p className="mt-1 font-semibold">{evaluation.phraseTimingRisk.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
            <p className="text-xs uppercase tracking-widest text-white/60">Phrase Timing Summary</p>
            <ul className="mt-2 space-y-1 text-xs text-white/75">
              {evaluation.phraseTimingReasoning.slice(0, 5).map((reason, index) => (
                <li key={`${reason}-${index}`}>- {reason}</li>
              ))}
              {evaluation.phraseTimingReasoning.length === 0 ? (
                <li className="text-white/60">No phrase timing reasoning available yet.</li>
              ) : null}
            </ul>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Active Device Health</p>
              <p className="mt-1 font-semibold">
                {evaluation.deviceSynchronizationConfidence >= 70
                  ? "healthy"
                  : evaluation.deviceSynchronizationConfidence >= 50
                    ? "degraded"
                    : "critical"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Queue Mutation Readiness</p>
              <p className="mt-1 font-semibold">
                {evaluation.executionReadiness !== "blocked" && evaluation.executionPlan.targetTrackId
                  ? "ready_for_supervision"
                  : "blocked"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Playback Synchronization</p>
              <p className="mt-1 font-semibold">{evaluation.deviceSynchronizationConfidence.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Transport Freshness</p>
              <p className="mt-1 font-semibold">{evaluation.telemetry?.freshness ?? "unknown"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Window Preparation State</p>
              <p className="mt-1 font-semibold">{evaluation.executionWindowState}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Playback Freshness Age</p>
              <p className={`mt-1 font-semibold ${freshnessStyles(playbackFreshnessState)}`}>
                {Math.round(evaluation.playbackFreshnessAgeMs / 1000)}s ({playbackFreshnessState})
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Heartbeat Continuity</p>
              <p className="mt-1 font-semibold">{evaluation.heartbeatContinuity.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Heartbeat Drift</p>
              <p className="mt-1 font-semibold">{evaluation.heartbeatDrift.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Freshness Recovery State</p>
              <p className="mt-1 font-semibold">{evaluation.freshnessRecoveryState}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Grace Stabilization</p>
              <p className="mt-1 font-semibold">{evaluation.graceStabilizationActive ? "active" : "inactive"}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Execution Strategy</p>
              <p className="mt-1 font-semibold">{evaluation.executionStrategy}</p>
              <p className="text-xs text-white/70">
                Aggressiveness/Complexity: {evaluation.transitionAggressiveness.toFixed(2)} /{" "}
                {evaluation.transitionComplexity.toFixed(2)}
              </p>
              <p className="text-xs text-white/70">
                Operator attention: {evaluation.operatorAttentionRequired ? "required" : "normal"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Execution Window Model</p>
              <p className="mt-1">Cue lead time: {evaluation.estimatedCueLeadTime.toFixed(2)} sec</p>
              <p>Blend entry confidence: {evaluation.blendEntryConfidence.toFixed(2)}</p>
              <p>Rollback safety margin: {evaluation.rollbackSafetyMargin.toFixed(2)}</p>
              <p>
                Transition timing confidence:{" "}
                {evaluation.transitionDiagnostics.transitionTimingConfidence.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Execution Explainability</p>
              <ul className="mt-2 space-y-1 text-xs text-white/75">
                {evaluation.executionStrategyReasoning.slice(0, 3).map((reason, index) => (
                  <li key={`${reason}-${index}`}>- {reason}</li>
                ))}
                {evaluation.executionBlockers.slice(0, 2).map((blocker) => (
                  <li key={blocker}>- Blocker: {blocker.replace(/_/g, " ")}</li>
                ))}
                {reinforcement ? <li>- Reinforcement: {reinforcement.reinforcementReason}</li> : null}
              </ul>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
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
        </div>
      ) : null}

      {simulation ? (
        <div className="mt-4 space-y-3">
          {reinforcement ? (
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">Simulation Reinforcement</p>
              <p className="mt-1">
                Type/Strength: {reinforcement.reinforcementType} / {reinforcement.reinforcementStrength.toFixed(3)}
              </p>
              <p>
                Continuity/Stability: {reinforcement.continuityScore.toFixed(2)} / {reinforcement.stabilityScore.toFixed(2)}
              </p>
              <p>
                Confidence/Risk Adj: {reinforcement.confidenceAdjustment.toFixed(2)} /{" "}
                {reinforcement.riskAdjustment.toFixed(2)}
              </p>
              <p className="mt-1 text-white/70">Reason: {reinforcement.reinforcementReason}</p>
              <p className="text-xs text-white/60">
                Success/Risky Count: {reinforcement.telemetry.successfulSimulationCount} /{" "}
                {reinforcement.telemetry.riskySimulationCount}
              </p>
              <p className="text-xs text-white/60">
                Strongest/Weakest: {reinforcement.telemetry.strongestReinforcedSignature} /{" "}
                {reinforcement.telemetry.weakestOrchestrationPattern}
              </p>
              <p className="mt-1 text-xs text-white/70">
                Tags:{" "}
                {reinforcement.telemetry.strongestReinforcedSignature.includes("harmonic")
                  ? "safe harmonic continuity"
                  : "historically stable"}
                {" · "}
                {reinforcement.telemetry.weakestOrchestrationPattern.includes("strategy")
                  ? "repeated recovery behavior"
                  : "historically unstable"}
              </p>
            </div>
          ) : null}
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
                  <p>
                    Strategy/Readiness: {step.executionStrategy} / {step.executionReadiness} (
                    {step.executionReadinessScore.toFixed(2)})
                  </p>
                  <p>
                    Transport/Execution Stability: {step.transportStability.toFixed(2)} /{" "}
                    {simulation.timeline.projectedExecutionStability[step.index - 1]?.toFixed(2) ?? "0"}
                  </p>
                  <p>
                    Window/Rollback/Device Sync: {step.executionWindowState} /{" "}
                    {step.rollbackReadiness.toFixed(2)} / {step.deviceSynchronizationConfidence.toFixed(2)}
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
              <p className="mt-1 text-xs text-white/70">
                Readiness degradation:{" "}
                {(
                  simulation.timeline.projectedExecutionReadiness[simulation.timeline.projectedExecutionReadiness.length - 1] -
                  simulation.timeline.projectedExecutionReadiness[0]
                ).toFixed(2)}
                {" | "}
                Execution stability avg:{" "}
                {(
                  simulation.timeline.projectedExecutionStability.reduce((sum, value) => sum + value, 0) /
                  Math.max(simulation.timeline.projectedExecutionStability.length, 1)
                ).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

