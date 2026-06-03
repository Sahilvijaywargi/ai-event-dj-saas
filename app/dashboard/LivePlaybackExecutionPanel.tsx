"use client";

import { useEffect, useRef, useState } from "react";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import {
  analyzeSimulationPredictionDrift,
  createRuntimeSimulationReplayEntry,
  summarizeSimulationReplay,
  withRuntimeCalibrationSnapshot,
  withRuntimeDriftAnalysis,
  withRuntimeRecoverySnapshot,
  withRuntimeNarrativeSnapshot,
} from "@/lib/ai/runtime-simulation-history";
import type { RuntimeRecoveryExecutionContext, RuntimeRecoverySignalContext } from "@/lib/ai/runtime-recovery-intelligence";
import type { RuntimeNarrativeSignalContext } from "@/lib/ai/runtime-narrative-orchestration";
import { fetchRuntimeJson } from "@/lib/client/fetch-runtime-json";
import { mergeExecutionState, shouldApplyExecutionTelemetry } from "@/lib/client/execution-state-merge";

type LivePlaybackExecutionPanelProps = {
  queueRecommendations: QueueRecommendationWithMeta[];
};

function buildRecoverySignalFromEvaluation(
  evaluation: TransitionEvaluationResult,
): RuntimeRecoverySignalContext {
  return {
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
  };
}

function buildNarrativeSignalFromEvaluation(
  evaluation: TransitionEvaluationResult,
): RuntimeNarrativeSignalContext {
  return {
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
  };
}

type PlaybackExecutionState = {
  executionId: string;
  executionStatus:
    | "idle"
    | "preparing"
    | "queued"
    | "executing"
    | "completed"
    | "aborted"
    | "rollback";
  targetTrackUri?: string;
  targetTrackName?: string;
  preparationConfidence: number;
  executionConfidence: number;
  rollbackAvailable: boolean;
  executionStartedAt?: number;
  executionCompletedAt?: number;
  executionReasoning: string[];
  executionSafety: "safe" | "guarded" | "high_risk";
  operatorApprovalRequired: boolean;
  mutationSessionId: string;
  mutationStartedAt?: number;
  mutationHeartbeatAt?: number;
  mutationState:
    | "idle"
    | "preparing"
    | "validating"
    | "mutating"
    | "verifying"
    | "rollback_pending"
    | "stabilized"
    | "failed";
  mutationContinuity: number;
  mutationVerificationConfidence: number;
  queueMutationFreshness: number;
  rollbackIntegrity: number;
  transportMutationSafety: number;
  queueVerificationPassed: boolean;
  queueVerificationResult?: string;
  mutationAttemptCount: number;
  retryBoundReached: boolean;
  mutationStateChangedAt?: number;
  rollbackIntegrityReasoning: string[];
  latestVerificationResult?: {
    verificationPassed: boolean;
    verificationConfidence: number;
    queueVerified: boolean;
    targetUriDetected: boolean;
    transportHealthy: boolean;
    rollbackSnapshotHealthy: boolean;
    verificationReasoning: string[];
  };
  mutationTimeline?: Array<{
    timestamp: number;
    state: string;
    reasoning: string;
  }>;
  verificationPhaseDurationMs?: number;
  verificationGraceActive?: boolean;
  rollbackPreservationState?: "active" | "inactive";
  rollbackIntegrityContributors?: string[];
  transportAuthState?: "healthy" | "refreshed" | "degraded";
  tokenRefreshStatus?: "not_needed" | "refreshed" | "failed";
  verificationFinalized?: boolean;
  stabilizationCompleted?: boolean;
  rollbackRecomputeStatus?: "pending" | "completed" | "failed";
  recommendationFreshnessState?: "healthy" | "aging" | "stale" | "expired";
  accessTokenExpiresAt?: number | null;
  lastSuccessfulRefreshAt?: number | null;
  refreshFailureCount?: number;
  authRecoveryReasoning?: string[];
  verificationContinuity?: number;
  verificationFreshnessConfidence?: number;
  verificationTransportLatency?: number;
  verificationHeartbeatContinuity?: number;
  verificationMutationConsistency?: number;
  verificationWindowIntegrity?: number;
  verificationSnapshotReliability?: number;
  verificationRecoveryConfidence?: number;
  verificationStabilizationConfidence?: number;
  verificationFailurePressure?: number;
  verificationStabilizationSummary?: string[];
  mutationVerification?: {
    verificationScore: number;
    verificationConfidence: number;
    passed: boolean;
    retriable: boolean;
    instabilityDetected: boolean;
    reasons: readonly string[];
  };
  rollbackStability?: {
    rollbackConfidence: number;
    rollbackIntegrityScore: number;
    restorationFeasibility: number;
    rollbackAllowed: boolean;
    rollbackBlockers: readonly string[];
    rollbackReasoning: readonly string[];
  };
  mutationHeartbeat?: {
    heartbeatStatus: "healthy" | "watch" | "degraded" | "critical";
    mutationHealthScore: number;
    mutationDriftScore: number;
    transportFreshnessScore: number;
    propagationDelayMs: number;
    playbackDesyncScore: number;
    reasoning: readonly string[];
  };
  freshnessGrace?: {
    state: "inactive" | "active" | "expired";
    graceFailure: boolean;
    confidencePenalty: number;
    graceWindowMs: number;
    graceRemainingMs: number;
    reasons: readonly string[];
  };
  mutationLifecycle?: {
    state: string;
    transitionReason: string;
  };
  mutationAuditTrail?: Array<{
    timestamp: number;
    lifecycleState: string;
    degradationReasons: readonly string[];
    verificationOutcome: {
      verificationState: string;
      verificationScore: number;
      passed: boolean;
    };
    heartbeatDiagnostics: {
      heartbeatStatus: string;
    };
  }>;
  executionStabilityScore?: number;
  transportIntegrityScore?: number;
  mutationRecoverabilityScore?: number;
  degradationSeverity?: "none" | "low" | "moderate" | "high" | "critical";
  executionHealthClassification?:
    | "stable"
    | "stabilizing"
    | "degraded"
    | "rollback_sensitive"
    | "verification_risk"
    | "transport_unstable"
    | "critical";
  verificationConfidence?: number;
  verificationReasons?: string[];
  instabilityDetected?: boolean;
  retriableVerificationFailure?: boolean;
  rollbackConfidence?: number;
  rollbackIntegrityScore?: number;
  rollbackBlockers?: readonly string[];
  restorationFeasibility?: number;
  rollbackAllowed?: boolean;
  mutationHealthScore?: number;
  mutationDriftScore?: number;
  transportFreshnessScore?: number;
  heartbeatStatus?: "healthy" | "watch" | "degraded" | "critical";
  graceState?: "inactive" | "active" | "expired";
  graceFailure?: boolean;
  graceConfidencePenalty?: number;
  graceReasons?: readonly string[];
  runtimeObservabilitySummary?: string[];
  rollbackVerificationStage?: string;
  rollbackReconciliationState?: string;
  continuityTrustScore?: number;
  rollbackVerificationBlockers?: readonly string[];
  telemetryVersion?: number;
  telemetryUpdatedAt?: number;
  verificationSequence?: number;
  observabilitySurface?: {
    lifecycleState?: string;
    verificationScore?: number;
    rollbackConfidence?: number;
    heartbeatHealth?: number;
  };
};

