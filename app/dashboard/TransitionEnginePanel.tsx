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
import type {
  AutonomyReadinessResult,
  ExecutionValidationResult,
  OrchestrationRefinementResult,
  RuntimeTrustCalibration,
} from "@/lib/ai/orchestration-refinement-types";
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

function convergenceSeverityStyles(severity: "stable" | "degraded" | "divergent") {
  if (severity === "stable") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  if (severity === "degraded") return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  return "border-red-400/35 bg-red-500/10 text-red-100";
}

function autonomyReadinessStyles(
  readiness: AutonomyReadinessResult["readiness"] | RuntimeTrustCalibration["autonomyReadiness"],
) {
  if (readiness === "trusted_runtime") return "border-violet-400/35 bg-violet-500/10 text-violet-100";
  if (readiness === "bounded_autonomy") return "border-sky-400/35 bg-sky-500/10 text-sky-100";
  if (readiness === "supervised_only") return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  return "border-red-400/35 bg-red-500/10 text-red-100";
}

function trustCalibrationSeverityStyles(severity: RuntimeTrustCalibration["calibrationSeverity"]) {
  if (severity === "healthy") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
  if (severity === "warning") return "border-amber-400/35 bg-amber-500/10 text-amber-100";
  return "border-red-400/35 bg-red-500/10 text-red-100";
}