function getAuthoritativeVerificationMetrics(state: PlaybackExecutionState | null) {
  if (!state) {
    return {
      rollbackIntegrity: 0,
      verificationConfidence: 0,
      lifecycleState: "pending",
      rollbackVerificationStage: "pending",
      queueVerificationLabel: "pending",
    };
  }
  const rollbackIntegrity =
    state.rollbackIntegrity ??
    state.rollbackIntegrityScore ??
    state.observabilitySurface?.rollbackConfidence ??
    0;
  const verificationConfidence =
    state.verificationConfidence ??
    state.mutationVerificationConfidence ??
    state.mutationVerification?.verificationConfidence ??
    state.observabilitySurface?.verificationScore ??
    0;
  return {
    rollbackIntegrity,
    verificationConfidence,
    lifecycleState: state.mutationLifecycle?.state ?? state.mutationState ?? "pending",
    rollbackVerificationStage: state.rollbackVerificationStage ?? "pending",
    queueVerificationLabel: state.queueVerificationPassed
      ? "finalized"
      : state.queueVerificationResult ?? "pending",
  };
}

function severityStyles(severity?: PlaybackExecutionState["degradationSeverity"]) {
  if (severity === "none") return "border-emerald-400/25 bg-emerald-500/5 text-emerald-100";
  if (severity === "low") return "border-cyan-300/25 bg-cyan-500/5 text-cyan-100";
  if (severity === "moderate") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (severity === "high") return "border-orange-400/35 bg-orange-500/10 text-orange-100";
  if (severity === "critical") return "border-red-400/40 bg-red-500/12 text-red-100";
  return "border-white/10 bg-black/35 text-white/80";
}

function heartbeatStyles(status?: PlaybackExecutionState["heartbeatStatus"]) {
  if (status === "healthy") return "text-emerald-200";
  if (status === "watch") return "text-cyan-200";
  if (status === "degraded") return "text-amber-200";
  if (status === "critical") return "text-red-200";
  return "text-white/80";
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

type RuntimeSyncDiagnostics = {
  syncStarted: boolean;
  currentStage: string;
  lastCompletedStep: string;
  failureReason: string | null;
  transportReadiness: string;
  rollbackReadiness: string;
  queueSnapshotStatus: string;
};

const SYNC_API_RETRIES = 3;
const SYNC_API_RETRY_DELAY_MS = 2000;

const INITIAL_SYNC_DIAGNOSTICS: RuntimeSyncDiagnostics = {
  syncStarted: false,
  currentStage: "idle",
  lastCompletedStep: "none",
  failureReason: null,
  transportReadiness: "unknown",
  rollbackReadiness: "unknown",
  queueSnapshotStatus: "not fetched",
};

function describeTransportReadiness(evaluation: TransitionEvaluationResult | null) {
  if (!evaluation) return "evaluation pending";
  const parts = [
    `readiness=${evaluation.executionReadiness}`,
    `sync=${evaluation.deviceSynchronizationConfidence.toFixed(0)}`,
    `transport=${evaluation.transportStability.toFixed(0)}`,
  ];
  if (evaluation.executionBlockers.length > 0) {
    parts.push(`blockers=${evaluation.executionBlockers.slice(0, 3).join(",")}`);
  }
  return parts.join(" · ");
}

export function LivePlaybackExecutionPanel({ queueRecommendations }: LivePlaybackExecutionPanelProps) {
  const [evaluation, setEvaluation] = useState<TransitionEvaluationResult | null>(null);
  const [state, setState] = useState<PlaybackExecutionState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDiagnostics, setSyncDiagnostics] = useState<RuntimeSyncDiagnostics>(INITIAL_SYNC_DIAGNOSTICS);
  const [simulationReplay, setSimulationReplay] = useState<ReturnType<typeof createRuntimeSimulationReplayEntry> | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const isRefreshingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const isMountedRef = useRef(true);
  const executionTelemetryVersionRef = useRef(0);
  const executionStateRef = useRef<PlaybackExecutionState | null>(null);

  function applyExecutionState(
    incoming: PlaybackExecutionState | null,
    source: "prepare" | "refresh" | "action",
  ) {
    if (!isMountedRef.current) return executionStateRef.current;
    const current = executionStateRef.current;
    if (incoming && !shouldApplyExecutionTelemetry(current, incoming)) {
      console.log("[TELEMETRY] rejected stale snapshot", {
        source,
        currentVersion: current?.telemetryVersion ?? 0,
        incomingVersion: incoming.telemetryVersion ?? 0,
        currentUpdatedAt: current?.telemetryUpdatedAt ?? 0,
        incomingUpdatedAt: incoming.telemetryUpdatedAt ?? 0,
        currentFinalized: current?.verificationFinalized ?? false,
        incomingFinalized: incoming.verificationFinalized ?? false,
      });
      return current;
    }
    const merged = mergeExecutionState(current, incoming);
    executionStateRef.current = merged;
    if (merged?.telemetryVersion) {
      executionTelemetryVersionRef.current = merged.telemetryVersion;
    }
    const metrics = getAuthoritativeVerificationMetrics(merged);
    console.log("[TELEMETRY] diagnostics render state", {
      source,
      telemetryVersion: merged?.telemetryVersion,
      verificationSequence: merged?.verificationSequence,
      ...metrics,
    });
    setState(merged);
    return merged;
  }

  function patchSyncDiagnostics(patch: Partial<RuntimeSyncDiagnostics>) {
    if (!isMountedRef.current) return;
    setSyncDiagnostics((current) => ({ ...current, ...patch }));
  }

  async function fetchExecutionState(options?: { force?: boolean }) {
    if (isSyncingRef.current && !options?.force) {
      console.log("[TELEMETRY] fetchExecutionState skipped — sync in progress");
      return;
    }
    if (isRefreshingRef.current) {
      console.log("[SYNC] fetchExecutionState skipped — refresh already in progress");
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      console.log("[SYNC] fetchExecutionState skipped — document not visible");
      return;
    }
    isRefreshingRef.current = true;
    try {
      console.log("[SYNC] fetching playback execution state");
      const { data } = await fetchRuntimeJson<{ state?: PlaybackExecutionState; message?: string }>(
        "/api/playback-execution/state",
        undefined,
        { retries: SYNC_API_RETRIES, retryDelayMs: SYNC_API_RETRY_DELAY_MS },
      );
      const refreshed = data.state ?? null;
      console.log("[TELEMETRY] state refresh received", {
        telemetryVersion: refreshed?.telemetryVersion,
        telemetryUpdatedAt: refreshed?.telemetryUpdatedAt,
        verificationSequence: refreshed?.verificationSequence,
        verificationFinalized: refreshed?.verificationFinalized,
        rollbackIntegrity: refreshed?.rollbackIntegrity,
        verificationConfidence: refreshed?.verificationConfidence,
      });
      applyExecutionState(refreshed, "refresh");
    } catch (error) {
      console.error("[SYNC ERROR]", error);
      if (isMountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load execution state.");
        patchSyncDiagnostics({
          failureReason: error instanceof Error ? error.message : "Failed to load execution state.",
          currentStage: "failed",
        });
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }

  async function handleSync() {
    console.log("[SYNC] clicked");
    if (isSyncingRef.current) {
      console.log("[SYNC] skipped — sync already in progress");
      return;
    }
    isSyncingRef.current = true;
    setIsSyncing(true);
    setIsLoading(true);
    setErrorMessage(null);
    setMessage(null);
    patchSyncDiagnostics({
      syncStarted: true,
      currentStage: "starting",
      lastCompletedStep: "none",
      failureReason: null,
      transportReadiness: "pending",
      rollbackReadiness: "pending",
      queueSnapshotStatus: "pending",
    });
    console.log("[SYNC] button pressed");

    let evalData: TransitionEvaluationResult | null = evaluation;
    const syncWarnings: string[] = [];

    try {
      patchSyncDiagnostics({ currentStage: "evaluating_transition" });
      console.log("[SYNC] validating transport auth");
      evalData = evaluation ?? (await evaluateExecution());
      if (evalData) setEvaluation(evalData);
      patchSyncDiagnostics({
        lastCompletedStep: "transition_evaluation",
        transportReadiness: describeTransportReadiness(evalData),
      });

      if (!evalData) {
        throw new Error("Transition evaluation unavailable — cannot bootstrap transport sync.");
      }

      if (evalData.executionReadiness === "blocked") {
        syncWarnings.push(`execution_readiness_blocked (${evalData.executionBlockers.join(", ") || "no blockers listed"})`);
      }
      if (evalData.deviceSynchronizationConfidence < 45) {
        syncWarnings.push("transport_sync_critical");
      }
      if ((evalData.telemetry?.freshness ?? "unknown") === "expired") {
        syncWarnings.push("stale_telemetry_transition_evaluation");
      }

      patchSyncDiagnostics({ currentStage: "transport_recovery" });
      console.log("[SYNC] fetching playback state (transport recovery)");
      const { data: recoveryData, response: recoveryResponse } = await fetchRuntimeJson<{
        message?: string;
        recovery?: { blockers?: string[]; synchronizationHealth?: string };
      }>(
        "/api/transport/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluation: evalData, recoveryMode: true }),
        },
        {
          allowNonOk: true,
          retries: SYNC_API_RETRIES,
          retryDelayMs: SYNC_API_RETRY_DELAY_MS,
        },
      );
      if (!recoveryResponse.ok) {
        const recoveryMessage =
          recoveryData.message ??
          recoveryData.recovery?.blockers?.join(", ") ??
          "Transport synchronization recovery failed.";
        syncWarnings.push(recoveryMessage);
        console.error("[SYNC ERROR] transport recovery", recoveryMessage, recoveryData);
        patchSyncDiagnostics({
          failureReason: recoveryMessage,
          transportReadiness: `recovery_failed · ${recoveryMessage}`,
        });
      } else {
        console.log("[SYNC] transport recovery completed");
        patchSyncDiagnostics({
          lastCompletedStep: "transport_recovery",
          transportReadiness: recoveryData.recovery?.synchronizationHealth ?? "recovered",
        });
      }

      patchSyncDiagnostics({ currentStage: "transport_prepare" });
      console.log("[SYNC] preparing transport execution window");
      const { data: transportData, response: transportResponse } = await fetchRuntimeJson<{
        message?: string;
        result?: { blockers?: string[]; synchronizationHealth?: string };
      }>(
        "/api/transport/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluation: evalData, recoveryMode: false, queueTrack: false }),
        },
        {
          allowNonOk: true,
          retries: SYNC_API_RETRIES,
          retryDelayMs: SYNC_API_RETRY_DELAY_MS,
        },
      );
      if (!transportResponse.ok) {
        const transportMessage =
          transportData.message ??
          transportData.result?.blockers?.join(", ") ??
          "Transport preparation blocked.";
        syncWarnings.push(transportMessage);
        console.error("[SYNC ERROR] transport prepare", transportMessage, transportData);
        patchSyncDiagnostics({
          failureReason: transportMessage,
          transportReadiness: `prepare_blocked · ${transportMessage}`,
        });
      } else {
        console.log("[SYNC] transport execution window prepared");
        patchSyncDiagnostics({
          lastCompletedStep: "transport_prepare",
          transportReadiness: transportData.result?.synchronizationHealth ?? "prepared",
        });
      }

      patchSyncDiagnostics({ currentStage: "execution_prepare" });
      console.log("[SYNC] fetching queue snapshot");
      const { data: prepareData, response: prepareResponse } = await fetchRuntimeJson<{
        state?: PlaybackExecutionState;
        evaluation?: TransitionEvaluationResult;
        blockers?: string[];
        message?: string;
        ok?: boolean;
      }>(
        "/api/playback-execution/prepare",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluation: evalData }),
        },
        {
          allowNonOk: true,
          retries: SYNC_API_RETRIES,
          retryDelayMs: SYNC_API_RETRY_DELAY_MS,
        },
      );
      if (!prepareResponse.ok) {
        const prepareMessage =
          prepareData.message ??
          prepareData.blockers?.join(", ") ??
          "Playback execution prepare failed.";
        throw new Error(prepareMessage);
      }

      const preparedState = applyExecutionState(
        (prepareData.state as PlaybackExecutionState | undefined) ?? null,
        "prepare",
      );
      if (prepareData.evaluation) setEvaluation(prepareData.evaluation);
      console.log("[TELEMETRY] stabilization finalized", {
        telemetryVersion: preparedState?.telemetryVersion,
        verificationFinalized: preparedState?.verificationFinalized,
        rollbackIntegrity: preparedState?.rollbackIntegrity,
        verificationConfidence: preparedState?.verificationConfidence,
      });

      const blockers = (prepareData.blockers as string[] | undefined) ?? [];
      const queueStatus =
        blockers.length === 0
          ? "snapshot captured"
          : `blocked (${blockers.join(", ")})`;
      const rollbackStatus = preparedState?.rollbackAvailable
        ? `available (integrity ${preparedState.rollbackIntegrityScore?.toFixed(2) ?? preparedState.rollbackIntegrity?.toFixed(2) ?? "0.00"})`
        : preparedState?.rollbackAllowed
          ? "allowed"
          : blockers.includes("no_active_device")
            ? "blocked — no active device"
            : "not available — no currently playing track";

      console.log("[SYNC] rollback snapshot created");
      console.log("[SYNC] execution state updated", {
        lifecycle: preparedState?.mutationLifecycle?.state,
        transportIntegrity: preparedState?.transportIntegrityScore,
        rollbackAvailable: preparedState?.rollbackAvailable,
      });

      patchSyncDiagnostics({
        lastCompletedStep: "execution_prepare",
        queueSnapshotStatus: queueStatus,
        rollbackReadiness: rollbackStatus,
        currentStage: "refresh_state",
      });

      console.log("[SYNC] fetching playback state");
      await fetchExecutionState({ force: true });

      if (preparedState?.verificationFinalized) {
        const filtered = syncWarnings.filter(
          (warning) =>
            !warning.includes("stale_telemetry") && !warning.includes("stale_playback_telemetry"),
        );
        syncWarnings.length = 0;
        syncWarnings.push(...filtered);
      }

      if (blockers.length > 0) {
        const blockerMessage = `Execution prepared with safety blockers: ${blockers.join(", ")}`;
        syncWarnings.push(blockerMessage);
        patchSyncDiagnostics({ failureReason: blockerMessage });
        if (isMountedRef.current) setErrorMessage(blockerMessage);
      } else if (syncWarnings.length > 0) {
        const warningMessage = syncWarnings.join(" · ");
        if (isMountedRef.current) setMessage(`Sync completed with warnings: ${warningMessage}`);
        patchSyncDiagnostics({ failureReason: warningMessage });
      } else {
        if (isMountedRef.current) {
          setMessage("Transport sync and execution bootstrap completed.");
        }
        patchSyncDiagnostics({ failureReason: null });
      }

      patchSyncDiagnostics({
        currentStage: "completed",
        lastCompletedStep: "state_refresh",
        transportReadiness: describeTransportReadiness(evalData),
      });
      console.log("[SYNC] completed successfully");
    } catch (error) {
      const failure = error instanceof Error ? error.message : String(error);
      console.error("[SYNC ERROR]", error);
      patchSyncDiagnostics({
        currentStage: "failed",
        failureReason: failure,
      });
      if (isMountedRef.current) setErrorMessage(failure);
      try {
        await fetchExecutionState();
      } catch (refreshError) {
        console.error("[SYNC ERROR] state refresh after failure", refreshError);
      }
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current) {
        setIsSyncing(false);
        setIsLoading(false);
      }
    }
  }

  async function evaluateExecution() {
    const { data } = await fetchRuntimeJson<{ evaluation?: TransitionEvaluationResult; message?: string }>(
      "/api/transition-engine/evaluate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistedAutonomousEnabled: true,
          queueRecommendations,
        }),
      },
      { retries: SYNC_API_RETRIES, retryDelayMs: SYNC_API_RETRY_DELAY_MS },
    );
    setEvaluation(data.evaluation ?? null);
    if (!data.evaluation) {
      throw new Error(data.message ?? "Failed transition evaluation for playback execution.");
    }
    return data.evaluation;
  }

  async function callAction(endpoint: string, payload?: Record<string, unknown>) {
    setIsLoading(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const evalData = evaluation ?? (await evaluateExecution());
      const replayEntryBase = createRuntimeSimulationReplayEntry({
        orchestrationConfidenceSnapshot: evalData.confidence.score,
        compatibilitySnapshot: {
          compatibilityScore: evalData.transitionDiagnostics.compatibilityScore,
          phraseAlignmentScore: evalData.transitionDiagnostics.compatibilityPhraseAlignmentScore,
          harmonicScore: evalData.transitionDiagnostics.compatibilityHarmonicScore,
          vocalClashScore: evalData.transitionDiagnostics.compatibilityVocalClashScore,
          energyFlowScore: evalData.transitionDiagnostics.compatibilityEnergyFlowScore,
          riskLevel: evalData.transitionDiagnostics.compatibilityRiskLevel,
        },
        learningSnapshot: {
          learningConfidenceBias: evalData.transitionDiagnostics.learningConfidenceBias ?? 0,
          learningRiskBias: evalData.transitionDiagnostics.learningRiskBias ?? 0,
          stabilizationPriority: evalData.transitionDiagnostics.stabilizationPriority ?? 0,
          escalationClamp: evalData.transitionDiagnostics.escalationClamp ?? 0,
        },
        simulationOutcome: {
          predictedTransitionSuccess: Math.max(0, Math.min(100, evalData.confidence.score)),
          predictedCrowdRecovery: Math.max(0, Math.min(100, evalData.crowdRecoveryConfidence)),
          predictedExecutionStability: Math.max(0, Math.min(100, evalData.executionReadinessScore)),
          predictedRiskShift:
            evalData.riskLevel === "high" ? 40 : evalData.riskLevel === "medium" ? 15 : -10,
          predictedEnergyFlow: Math.max(0, Math.min(100, evalData.transitionDiagnostics.compatibilityEnergyFlowScore)),
          predictedRecoveryPressure: Math.max(0, Math.min(100, 100 - evalData.rollbackReadiness)),
        },
        recommendedAction:
          evalData.executionReadiness === "blocked"
            ? "reject_transition"
            : evalData.executionReadiness === "guarded"
              ? "require_operator_review"
              : evalData.transitionDiagnostics.compatibilityEnergyFlowScore < 55
                ? "reduce_energy"
                : (evalData.transitionDiagnostics.stabilizationPriority ?? 0) >= 68
                  ? "stabilize_first"
                  : "proceed_supervised",
        reasoning: evalData.transitionDiagnostics.learningReasons ?? evalData.confidence.reasons,
      });
      const replayWithDrift = withRuntimeDriftAnalysis({
        predicted: replayEntryBase,
        actual: {
          actualConfidence: state?.executionConfidence ?? evalData.confidence.score,
          actualRecoveryPressure:
            state?.verificationFailurePressure ??
            Math.max(
              0,
              Math.min(
                100,
                100 - (state?.rollbackConfidence ?? evalData.rollbackReadiness ?? 50),
              ),
            ),
          actualExecutionStability:
            state?.executionStabilityScore ??
            state?.verificationStabilizationConfidence ??
            evalData.executionReadinessScore,
        },
      });
      const replayWithCalibration = withRuntimeCalibrationSnapshot({
        userId: state?.mutationSessionId ?? "live-playback-replay",
        predicted: replayWithDrift,
      });
      const replayWithRecovery = withRuntimeRecoverySnapshot({
        predicted: replayWithCalibration,
        signalSummary: buildRecoverySignalFromEvaluation(evalData),
        playbackExecution: (state ?? {
          executionId: "simulation",
          executionStatus: "executing",
          preparationConfidence: 0,
          executionConfidence: 0,
          rollbackAvailable: false,
          executionReasoning: [],
          executionSafety: "guarded",
          operatorApprovalRequired: true,
        }) as RuntimeRecoveryExecutionContext,
      });
      const replayEntry = withRuntimeNarrativeSnapshot({
        predicted: replayWithRecovery,
        signalSummary: buildNarrativeSignalFromEvaluation(evalData),
        actualDrift: {
          narrativeStability: Math.max(0, 100 - (replayWithDrift.driftAnalysis?.normalizedDriftScore ?? 0)),
          pacingContinuity: evalData.narrativeContinuity,
          fatiguePressure: evalData.narrativeFatigueRisk,
          recoveryContinuity: evalData.crowdRecoveryConfidence,
        },
      });
      setSimulationReplay(replayEntry);
      void analyzeSimulationPredictionDrift({
        predicted: replayEntryBase,
        actual: {
          actualConfidence: state?.executionConfidence ?? evalData.confidence.score,
          actualRecoveryPressure:
            state?.verificationFailurePressure ??
            Math.max(
              0,
              Math.min(
                100,
                100 - (state?.rollbackConfidence ?? evalData.rollbackReadiness ?? 50),
              ),
            ),
          actualExecutionStability:
            state?.executionStabilityScore ??
            state?.verificationStabilizationConfidence ??
            evalData.executionReadinessScore,
        },
      });
      const { data } = await fetchRuntimeJson<{
        state?: PlaybackExecutionState;
        message?: string;
        evaluation?: TransitionEvaluationResult;
      }>(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evaluation: evalData, ...(payload ?? {}) }),
        },
        { retries: SYNC_API_RETRIES, retryDelayMs: SYNC_API_RETRY_DELAY_MS },
      );
      applyExecutionState(data.state ?? null, "action");
      setMessage(data.message ?? "Playback execution action completed.");
      if (data.evaluation) setEvaluation(data.evaluation);
    } catch (error) {
      console.error("[SYNC ERROR] playback execution action failed", error);
      setErrorMessage(error instanceof Error ? error.message : "Playback execution action failed.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void fetchExecutionState();
    }, 0);
    const interval = setInterval(() => {
      if (isSyncingRef.current) return;
      void fetchExecutionState();
    }, 25000);
    const nowTick = setInterval(() => {
      if (!isMountedRef.current) return;
      setNowTs(Date.now());
    }, 1000);
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      clearInterval(interval);
      clearInterval(nowTick);
    };
  }, []);

  const verificationMetrics = getAuthoritativeVerificationMetrics(state);

  return (
    <article id="live-playback-execution" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Live Playback Execution</h2>
          <p className="mt-1 text-sm text-white/65">
            Supervised live playback preparation with bounded queue mutation and rollback safety.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            console.log("[SYNC] clicked");
            void handleSync();
          }}
          disabled={isLoading || isSyncing}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
        >
          {isSyncing ? "Syncing…" : "Sync"}
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-cyan-300/25 bg-cyan-500/5 p-3 text-sm text-cyan-50">
        <p className="text-xs uppercase tracking-widest text-cyan-200/80">Runtime Sync Diagnostics</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <p>
            <span className="text-white/60">Sync started:</span>{" "}
            {syncDiagnostics.syncStarted ? `yes (${new Date(nowTs).toLocaleTimeString()})` : "no"}
          </p>
          <p>
            <span className="text-white/60">Current stage:</span> {syncDiagnostics.currentStage}
          </p>
          <p>
            <span className="text-white/60">Last completed step:</span> {syncDiagnostics.lastCompletedStep}
          </p>
          <p>
            <span className="text-white/60">Failure reason:</span>{" "}
            {syncDiagnostics.failureReason ?? "none"}
          </p>
          <p>
            <span className="text-white/60">Transport readiness:</span> {syncDiagnostics.transportReadiness}
          </p>
          <p>
            <span className="text-white/60">Rollback readiness:</span> {syncDiagnostics.rollbackReadiness}
          </p>
          <p className="md:col-span-2">
            <span className="text-white/60">Queue snapshot:</span> {syncDiagnostics.queueSnapshotStatus}
          </p>
        </div>
        {isSyncing ? (
          <p className="mt-2 text-xs text-cyan-100/80">Bootstrap in progress — check browser console for [SYNC] checkpoints.</p>
        ) : null}
      </div>

      <div className="mb-4 rounded-xl border border-violet-300/25 bg-violet-500/5 p-3 text-sm text-violet-50">
        <p className="text-xs uppercase tracking-widest text-violet-200/80">Runtime Verification Diagnostics</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <p>
            <span className="text-white/60">Lifecycle state:</span> {verificationMetrics.lifecycleState}
          </p>
          <p>
            <span className="text-white/60">Rollback verification stage:</span>{" "}
            {verificationMetrics.rollbackVerificationStage}
          </p>
          <p>
            <span className="text-white/60">Reconciliation state:</span>{" "}
            {state?.rollbackReconciliationState ?? "pending"}
          </p>
          <p>
            <span className="text-white/60">Continuity trust:</span>{" "}
            {state?.continuityTrustScore?.toFixed(2) ?? "0.00"}
          </p>
          <p>
            <span className="text-white/60">Verification confidence:</span>{" "}
            {verificationMetrics.verificationConfidence.toFixed(2)}
          </p>
          <p>
            <span className="text-white/60">Rollback integrity:</span>{" "}
            {verificationMetrics.rollbackIntegrity.toFixed(2)}
          </p>
          <p>
            <span className="text-white/60">Queue verification:</span> {verificationMetrics.queueVerificationLabel}
          </p>
          <p>
            <span className="text-white/60">Telemetry version:</span>{" "}
            {state?.telemetryVersion ?? 0} / seq {state?.verificationSequence ?? 0}
          </p>
          <p className="md:col-span-2">
            <span className="text-white/60">Verification blockers:</span>{" "}
            {(state?.rollbackVerificationBlockers ?? state?.rollbackBlockers ?? []).length > 0
              ? (state?.rollbackVerificationBlockers ?? state?.rollbackBlockers ?? []).join(", ")
              : "none"}
          </p>
        </div>
        <ul className="mt-2 space-y-1 text-xs text-violet-100/85">
          {(state?.rollbackIntegrityReasoning ?? []).slice(0, 5).map((reason, index) => (
            <li key={`rollback-reason-${index}`}>- {reason}</li>
          ))}
          {(state?.rollbackIntegrityReasoning ?? []).length === 0 ? (
            <li className="text-white/55">No rollback integrity reasoning recorded yet.</li>
          ) : null}
        </ul>
      </div>

      {errorMessage ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}
      {message ? (
        <p className="mb-3 rounded-xl border border-purple-300/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-100">
          {message}
        </p>
      ) : null}

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Execution Status</p>
          <p className="mt-1 font-semibold">{state?.executionStatus ?? "idle"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Execution Safety</p>
          <p className="mt-1 font-semibold">{state?.executionSafety ?? "guarded"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Rollback Availability</p>
          <p className="mt-1 font-semibold">{state?.rollbackAvailable ? "available" : "not available"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Operator Approval</p>
          <p className="mt-1 font-semibold">{state?.operatorApprovalRequired ? "required" : "not required"}</p>
        </div>
      </div>

      <div className={`mb-4 rounded-xl border p-3 text-sm ${severityStyles(state?.degradationSeverity)}`}>
        <p className="text-xs uppercase tracking-widest">TRANSPORT MUTATION HEALTH</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs text-white/65">Execution Health</p>
            <p className="font-semibold">{state?.executionHealthClassification ?? "stabilizing"}</p>
          </div>
          <div>
            <p className="text-xs text-white/65">Lifecycle State</p>
            <p className="font-semibold">{state?.mutationLifecycle?.state ?? state?.mutationState ?? "idle"}</p>
          </div>
          <div>
            <p className="text-xs text-white/65">Degradation Severity</p>
            <p className="font-semibold">{state?.degradationSeverity ?? "none"}</p>
          </div>
        </div>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <p>Execution stability: {state?.executionStabilityScore?.toFixed(2) ?? "0.00"}</p>
          <p>Transport integrity: {state?.transportIntegrityScore?.toFixed(2) ?? "0.00"}</p>
          <p>Recoverability: {state?.mutationRecoverabilityScore?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Transport Auth State</p>
          <p className="mt-1">{state?.transportAuthState ?? "healthy"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Token Refresh</p>
          <p className="mt-1">{state?.tokenRefreshStatus ?? "not_needed"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recommendation Freshness</p>
          <p className="mt-1">{state?.recommendationFreshnessState ?? "healthy"}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Token Expiry Remaining</p>
          <p className="mt-1">
            {state?.accessTokenExpiresAt
              ? `${Math.max(0, Math.round((state.accessTokenExpiresAt - nowTs) / 1000))}s`
              : "n/a"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Last Successful Refresh</p>
          <p className="mt-1">
            {state?.lastSuccessfulRefreshAt
              ? `${Math.max(0, Math.round((nowTs - state.lastSuccessfulRefreshAt) / 1000))}s ago`
              : "n/a"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Refresh Failure Count</p>
          <p className="mt-1">{state?.refreshFailureCount ?? 0}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Finalized</p>
          <p className="mt-1">{state?.verificationFinalized ? "yes" : "no"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Stabilization Completed</p>
          <p className="mt-1">{state?.stabilizationCompleted ? "yes" : "no"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Rollback Recompute</p>
          <p className="mt-1">{state?.rollbackRecomputeStatus ?? "pending"}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation State</p>
          <p className="mt-1 font-semibold">{state?.mutationState ?? "idle"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation Continuity</p>
          <p className="mt-1 font-semibold">{state?.mutationContinuity?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Confidence</p>
          <p className="mt-1 font-semibold">{state?.mutationVerificationConfidence?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Rollback Integrity</p>
          <p className="mt-1 font-semibold">{state?.rollbackIntegrity?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Queue Mutation Freshness</p>
          <p className="mt-1">{state?.queueMutationFreshness?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Transport Mutation Safety</p>
          <p className="mt-1">{state?.transportMutationSafety?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation Heartbeat Age</p>
          <p className="mt-1">
            {state?.mutationHeartbeatAt ? `${Math.round((nowTs - state.mutationHeartbeatAt) / 1000)}s` : "n/a"}
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation Attempts</p>
          <p className="mt-1">
            {state?.mutationAttemptCount ?? 0} | Retry bound: {state?.retryBoundReached ? "reached" : "open"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Mutation Transition</p>
          <p className="mt-1">
            {state?.mutationStateChangedAt
              ? `${Math.round((nowTs - state.mutationStateChangedAt) / 1000)}s ago`
              : "n/a"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation Session</p>
          <p className="mt-1 break-all text-xs">{state?.mutationSessionId ?? "n/a"}</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Queue Verification</p>
        <p className="mt-1">
          {state?.queueVerificationPassed ? "passed" : "pending/failed"} -{" "}
          {state?.queueVerificationResult ?? "Verification not executed yet."}
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">ADAPTIVE LEARNING</p>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          <div
            className={`rounded-xl border p-3 ${learningBiasStyles(
              evaluation?.transitionDiagnostics.learningConfidenceBias ?? 0,
            )}`}
          >
            <p className="text-xs uppercase tracking-widest">Learning Confidence Bias</p>
            <p className="mt-1 font-semibold">
              {(evaluation?.transitionDiagnostics.learningConfidenceBias ?? 0) >= 0 ? "+" : ""}
              {(evaluation?.transitionDiagnostics.learningConfidenceBias ?? 0).toFixed(2)}
            </p>
          </div>
          <div
            className={`rounded-xl border p-3 ${learningRiskStyles(evaluation?.transitionDiagnostics.learningRiskBias ?? 0)}`}
          >
            <p className="text-xs uppercase tracking-widest">Learning Risk Bias</p>
            <p className="mt-1 font-semibold">
              {(evaluation?.transitionDiagnostics.learningRiskBias ?? 0) >= 0 ? "+" : ""}
              {(evaluation?.transitionDiagnostics.learningRiskBias ?? 0).toFixed(2)}
            </p>
          </div>
          <div
            className={`rounded-xl border p-3 ${stabilizationPriorityStyles(
              evaluation?.transitionDiagnostics.stabilizationPriority ?? 0,
            )}`}
          >
            <p className="text-xs uppercase tracking-widest">Stabilization Priority</p>
            <p className="mt-1 font-semibold">{(evaluation?.transitionDiagnostics.stabilizationPriority ?? 0).toFixed(2)}</p>
          </div>
          <div
            className={`rounded-xl border p-3 ${escalationClampStyles(
              evaluation?.transitionDiagnostics.escalationClamp ?? 0,
            )}`}
          >
            <p className="text-xs uppercase tracking-widest">Escalation Clamp</p>
            <p className="mt-1 font-semibold">{(evaluation?.transitionDiagnostics.escalationClamp ?? 0).toFixed(2)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-white/75">
          {deriveAdaptiveLearningInterpretation({
            confidenceBias: evaluation?.transitionDiagnostics.learningConfidenceBias ?? 0,
            riskBias: evaluation?.transitionDiagnostics.learningRiskBias ?? 0,
            stabilizationPriority: evaluation?.transitionDiagnostics.stabilizationPriority ?? 0,
            escalationClamp: evaluation?.transitionDiagnostics.escalationClamp ?? 0,
          })}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-white/80">
          {Array.from(
            new Set(
              (evaluation?.transitionDiagnostics.learningReasons ?? []).filter(
                (reason): reason is string => typeof reason === "string" && reason.trim().length > 0,
              ),
            ),
          )
            .slice(0, 8)
            .map((reason, index) => (
              <li key={`${reason}-${index}`}>- {reason}</li>
            ))}
          {(evaluation?.transitionDiagnostics.learningReasons ?? []).filter(
            (reason): reason is string => typeof reason === "string" && reason.trim().length > 0,
          ).length === 0 ? <li className="text-white/60">No adaptive learning diagnostics yet.</li> : null}
        </ul>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">RUNTIME SIMULATION</p>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          <p>Predicted transition success: {simulationReplay?.simulationOutcome.predictedTransitionSuccess.toFixed(2) ?? "0.00"}</p>
          <p>Predicted crowd recovery: {simulationReplay?.simulationOutcome.predictedCrowdRecovery.toFixed(2) ?? "0.00"}</p>
          <p>Predicted execution stability: {simulationReplay?.simulationOutcome.predictedExecutionStability.toFixed(2) ?? "0.00"}</p>
          <p>Predicted recovery pressure: {simulationReplay?.simulationOutcome.predictedRecoveryPressure.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="mt-1 grid gap-3 md:grid-cols-3">
          <p>Predicted energy flow: {simulationReplay?.simulationOutcome.predictedEnergyFlow.toFixed(2) ?? "0.00"}</p>
          <p>Predicted risk shift: {simulationReplay?.simulationOutcome.predictedRiskShift.toFixed(2) ?? "0.00"}</p>
          <p>Recommended action: {(simulationReplay?.recommendedAction ?? "require_operator_review").replace(/_/g, " ")}</p>
        </div>
        <p className="mt-2 text-xs text-white/75">
          {!simulationReplay
            ? "Run supervised evaluation to inspect predicted orchestration outcomes."
            : simulationReplay.recommendedAction === "proceed_supervised"
              ? "Simulation predicts stable supervised execution."
              : simulationReplay.recommendedAction === "stabilize_first"
                ? "Recovery burden elevated; stabilization is recommended first."
                : simulationReplay.recommendedAction === "reduce_energy"
                  ? "Predicted energy pressure may destabilize continuity."
                  : simulationReplay.recommendedAction === "require_operator_review"
                    ? "Simulation recommends operator review before supervised execution."
                    : "Simulation recommends rejecting transition under current risk profile."}
        </p>
        <ul className="mt-2 space-y-1">
          {(simulationReplay?.reasoning ?? []).slice(0, 6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(simulationReplay?.reasoning ?? []).length === 0 ? (
            <li className="text-white/60">No simulation reasoning available yet.</li>
          ) : null}
        </ul>
        <p className="mt-2 text-xs text-white/65">
          Replay summary baseline:{" "}
          {simulationReplay
            ? `${summarizeSimulationReplay([simulationReplay]).averagePredictedSuccess.toFixed(2)} success / ${summarizeSimulationReplay([simulationReplay]).averagePredictedStability.toFixed(2)} stability`
            : "n/a"}
        </p>
        <div className="mt-2 grid gap-2 text-xs text-white/70 md:grid-cols-3">
          <p>Prediction accuracy: {simulationReplay?.driftAnalysis ? (100 - simulationReplay.driftAnalysis.normalizedDriftScore).toFixed(2) : "0.00"}</p>
          <p>Calibration status: {simulationReplay?.driftAnalysis?.confidenceCalibration.calibrationStatus ?? "n/a"}</p>
          <p>Drift severity: {simulationReplay?.driftAnalysis?.driftSeverity ?? "n/a"}</p>
        </div>
        <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
          <p>Confidence reliability: {simulationReplay?.driftAnalysis?.confidenceCalibration.confidenceReliability.toFixed(2) ?? "0.00"}</p>
          <p>Stabilization mismatch: {simulationReplay?.driftAnalysis?.executionStabilityDrift.toFixed(2) ?? "0.00"}</p>
          <p>Recovery mismatch: {simulationReplay?.driftAnalysis?.recoveryPressureDrift.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
          <p className="text-xs uppercase tracking-widest text-white/60">CONFIDENCE CALIBRATION</p>
          <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
            <p>Raw confidence: {simulationReplay?.calibrationSnapshot?.rawOrchestrationConfidence.toFixed(2) ?? "0.00"}</p>
            <p>Calibrated confidence: {simulationReplay?.calibrationSnapshot?.calibratedConfidence.toFixed(2) ?? "0.00"}</p>
            <p>Adjustment delta: {simulationReplay?.calibrationSnapshot?.confidenceAdjustmentDelta.toFixed(2) ?? "0.00"}</p>
          </div>
          <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
            <p>Calibration reliability: {simulationReplay?.calibrationSnapshot?.calibration.calibrationReliabilityScore.toFixed(2) ?? "0.00"}</p>
            <p>Calibration pressure: {simulationReplay?.calibrationSnapshot?.calibration.calibrationPressure.toFixed(2) ?? "0.00"}</p>
            <p>Trend: {simulationReplay?.calibrationSnapshot?.calibration.reliabilityTrendDirection ?? "n/a"}</p>
          </div>
          <p className="mt-1 text-xs text-white/65">
            Severity: {simulationReplay?.calibrationSnapshot?.calibration.calibrationSeverity ?? "n/a"} | Trustworthiness:{" "}
            {simulationReplay?.calibrationSnapshot?.confidenceReliability.toFixed(2) ?? "0.00"}
          </p>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
          <p className="text-xs uppercase tracking-widest text-white/60">SUPERVISED RECOVERY</p>
          <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
            <p>Strategy: {(simulationReplay?.recoverySnapshot?.recommendation.plan.primaryStrategy ?? "n/a").replace(/_/g, " ")}</p>
            <p>Feasibility: {simulationReplay?.recoverySnapshot?.recommendation.confidence.recoveryFeasibility.toFixed(2) ?? "0.00"}</p>
            <p>Recovery confidence: {simulationReplay?.recoverySnapshot?.recommendation.confidence.recoveryConfidence.toFixed(2) ?? "0.00"}</p>
          </div>
          <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
            <p>Escalation pressure: {simulationReplay?.recoverySnapshot?.recommendation.escalation.rollbackEscalationPressure.toFixed(2) ?? "0.00"}</p>
            <p>Continuity preservation: {simulationReplay?.recoverySnapshot?.recommendation.continuity.continuityPreservationQuality.toFixed(2) ?? "0.00"}</p>
            <p>Risk: {simulationReplay?.recoverySnapshot?.recommendation.risk.riskClassification ?? "n/a"}</p>
          </div>
          <p className="mt-1 text-xs text-white/65">
            Stabilization viable: {simulationReplay?.recoverySnapshot?.recommendation.plan.stabilization.stabilizationViable ? "yes" : "no"} | Rollback remains final authority
          </p>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
          <p className="text-xs uppercase tracking-widest text-white/60">NARRATIVE ARC</p>
          <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
            <p>Stability: {simulationReplay?.narrativeSnapshot?.recommendation.narrativeStability.toFixed(2) ?? "0.00"}</p>
            <p>Wave state: {simulationReplay?.narrativeSnapshot?.recommendation.arc.flowState ?? "n/a"}</p>
            <p>Arc safety: {simulationReplay?.narrativeSnapshot?.recommendation.continuity.transitionArcSafety.toFixed(2) ?? "0.00"}</p>
          </div>
          <div className="mt-1 grid gap-2 text-xs text-white/70 md:grid-cols-3">
            <p>Fatigue pressure: {simulationReplay?.narrativeSnapshot?.recommendation.fatigue.fatiguePressure.toFixed(2) ?? "0.00"}</p>
            <p>Pacing continuity: {simulationReplay?.narrativeSnapshot?.recommendation.energyWave.pacingContinuity.toFixed(2) ?? "0.00"}</p>
            <p>Momentum stability: {simulationReplay?.narrativeSnapshot?.recommendation.momentum.momentumStability.toFixed(2) ?? "0.00"}</p>
          </div>
          <p className="mt-1 text-xs text-white/65">
            Cooldown pressure: {simulationReplay?.narrativeSnapshot?.recommendation.cooldownPressure.toFixed(2) ?? "0.00"} | Risk:{" "}
            {simulationReplay?.narrativeSnapshot?.recommendation.risk.riskClassification ?? "n/a"}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">QUEUE VERIFICATION</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <p>Score: {state?.mutationVerification?.verificationScore?.toFixed(2) ?? "0.00"}</p>
          <p>Confidence: {state?.verificationConfidence?.toFixed(2) ?? state?.mutationVerificationConfidence?.toFixed(2) ?? "0.00"}</p>
          <p>State: {state?.mutationVerification?.passed || state?.queueVerificationPassed ? "passed" : "failed/pending"}</p>
        </div>
        <div className="mt-1 grid gap-3 md:grid-cols-2">
          <p>Instability detected: {state?.instabilityDetected ? "yes" : "no"}</p>
          <p>Retriable failure: {state?.retriableVerificationFailure ? "yes" : "no"}</p>
        </div>
        <ul className="mt-2 space-y-1">
          {(state?.verificationReasons ?? state?.mutationVerification?.reasons ?? []).slice(0, 6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.verificationReasons ?? state?.mutationVerification?.reasons ?? []).length === 0 ? (
            <li className="text-white/60">No normalized verification reasons yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Latest Verification Reasoning</p>
        <ul className="mt-2 space-y-1">
          {(state?.latestVerificationResult?.verificationReasoning ?? []).slice(0, 6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.latestVerificationResult?.verificationReasoning ?? []).length === 0 ? (
            <li className="text-white/60">No verification reasoning available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Auth Recovery Reasoning</p>
        <ul className="mt-2 space-y-1">
          {(state?.authRecoveryReasoning ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.authRecoveryReasoning ?? []).length === 0 ? (
            <li className="text-white/60">No auth recovery reasoning available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Phase Duration</p>
          <p className="mt-1">
            {state?.verificationPhaseDurationMs ? `${Math.round(state.verificationPhaseDurationMs / 1000)}s` : "n/a"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Grace Active</p>
          <p className="mt-1">{state?.verificationGraceActive ? "yes" : "no"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Rollback Preservation</p>
          <p className="mt-1">{state?.rollbackPreservationState ?? "inactive"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Queue Verification State</p>
          <p className="mt-1">{state?.queueVerificationPassed ? "verified" : "not_verified"}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Continuity</p>
          <p className="mt-1">{state?.verificationContinuity?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Freshness Confidence</p>
          <p className="mt-1">{state?.verificationFreshnessConfidence?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Transport Latency</p>
          <p className="mt-1">{state?.verificationTransportLatency?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Heartbeat Continuity</p>
          <p className="mt-1">{state?.verificationHeartbeatContinuity?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation Consistency</p>
          <p className="mt-1">{state?.verificationMutationConsistency?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Window Integrity</p>
          <p className="mt-1">{state?.verificationWindowIntegrity?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Snapshot Reliability</p>
          <p className="mt-1">{state?.verificationSnapshotReliability?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery Confidence</p>
          <p className="mt-1">{state?.verificationRecoveryConfidence?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Stabilization Confidence</p>
          <p className="mt-1 font-semibold">{state?.verificationStabilizationConfidence?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Failure Pressure</p>
          <p className="mt-1 font-semibold">{state?.verificationFailurePressure?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Verification Stabilization Summary</p>
        <ul className="mt-2 space-y-1">
          {(state?.verificationStabilizationSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.verificationStabilizationSummary ?? []).length === 0 ? (
            <li className="text-white/60">No verification stabilization summary available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Target Track</p>
          <p className="mt-1">{state?.targetTrackName ?? "none"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Preparation Confidence</p>
          <p className="mt-1">{state?.preparationConfidence?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Execution Confidence</p>
          <p className="mt-1">{state?.executionConfidence?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => callAction("/api/playback-execution/prepare")}
          disabled={isLoading}
          className="rounded-full border border-sky-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-sky-100 hover:bg-sky-500/10 disabled:opacity-60"
        >
          PREPARE EXECUTION
        </button>
        <button
          onClick={() => callAction("/api/playback-execution/approve")}
          disabled={isLoading}
          className="rounded-full border border-emerald-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-60"
        >
          APPROVE EXECUTION
        </button>
        <button
          onClick={() => callAction("/api/playback-execution/abort", { reason: "Operator aborted execution." })}
          disabled={isLoading}
          className="rounded-full border border-amber-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-100 hover:bg-amber-500/10 disabled:opacity-60"
        >
          ABORT EXECUTION
        </button>
        <button
          onClick={() => callAction("/api/playback-execution/rollback")}
          disabled={isLoading}
          className="rounded-full border border-rose-300/35 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-rose-100 hover:bg-rose-500/10 disabled:opacity-60"
        >
          ROLLBACK EXECUTION
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Execution Reasoning</p>
        <ul className="mt-2 space-y-1">
          {(state?.executionReasoning ?? []).slice(0, 8).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.executionReasoning ?? []).length === 0 ? (
            <li className="text-white/60">No execution reasoning available.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Rollback Integrity Reasoning</p>
        <ul className="mt-2 space-y-1">
          {(state?.rollbackIntegrityReasoning ?? []).slice(0, 6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.rollbackIntegrityReasoning ?? []).length === 0 ? (
            <li className="text-white/60">No rollback integrity reasoning yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Rollback Integrity Contributors</p>
        <ul className="mt-2 space-y-1">
          {(state?.rollbackIntegrityContributors ?? []).slice(0, 8).map((item) => (
            <li key={item}>- {item}</li>
          ))}
          {(state?.rollbackIntegrityContributors ?? []).length === 0 ? (
            <li className="text-white/60">No rollback integrity contributors yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">ROLLBACK STABILITY</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <p>Rollback confidence: {state?.rollbackConfidence?.toFixed(2) ?? "0.00"}</p>
          <p>Integrity score: {state?.rollbackIntegrityScore?.toFixed(2) ?? "0.00"}</p>
          <p>Restoration feasibility: {state?.restorationFeasibility?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="mt-1 grid gap-3 md:grid-cols-2">
          <p>Rollback allowed: {state?.rollbackAllowed ? "yes" : "no"}</p>
          <p>Lifecycle rollback state: {state?.mutationLifecycle?.state ?? "n/a"}</p>
        </div>
        <ul className="mt-2 space-y-1">
          {(state?.rollbackBlockers ?? state?.rollbackStability?.rollbackBlockers ?? []).slice(0, 6).map((blocker) => (
            <li key={blocker}>- {blocker}</li>
          ))}
          {(state?.rollbackBlockers ?? state?.rollbackStability?.rollbackBlockers ?? []).length === 0 ? (
            <li className="text-white/60">No rollback blockers.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">EXECUTION HEARTBEAT</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <p>
            Heartbeat status: <span className={heartbeatStyles(state?.heartbeatStatus)}>{state?.heartbeatStatus ?? "degraded"}</span>
          </p>
          <p>Health score: {state?.mutationHealthScore?.toFixed(2) ?? "0.00"}</p>
          <p>Drift score: {state?.mutationDriftScore?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="mt-1 grid gap-3 md:grid-cols-2">
          <p>Transport freshness: {state?.transportFreshnessScore?.toFixed(2) ?? "0.00"}</p>
          <p>Propagation delay: {state?.mutationHeartbeat?.propagationDelayMs ?? 0}ms</p>
        </div>
        <ul className="mt-2 space-y-1">
          {(state?.mutationHeartbeat?.reasoning ?? []).slice(0, 5).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.mutationHeartbeat?.reasoning ?? []).length === 0 ? (
            <li className="text-white/60">No heartbeat reasoning available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">FRESHNESS GRACE</p>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <p>Grace state: {state?.graceState ?? "inactive"}</p>
          <p>Grace failure: {state?.graceFailure ? "yes" : "no"}</p>
          <p>Confidence penalty: {state?.graceConfidencePenalty?.toFixed(2) ?? "0.00"}</p>
        </div>
        <div className="mt-1 grid gap-3 md:grid-cols-2">
          <p>Grace window: {state?.freshnessGrace?.graceWindowMs ?? 0}ms</p>
          <p>Grace remaining: {state?.freshnessGrace?.graceRemainingMs ?? 0}ms</p>
        </div>
        <ul className="mt-2 space-y-1">
          {(state?.graceReasons ?? state?.freshnessGrace?.reasons ?? []).slice(0, 5).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.graceReasons ?? state?.freshnessGrace?.reasons ?? []).length === 0 ? (
            <li className="text-white/60">No freshness grace diagnostics yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">MUTATION AUDIT STATUS</p>
        <p className="mt-2">Audit entries: {state?.mutationAuditTrail?.length ?? 0}</p>
        <p>
          Latest lifecycle transition: {state?.mutationAuditTrail?.[state.mutationAuditTrail.length - 1]?.lifecycleState ?? "n/a"}
        </p>
        <p>
          Latest verification summary:{" "}
          {state?.mutationAuditTrail?.[state.mutationAuditTrail.length - 1]?.verificationOutcome
            ? `${state.mutationAuditTrail[state.mutationAuditTrail.length - 1]?.verificationOutcome.verificationState} (${state.mutationAuditTrail[state.mutationAuditTrail.length - 1]?.verificationOutcome.verificationScore.toFixed(2)})`
            : "n/a"}
        </p>
        <p>
          Latest heartbeat state:{" "}
          {state?.mutationAuditTrail?.[state.mutationAuditTrail.length - 1]?.heartbeatDiagnostics?.heartbeatStatus ?? "n/a"}
        </p>
        <ul className="mt-2 space-y-1">
          {(state?.mutationAuditTrail?.[state.mutationAuditTrail.length - 1]?.degradationReasons ?? [])
            .slice(0, 4)
            .map((reason, index) => (
              <li key={`${reason}-${index}`}>- {reason}</li>
            ))}
          {(state?.mutationAuditTrail?.[state.mutationAuditTrail.length - 1]?.degradationReasons ?? []).length === 0 ? (
            <li className="text-white/60">No recent degradation reasons.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Mutation Reasoning Timeline</p>
        <ul className="mt-2 space-y-1">
          {(state?.mutationTimeline ?? []).slice(-10).reverse().map((entry, index) => (
            <li key={`${entry.timestamp}-${entry.state}-${index}`}>
              - {entry.state} ({Math.round((nowTs - entry.timestamp) / 1000)}s ago): {entry.reasoning}
            </li>
          ))}
          {(state?.mutationTimeline ?? []).length === 0 ? (
            <li className="text-white/60">No mutation timeline entries yet.</li>
          ) : null}
        </ul>
      </div>
    </article>
  );
}