export function TransitionEnginePanel({ queueRecommendations }: TransitionEnginePanelProps) {
  const [assistedEnabled, setAssistedEnabled] = useState(false);
  const [supervisedTestingMode, setSupervisedTestingMode] = useState(true);
  const [operatorExecutionOverride, setOperatorExecutionOverride] = useState(false);
  const [executionValidation, setExecutionValidation] = useState<ExecutionValidationResult | null>(null);
  const [historicalTrustScore, setHistoricalTrustScore] = useState<number | null>(null);
  const [runtimeTrustCalibration, setRuntimeTrustCalibration] =
    useState<RuntimeTrustCalibration | null>(null);
  const [autonomyReadiness, setAutonomyReadiness] = useState<AutonomyReadinessResult | null>(null);
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
  const [humanObservedSection, setHumanObservedSection] = useState("verse");
  const [calibrationNotes, setCalibrationNotes] = useState("");
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null);
  const [isRecordingCalibration, setIsRecordingCalibration] = useState(false);
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

  const executionConvergenceGate = useMemo(() => {
    const recovery = adaptiveRefinement?.convergenceRecovery;
    const convergence =
      recovery?.recovered && recovery.repairedMetrics
        ? recovery.repairedMetrics
        : adaptiveRefinement?.convergenceMetrics;
    const transportStability = transportRuntimeState?.transportStability ?? evaluation?.transportStability ?? 0;
    const survivability = evaluation?.rollbackSurvivability;
    const rollbackReadiness = survivability?.rollbackReadiness ?? evaluation?.rollbackReadiness ?? 0;
    const survivabilityScore = survivability?.survivabilityScore ?? 0;
    const transportRecoveryConfidence =
      evaluation?.transportRecovery?.confidence ?? survivability?.transportRecoveryConfidence ?? 0;
    const narrativeContinuity =
      convergence?.narrativeContinuity ?? evaluation?.narrativeContinuity ?? 0;
    const cadenceStability = convergence?.cadenceStability ?? evaluation?.cadenceStability ?? 0;
    const phraseSurvivability = convergence?.phraseTimingSurvivability ?? 0;
    const phraseTimingRisk = Math.max(
      0,
      (evaluation?.phraseTimingRisk ?? 100) -
        (recovery?.phraseLockRecovery.timingRiskReduction ?? 0),
    );
    const synthesisConfidence =
      convergence?.synthesisConfidence ?? evaluation?.orchestrationSynthesisConfidence ?? 0;
    const convergenceScore = convergence?.convergenceScore ?? 0;
    const blockers: string[] = [];
    if (transportStability <= 75) blockers.push("transport stability must exceed 75");
    if (rollbackReadiness <= 55) blockers.push("rollback readiness must exceed 55");
    if (survivabilityScore <= 60) blockers.push("survivability score must exceed 60");
    if (transportRecoveryConfidence <= 60) {
      blockers.push("transport recovery confidence must exceed 60");
    }
    if (narrativeContinuity <= 65) blockers.push("narrative continuity must exceed 65");
    if (cadenceStability <= 60) blockers.push("cadence stability must exceed 60");
    if (phraseTimingRisk >= 40 && phraseSurvivability < 40) {
      blockers.push("phrase timing risk must stay below 40 after recovery");
    }
    if (phraseSurvivability < 35) {
      blockers.push("phrase survivability remains critically low after recovery");
    }
    if (synthesisConfidence <= 60) blockers.push("synthesis confidence must exceed 60");
    if (convergenceScore <= 70) blockers.push("convergence score must exceed 70");
    if (
      adaptiveRefinement?.globalConvergenceState === "divergent" &&
      !recovery?.recovered
    ) {
      blockers.push("global convergence is divergent");
    }
    if (
      recovery?.finalRecommendation === "reject" &&
      !operatorExecutionOverride &&
      !supervisedTestingMode
    ) {
      blockers.push("convergence recovery rejected execution");
    }
    const audio = evaluation?.audioIntelligence;
    const audioRecovered =
      evaluation?.audioMixRecovery?.recovered || recovery?.audioMixRecovery?.recovered;
    if (audio) {
      if (audio.vocal.overlapRisk >= 72 && !audioRecovered) {
        blockers.push("vocal overlap dangerous");
      }
      if (audio.grooveContinuity < 42 && !audioRecovered) {
        blockers.push("groove continuity collapsed");
      }
      if (audio.spectral.recommendation === "unsafe_overlap" && !audioRecovered) {
        blockers.push("spectral conflict severe");
      }
      if (audio.drop.survivability < 35 && !audioRecovered) {
        blockers.push("drop survivability too low");
      }
    }
    const calibratedTrust =
      runtimeTrustCalibration?.trustScore ??
      adaptiveRefinement?.runtimeTrustCalibration?.trustScore ??
      historicalTrustScore ??
      62;
    if (calibratedTrust < 58 && !operatorExecutionOverride && !supervisedTestingMode) {
      blockers.push("calibrated runtime trust must be at least 58");
    }
    if (
      autonomyReadiness?.readiness === "not_ready" &&
      !operatorExecutionOverride &&
      !supervisedTestingMode
    ) {
      blockers.push("autonomy readiness is not_ready");
    }
    return { allowed: blockers.length === 0, blockers };
  }, [
    adaptiveRefinement,
    evaluation,
    transportRuntimeState,
    historicalTrustScore,
    runtimeTrustCalibration,
    autonomyReadiness,
    operatorExecutionOverride,
    supervisedTestingMode,
  ]);
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

  async function recordPhraseCalibration() {
    const inference = evaluation?.structuralCompatibility?.inference;
    if (!inference) return;
    setIsRecordingCalibration(true);
    setCalibrationMessage(null);
    try {
      const response = await fetch("/api/transition-engine/phrase-calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackName:
            inference.debug.classificationInputs.trackName?.toString() ??
            evaluation.executionPlan.targetTrackLabel ??
            "live_track",
          playbackPositionMs: inference.playbackProgressMs ?? inference.debug.playbackProgressMs ?? 0,
          detectedSection: evaluation.structuralCompatibility?.exitSection ?? "unknown",
          humanObservedSection,
          confidence: 85,
          notes: calibrationNotes || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Calibration record failed.");
      setCalibrationMessage(
        `Recorded: detected ${data.observation.detectedSection} vs human ${data.observation.humanObservedSection} (session ${data.summary.totalObservations} observations, ${data.summary.mismatchRate}% mismatch rate).`,
      );
    } catch (error) {
      setCalibrationMessage(error instanceof Error ? error.message : "Calibration record failed.");
    } finally {
      setIsRecordingCalibration(false);
    }
  }

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
      if (data.adaptiveRefinement?.runtimeTrustCalibration) {
        setRuntimeTrustCalibration(data.adaptiveRefinement.runtimeTrustCalibration);
        setHistoricalTrustScore(data.adaptiveRefinement.runtimeTrustCalibration.trustScore);
      }
      if (data.adaptiveRefinement?.autonomyReadiness) {
        setAutonomyReadiness(data.adaptiveRefinement.autonomyReadiness);
      }
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
        body: JSON.stringify({ evaluation, mode, adaptiveRefinement }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Transition execution failed.");
      setExecutionMessage(data.message ?? "Transition request completed.");
      if (data.executionValidation) {
        setExecutionValidation(data.executionValidation);
      }
      if (data.historicalTrust?.trustScore != null) {
        setHistoricalTrustScore(data.historicalTrust.trustScore);
      }
      if (data.runtimeTrustCalibration) {
        setRuntimeTrustCalibration(data.runtimeTrustCalibration);
        setHistoricalTrustScore(data.runtimeTrustCalibration.trustScore);
      }
      if (data.autonomyReadiness) {
        setAutonomyReadiness(data.autonomyReadiness);
      }
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
                adaptiveRefinement: adaptiveRefinement ?? null,
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
      if (data.executionValidation) {
        setExecutionValidation(data.executionValidation);
      }
      if (data.historicalTrust?.trustScore != null) {
        setHistoricalTrustScore(data.historicalTrust.trustScore);
      }
      if (data.runtimeTrustCalibration) {
        setRuntimeTrustCalibration(data.runtimeTrustCalibration);
        setHistoricalTrustScore(data.runtimeTrustCalibration.trustScore);
      }
      if (data.autonomyReadiness) {
        setAutonomyReadiness(data.autonomyReadiness);
      }
      if (data.orchestrationEvaluation) {
        setOrchestrationEvaluationState(data.orchestrationEvaluation);
      } else if (data.rollbackSurvivability && evaluation) {
        setOrchestrationEvaluationState({
          stateOrigin: "orchestration_evaluation",
          updatedAt: new Date().toISOString(),
          evaluation: {
            ...evaluation,
            rollbackReadiness: data.rollbackSurvivability.rollbackReadiness,
            rollbackSurvivability: data.rollbackSurvivability,
            transportRecovery: data.transportRecovery ?? evaluation.transportRecovery,
            mutationReliability: data.mutationReliability ?? evaluation.mutationReliability,
            latestCheckpointId: data.latestCheckpointId ?? evaluation.latestCheckpointId,
            mutationJournalSize: data.mutationJournalSize ?? evaluation.mutationJournalSize,
          },
        });
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
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={assistedEnabled}
              onChange={(event) => setAssistedEnabled(event.target.checked)}
            />
            Assisted-autonomous mode
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={supervisedTestingMode}
              onChange={(event) => setSupervisedTestingMode(event.target.checked)}
            />
            Supervised testing mode
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-500/5 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={operatorExecutionOverride}
              onChange={(event) => setOperatorExecutionOverride(event.target.checked)}
            />
            Operator execution override
          </label>
        </div>
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
          disabled={
            isExecuting || !evaluation || !assistedEnabled || !executionConvergenceGate.allowed
          }
          className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
          title={
            !executionConvergenceGate.allowed
              ? executionConvergenceGate.blockers.join("; ")
              : undefined
          }
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
              {transportResult.warnings.includes("telemetry_grace_window_active") ? (
                <p className="mt-3 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                  Telemetry freshness operating inside bounded rollback grace window.
                </p>
              ) : null}
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
                      {candidate.rejected ? "✗" : "•"} {candidate.id.replace(/_/g, " ")} — convergence{" "}
                      {(candidate.convergenceScore ?? 0).toFixed(1)} | stability{" "}
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

          {adaptiveRefinement?.convergenceMetrics ? (
            <div
              className={`rounded-xl border p-3 text-sm ${convergenceSeverityStyles(
                adaptiveRefinement.convergenceMetrics.convergenceSeverity,
              )}`}
            >
              <p className="text-xs uppercase tracking-widest">GLOBAL CONVERGENCE</p>
              <p className="mt-1 text-xs opacity-80">
                Holistic orchestration validation — local stability cannot win if global synthesis diverges.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Convergence Score</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceMetrics.convergenceScore.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Cadence Stability</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceMetrics.cadenceStability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Synthesis Confidence</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceMetrics.synthesisConfidence.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Severity</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.globalConvergenceState}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Narrative Continuity</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceMetrics.narrativeContinuity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Phrase Survivability</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceMetrics.phraseTimingSurvivability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Telemetry Integrity</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceMetrics.telemetryIntegrity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Converged</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceMetrics.converged ? "yes" : "no"}
                  </p>
                </div>
              </div>
              {adaptiveRefinement.convergenceMetrics.convergenceFailures.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {adaptiveRefinement.convergenceMetrics.convergenceFailures.map((failure, index) => (
                    <li key={`${failure}-${index}`}>- {failure.replace(/_/g, " ")}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {adaptiveRefinement?.phraseRecovery ? (
            <div className="rounded-xl border border-violet-300/30 bg-violet-500/8 p-3 text-sm text-violet-50">
              <p className="text-xs uppercase tracking-widest text-violet-100/85">PHRASE RECOVERY</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Recovery Strategy</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.phraseRecovery.strategy.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Timing Risk Reduction</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseRecovery.timingRiskReduction.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Cadence Repair</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseRecovery.cadenceRecovery.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/60">Recovery Gain</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseRecovery.recoveryGain.toFixed(1)}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-white/80">
                {adaptiveRefinement.phraseRecovery.reasoning.map((reason, index) => (
                  <li key={`${reason}-${index}`}>- {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {!executionConvergenceGate.allowed && evaluation ? (
            <p className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-xs text-orange-100">
              Execute Plan blocked until global convergence gates pass:{" "}
              {executionConvergenceGate.blockers.join("; ")}.
            </p>
          ) : null}

          {executionValidation ? (
            <div
              className={`rounded-xl border p-3 text-sm ${
                executionValidation.validationSeverity === "healthy"
                  ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                  : executionValidation.validationSeverity === "warning"
                    ? "border-amber-400/35 bg-amber-500/10 text-amber-100"
                    : "border-red-400/35 bg-red-500/10 text-red-100"
              }`}
            >
              <p className="text-xs uppercase tracking-widest">EXECUTION VALIDATION</p>
              <p className="mt-1 text-xs opacity-80">
                Predicted vs actual supervised execution — real playback truth for orchestration learning.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Predicted Stability</p>
                  <p className="mt-1 font-semibold">
                    {executionValidation.predictedExecutionStability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Actual Stability</p>
                  <p className="mt-1 font-semibold">
                    {executionValidation.actualExecutionStability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Drift Score</p>
                  <p className="mt-1 font-semibold">{executionValidation.orchestrationDrift.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Trust Delta</p>
                  <p className="mt-1 font-semibold">
                    {executionValidation.executionTrustDelta >= 0 ? "+" : ""}
                    {executionValidation.executionTrustDelta.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Survivability Delta</p>
                  <p className="mt-1 font-semibold">{executionValidation.survivabilityDelta.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Outcome</p>
                  <p className="mt-1 font-semibold capitalize">{executionValidation.executionOutcome}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Historical Trust</p>
                  <p className="mt-1 font-semibold">{historicalTrustScore?.toFixed(1) ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Severity</p>
                  <p className="mt-1 font-semibold capitalize">{executionValidation.validationSeverity}</p>
                </div>
              </div>
              {executionValidation.learningSignals.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {executionValidation.learningSignals.map((signal, index) => (
                    <li key={`${signal}-${index}`}>- {signal}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {executionValidation ? (
            <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
              <p className="text-xs uppercase tracking-widest text-white/60">EXECUTION DRIFT</p>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <div className="rounded-lg border border-white/15 bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/55">Cadence Drift</p>
                  <p className="mt-1 font-semibold">{executionValidation.cadenceDrift.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/55">Phrase Drift</p>
                  <p className="mt-1 font-semibold">{executionValidation.phraseDrift.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/55">Recovery Drift</p>
                  <p className="mt-1 font-semibold">{executionValidation.recoveryDrift.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/55">Transport Drift</p>
                  <p className="mt-1 font-semibold">{executionValidation.transportDrift.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-widest text-white/55">Convergence Drift</p>
                  <p className="mt-1 font-semibold">{executionValidation.convergenceDrift.toFixed(1)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-white/65 capitalize">
                Drift severity: {executionValidation.driftSeverity}
              </p>
            </div>
          ) : null}

          {runtimeTrustCalibration ? (
            <div
              className={`rounded-xl border p-3 text-sm ${trustCalibrationSeverityStyles(
                runtimeTrustCalibration.calibrationSeverity,
              )}`}
            >
              <p className="text-xs uppercase tracking-widest">RUNTIME TRUST CALIBRATION</p>
              <p className="mt-1 text-xs opacity-80">
                Dynamic trust calibration from supervised execution outcomes — governs when the runtime can be trusted.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Trust Score</p>
                  <p className="mt-1 font-semibold">{runtimeTrustCalibration.trustScore.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Trust Trend</p>
                  <p className="mt-1 font-semibold capitalize">
                    {runtimeTrustCalibration.trustTrend.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Confidence Accuracy</p>
                  <p className="mt-1 font-semibold">
                    {runtimeTrustCalibration.confidenceAccuracy.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Execution Reliability</p>
                  <p className="mt-1 font-semibold">
                    {runtimeTrustCalibration.executionReliability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Recovery Reliability</p>
                  <p className="mt-1 font-semibold">
                    {runtimeTrustCalibration.recoveryReliability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">False Positive Rate</p>
                  <p className="mt-1 font-semibold">
                    {runtimeTrustCalibration.falsePositiveRate.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">False Negative Rate</p>
                  <p className="mt-1 font-semibold">
                    {runtimeTrustCalibration.falseNegativeRate.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Severity</p>
                  <p className="mt-1 font-semibold capitalize">
                    {runtimeTrustCalibration.calibrationSeverity}
                  </p>
                </div>
              </div>
              {runtimeTrustCalibration.calibrationReasons.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs">
                  {runtimeTrustCalibration.calibrationReasons.map((reason, index) => (
                    <li key={`${reason}-${index}`}>- {reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {evaluation?.structuralCompatibility ? (
            <div className="rounded-xl border border-teal-400/25 bg-teal-500/10 p-3 text-sm text-teal-50">
              <p className="text-xs uppercase tracking-widest">STRUCTURAL COMPATIBILITY</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Exit Quality</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.structuralCompatibility.exitQuality.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Entry Quality</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.structuralCompatibility.entryQuality.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Narrative Continuity</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.structuralCompatibility.narrativeContinuity.toFixed(1)}
                    <span className="ml-2 text-xs font-normal opacity-75 capitalize">
                      ({evaluation.structuralCompatibility.narrativeContinuityLabel})
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Detected Exit Section</p>
                  <p className="mt-1 font-semibold capitalize">
                    {evaluation.structuralCompatibility.exitSection.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Detected Entry Section</p>
                  <p className="mt-1 font-semibold capitalize">
                    {evaluation.structuralCompatibility.entrySection.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Structural Compatibility Score</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.structuralCompatibility.structuralCompatibility.toFixed(1)}
                  </p>
                </div>
              </div>
              {evaluation.structuralCompatibility.inference ? (
                <div className="mt-4 space-y-3 text-xs">
                  <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                    <p className="text-xs uppercase tracking-widest opacity-70">Structural Inference</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-4">
                      <p>
                        <span className="opacity-70">Source: </span>
                        <span className="font-semibold capitalize">
                          {evaluation.structuralCompatibility.inference.inferenceSource.replace(/_/g, " ")}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Section confidence: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.sectionConfidence.toFixed(1)}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Classification mode: </span>
                        <span className="font-semibold capitalize">
                          {evaluation.structuralCompatibility.inference.classificationMode.replace(/_/g, " ")}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Position-driven confidence: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.positionDrivenConfidence.toFixed(1)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
                    <p className="text-xs uppercase tracking-widest opacity-80">Phrase Window vs Audio Evidence</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <p>
                        <span className="opacity-70">Phrase window prediction: </span>
                        <span className="font-semibold capitalize">
                          {evaluation.structuralCompatibility.inference.phraseAudioAgreement.phraseWindowPrediction.replace(
                            /_/g,
                            " ",
                          )}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Audio evidence prediction: </span>
                        <span className="font-semibold capitalize">
                          {evaluation.structuralCompatibility.inference.phraseAudioAgreement.audioEvidencePrediction.replace(
                            /_/g,
                            " ",
                          )}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Agreement: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.phraseAudioAgreement.agreementScore.toFixed(0)}%
                        </span>
                      </p>
                    </div>
                    {evaluation.structuralCompatibility.inference.phraseAudioAgreement.disagreementReason ? (
                      <p className="mt-2 opacity-90">
                        {evaluation.structuralCompatibility.inference.phraseAudioAgreement.disagreementReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                    <p className="text-xs uppercase tracking-widest opacity-70">Detection Debug Inputs</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-4">
                      <p>
                        <span className="opacity-70">Playback progress: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.debug.playbackProgressMs != null
                            ? `${evaluation.structuralCompatibility.inference.debug.playbackProgressMs}ms`
                            : "—"}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Phrase position: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.debug.phrasePosition != null
                            ? `${evaluation.structuralCompatibility.inference.debug.phrasePosition.toFixed(1)}%`
                            : "—"}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Phrase window: </span>
                        <span className="font-semibold capitalize">
                          {evaluation.structuralCompatibility.inference.debug.phraseWindow?.replace(/_/g, " ") ?? "—"}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Current phrase section: </span>
                        <span className="font-semibold capitalize">
                          {evaluation.structuralCompatibility.inference.debug.currentPhraseSection ?? "—"}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Current energy: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.debug.currentEnergy?.toFixed(1) ?? "—"}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Energy trend: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.debug.energyTrend?.toFixed(1) ?? "—"}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Tension trend: </span>
                        <span className="font-semibold">
                          {evaluation.structuralCompatibility.inference.debug.tensionTrend?.toFixed(1) ?? "—"}
                        </span>
                      </p>
                      <p>
                        <span className="opacity-70">Detected section: </span>
                        <span className="font-semibold capitalize">
                          {evaluation.structuralCompatibility.inference.debug.detectedSection.replace(/_/g, " ")}
                        </span>
                      </p>
                    </div>
                    {Object.keys(evaluation.structuralCompatibility.inference.debug.classificationInputs).length ? (
                      <ul className="mt-2 list-inside list-disc space-y-1 opacity-80">
                        {Object.entries(evaluation.structuralCompatibility.inference.debug.classificationInputs)
                          .slice(0, 8)
                          .map(([key, value]) => (
                            <li key={key}>
                              {key}: {value == null ? "—" : String(value)}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </div>

                  {evaluation.structuralCompatibility.inference.sectionTransitionTimeline.length ? (
                    <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-3">
                      <p className="text-xs uppercase tracking-widest opacity-80">Section Transition Timeline</p>
                      <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                        {evaluation.structuralCompatibility.inference.sectionTransitionTimeline.slice(0, 12).map(
                          (event) => (
                            <li
                              key={`${event.timestampMs}-${event.detectedSection}-${event.trigger}`}
                              className="rounded border border-white/10 bg-black/30 p-2"
                            >
                              <span className="font-semibold capitalize">
                                {event.previousSection?.replace(/_/g, " ") ?? "start"} →{" "}
                                {event.detectedSection.replace(/_/g, " ")}
                              </span>
                              <span className="ml-2 opacity-70">({event.trigger.replace(/_/g, " ")})</span>
                              <p className="mt-1 opacity-80">{event.reason}</p>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  ) : null}

                  {evaluation.structuralCompatibility.inference.debug.inferenceReason.length ? (
                    <ul className="list-inside list-disc space-y-1 rounded-lg border border-white/10 bg-black/35 p-3 opacity-90">
                      {evaluation.structuralCompatibility.inference.debug.inferenceReason.slice(0, 8).map((line, index) => (
                        <li key={`inference-reason-${index}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="rounded-lg border border-violet-400/20 bg-violet-500/10 p-3">
                    <p className="text-xs uppercase tracking-widest opacity-80">Phrase Calibration (manual)</p>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="opacity-70">Human observed section</span>
                        <select
                          value={humanObservedSection}
                          onChange={(event) => setHumanObservedSection(event.target.value)}
                          className="rounded border border-white/20 bg-black/40 px-2 py-1"
                        >
                          {["intro", "verse", "pre_chorus", "chorus", "breakdown", "build", "drop", "outro"].map(
                            (section) => (
                              <option key={section} value={section}>
                                {section}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label className="flex min-w-[200px] flex-1 flex-col gap-1">
                        <span className="opacity-70">Notes</span>
                        <input
                          type="text"
                          value={calibrationNotes}
                          onChange={(event) => setCalibrationNotes(event.target.value)}
                          placeholder="e.g. Bijlee drop at 1:42"
                          className="rounded border border-white/20 bg-black/40 px-2 py-1"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isRecordingCalibration}
                        onClick={recordPhraseCalibration}
                        className="rounded border border-white/20 bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-50"
                      >
                        {isRecordingCalibration ? "Recording…" : "Record calibration"}
                      </button>
                    </div>
                    {evaluation.structuralCompatibility.inference.calibrationSummary ? (
                      <p className="mt-2 opacity-80">
                        Session: {evaluation.structuralCompatibility.inference.calibrationSummary.totalObservations}{" "}
                        observations, {evaluation.structuralCompatibility.inference.calibrationSummary.mismatchRate}%
                        mismatch rate.
                      </p>
                    ) : null}
                    {calibrationMessage ? <p className="mt-2 text-violet-100">{calibrationMessage}</p> : null}
                  </div>
                </div>
              ) : null}
              {evaluation.structuralCompatibility.reasoning.length ? (
                <ul className="mt-3 list-inside list-disc space-y-1 text-xs opacity-90">
                  {evaluation.structuralCompatibility.reasoning.slice(0, 4).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {evaluation?.audioIntelligence ? (
            <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 p-3 text-sm text-fuchsia-50">
              <p className="text-xs uppercase tracking-widest">AUDIO INTELLIGENCE</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Mixability</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.audioMixabilityScore.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Groove Continuity</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.grooveContinuity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Spectral Continuity</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.spectral.spectralContinuity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Vocal Safety</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.vocal.transitionSafety.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Drop Compatibility</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.drop.dropCompatibility.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Audio Confidence</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.audioConfidence.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Transition Risk</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.audioTransitionRisk.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Mix Recovery</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioMixRecovery?.recovered ? "recovered" : "pending"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {evaluation?.audioIntelligence ? (
            <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-50">
              <p className="text-xs uppercase tracking-widest">VOCAL COLLISION ANALYSIS</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Overlap Risk</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.vocal.overlapRisk.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Hook Collision</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.vocal.hookCollisionRisk.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Lyrical Conflict</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.vocal.lyricalConflictRisk.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Vocal Density</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.vocal.vocalDensity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3 md:col-span-2">
                  <p className="text-xs uppercase tracking-widest opacity-70">Recommendation</p>
                  <p className="mt-1 font-semibold capitalize">
                    {evaluation.audioIntelligence.vocal.recommendation.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {evaluation?.rollbackSurvivability ? (
            <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-50">
              <p className="text-xs uppercase tracking-widest">ROLLBACK SURVIVABILITY</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Rollback Readiness</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability.rollbackReadiness.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Survivability Score</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability.survivabilityScore.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Snapshot Integrity</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability.snapshotIntegrity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Replay Confidence</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability.replayConfidence.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Transport Recovery</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability.transportRecoveryConfidence.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Queue Recovery</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability.queueRecoveryConfidence.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Mutation Reliability</p>
                  <p className="mt-1 font-semibold">
                    {(evaluation.mutationReliability ?? 0).toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Survivable</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability.survivable ? "yes" : "no"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {evaluation?.transportRecovery ? (
            <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-sm text-cyan-50">
              <p className="text-xs uppercase tracking-widest">TRANSPORT RECOVERY</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Strategy</p>
                  <p className="mt-1 font-semibold capitalize">
                    {evaluation.transportRecovery.recoveryStrategy.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Recovery Score</p>
                  <p className="mt-1 font-semibold">{evaluation.transportRecovery.recoveryScore.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Device Continuity</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.transportRecovery.deviceContinuity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Playback Continuity</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.transportRecovery.playbackContinuity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Queue Recoverability</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.transportRecovery.queueRecoverability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Rollback Recoverability</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.transportRecovery.rollbackRecoverability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Confidence</p>
                  <p className="mt-1 font-semibold">{evaluation.transportRecovery.confidence.toFixed(1)}</p>
                </div>
              </div>
            </div>
          ) : null}

          {(evaluation?.latestCheckpointId || evaluation?.mutationJournalSize != null) ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-50">
              <p className="text-xs uppercase tracking-widest">MUTATION CHECKPOINTS</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Latest Checkpoint</p>
                  <p className="mt-1 font-mono text-xs font-semibold">
                    {evaluation.latestCheckpointId ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Checkpoint Coverage</p>
                  <p className="mt-1 font-semibold">
                    {(evaluation.rollbackSurvivability?.mutationCheckpointCoverage ?? 0).toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Journal Entries</p>
                  <p className="mt-1 font-semibold">{evaluation.mutationJournalSize ?? 0}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Recoverable</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.rollbackSurvivability?.survivable ? "yes" : "pending"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {evaluation?.audioIntelligence ? (
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-sm text-violet-50">
              <p className="text-xs uppercase tracking-widest">SPECTRAL COMPATIBILITY</p>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Low-End Collision</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.spectral.lowEndCollision.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Bass Masking</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.spectral.bassMaskingRisk.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Transient Conflict</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.spectral.transientConflict.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Brightness Conflict</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.spectral.brightnessConflict.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Groove Compatibility</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.spectral.grooveCompatibility.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {evaluation?.audioIntelligence ? (
            <div className="rounded-xl border border-orange-400/25 bg-orange-500/10 p-3 text-sm text-orange-50">
              <p className="text-xs uppercase tracking-widest">DROP TRANSITION ANALYSIS</p>
              <div className="mt-3 grid gap-3 md:grid-cols-5">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Survivability</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.drop.survivability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Tension Continuity</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.drop.tensionContinuity.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Emotional Carryover</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.drop.emotionalCarryover.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Impact Stability</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.drop.impactStability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Crowd Release</p>
                  <p className="mt-1 font-semibold">
                    {evaluation.audioIntelligence.drop.crowdReleaseAlignment.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {adaptiveRefinement?.phraseWindowAnalysis ? (
            <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-sm text-cyan-50">
              <p className="text-xs uppercase tracking-widest">PHRASE TIMING INTELLIGENCE</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Section</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.phraseWindowAnalysis.sectionType}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Phrase Position</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseWindowAnalysis.phrasePosition.toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Bars Remaining</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseWindowAnalysis.barsRemaining}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Survivability</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseWindowAnalysis.survivability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Safe Entry</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseWindowAnalysis.safeEntryWindow ? "yes" : "no"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Safe Exit</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseWindowAnalysis.safeExitWindow ? "yes" : "no"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Cadence Pressure</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseWindowAnalysis.cadencePressure.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Drift Severity</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.phraseWindowAnalysis.timingDriftSeverity}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {adaptiveRefinement?.phraseLockRecovery ? (
            <div className="rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3 text-sm text-indigo-50">
              <p className="text-xs uppercase tracking-widest">PHRASE LOCK RECOVERY</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Strategy</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.phraseLockRecovery.recoveryStrategy.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Bars Delayed</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseLockRecovery.barsDelayed}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Cadence Repair</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseLockRecovery.cadenceRepair.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Risk Reduction</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseLockRecovery.timingRiskReduction.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Retry</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseLockRecovery.retryRecommended ? "recommended" : "no"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Recovered</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.phraseLockRecovery.recovered ? "yes" : "no"}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs">
                {adaptiveRefinement.phraseLockRecovery.reasoning.map((reason, index) => (
                  <li key={`${reason}-${index}`}>- {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {adaptiveRefinement?.convergenceRecovery ? (
            <div className="rounded-xl border border-teal-400/25 bg-teal-500/10 p-3 text-sm text-teal-50">
              <p className="text-xs uppercase tracking-widest">CONVERGENCE RECOVERY</p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Convergence Delta</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceRecovery.convergenceDelta >= 0 ? "+" : ""}
                    {adaptiveRefinement.convergenceRecovery.convergenceDelta.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Synthesis Repair</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceRecovery.synthesisDelta >= 0 ? "+" : ""}
                    {adaptiveRefinement.convergenceRecovery.synthesisDelta.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Cadence Recovery</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceRecovery.cadenceDelta >= 0 ? "+" : ""}
                    {adaptiveRefinement.convergenceRecovery.cadenceDelta.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Survivability Repair</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceRecovery.survivabilityDelta >= 0 ? "+" : ""}
                    {adaptiveRefinement.convergenceRecovery.survivabilityDelta.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Retry Execution</p>
                  <p className="mt-1 font-semibold">
                    {adaptiveRefinement.convergenceRecovery.retryExecution ? "yes" : "no"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Recommendation</p>
                  <p className="mt-1 font-semibold capitalize">
                    {adaptiveRefinement.convergenceRecovery.finalRecommendation.replace(/_/g, " ")}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs">
                {adaptiveRefinement.convergenceRecovery.reasoning.map((reason, index) => (
                  <li key={`${reason}-${index}`}>- {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {autonomyReadiness ? (
            <div
              className={`rounded-xl border p-3 text-sm ${autonomyReadinessStyles(
                autonomyReadiness.readiness,
              )}`}
            >
              <p className="text-xs uppercase tracking-widest">AUTONOMY READINESS</p>
              <p className="mt-1 text-xs opacity-80">
                Bounded autonomy governance — does not enable unrestricted execution.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Readiness State</p>
                  <p className="mt-1 font-semibold capitalize">
                    {autonomyReadiness.readiness.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Readiness Score</p>
                  <p className="mt-1 font-semibold">{autonomyReadiness.readinessScore.toFixed(1)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Convergence Reliability</p>
                  <p className="mt-1 font-semibold">
                    {autonomyReadiness.convergenceReliability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Rollback Reliability</p>
                  <p className="mt-1 font-semibold">
                    {autonomyReadiness.rollbackReliability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Transport Reliability</p>
                  <p className="mt-1 font-semibold">
                    {autonomyReadiness.transportReliability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Phrase Recovery</p>
                  <p className="mt-1 font-semibold">
                    {autonomyReadiness.phraseRecoveryReliability.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Orchestration Consistency</p>
                  <p className="mt-1 font-semibold">
                    {autonomyReadiness.orchestrationConsistency.toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/35 p-3">
                  <p className="text-xs uppercase tracking-widest opacity-70">Execution Trust</p>
                  <p className="mt-1 font-semibold">
                    {autonomyReadiness.executionTrustScore.toFixed(1)}
                  </p>
                </div>
              </div>
              {autonomyReadiness.blockers.length > 0 ? (
                <p className="mt-3 text-xs">
                  Blockers: {autonomyReadiness.blockers.join(", ").replace(/_/g, " ")}
                </p>
              ) : null}
              {autonomyReadiness.recommendations.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs">
                  {autonomyReadiness.recommendations.map((rec, index) => (
                    <li key={`${rec}-${index}`}>- {rec}</li>
                  ))}
                </ul>
              ) : null}
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

