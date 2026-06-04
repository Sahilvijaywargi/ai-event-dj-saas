import "server-only";

import { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { getPlaybackOrchestrationState, queueAiRecommendedTrack } from "@/lib/spotify/device-orchestrator";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { getSpotifyQueueState } from "@/lib/spotify/playback-service";
import { refreshRecommendationFreshnessTimestamps } from "@/lib/spotify/recommendation-serving";
import {
  ensureSpotifyTransportAuth,
  forceRefreshSpotifyAccessToken,
  getSpotifyTransportAuthContinuityState,
} from "@/lib/spotify/service";
import {
  evaluateTelemetryFreshness,
  refreshDeviceHeartbeat,
  refreshPlaybackHeartbeat,
  refreshQueueHeartbeat,
} from "@/lib/runtime/telemetry-heartbeat";
import {
  appendMutationAuditEntry,
  createMutationLifecycle,
  evaluateBoundedFreshnessGrace,
  evaluateMutationHeartbeat,
  canTransitionMutationLifecycle,
  computePreparationRollbackReadiness,
  evaluatePreparationMutationVerification,
  PREPARATION_INTEGRITY_THRESHOLD,
  PREPARATION_ROLLBACK_READINESS_THRESHOLD,
  PREPARATION_VERIFICATION_CONFIDENCE_THRESHOLD,
  evaluateQueueVerification,
  evaluateRollbackStability,
  transitionMutationLifecycle,
} from "@/lib/spotify/transport-mutation-stabilization";
import { coordinateTelemetryFreshness } from "@/lib/spotify/telemetry-freshness-coordinator";
import {
  inheritFreshnessAcrossMutationLifecycle,
  freshnessInheritanceAllowsQueuePrep,
} from "@/lib/spotify/freshness-inheritance-chain";
import {
  applyExecutionValidationToPlaybackState,
  validateExecutionOutcome,
} from "@/lib/ai/execution-validation-engine";
import type { OrchestrationConvergenceMetrics } from "@/lib/ai/orchestration-refinement-types";
import type { AdaptiveOrchestrationCandidate } from "@/lib/ai/adaptive-orchestration";
import {
  FreshnessGraceEvaluation,
  MutationAuditEntry,
  MutationHeartbeat,
  MutationLifecycleSnapshot,
  MutationVerificationResult,
  MutationLifecycleTransitionRequest,
  RollbackStability,
  RollbackVerificationStage,
  TransportMutationState,
  TransportSyncState,
} from "@/lib/spotify/mutation-types";

export type PlaybackExecutionState = {
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
  mutationSessionId?: string;
  mutationStartedAt?: number;
  mutationHeartbeatAt?: number;
  mutationState?:
    | "idle"
    | "preparing"
    | "validating"
    | "executing"
    | "mutating"
    | "verifying"
    | "degraded"
    | "rollback_ready"
    | "rollback_executing"
    | "rollback_complete"
    | "rollback_pending"
    | "stabilized"
    | "failed";
  mutationContinuity?: number;
  mutationVerificationConfidence?: number;
  queueMutationFreshness?: number;
  rollbackIntegrity?: number;
  rollbackReadiness?: number;
  transportMutationSafety?: number;
  queueVerificationPassed?: boolean;
  queueVerificationResult?: string;
  mutationAttemptCount?: number;
  retryBoundReached?: boolean;
  mutationStateChangedAt?: number;
  rollbackIntegrityReasoning?: string[];
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
  verificationContinuityHistory?: Array<{
    timestamp: number;
    continuity: number;
    heartbeatContinuity: number;
    mutationConsistency: number;
  }>;
  verificationLatencyHistory?: Array<{
    timestamp: number;
    latency: number;
    transportLatency: number;
    timingGap: number;
  }>;
  verificationFreshnessHistory?: Array<{
    timestamp: number;
    freshnessConfidence: number;
    playbackFreshness: number;
    queueFreshness: number;
    graceApplied: boolean;
  }>;
  verificationIntegrityHistory?: Array<{
    timestamp: number;
    windowIntegrity: number;
    snapshotReliability: number;
    recoveryConfidence: number;
    failurePressure: number;
  }>;
  verificationStabilizationSummary?: string[];
  mutationLifecycle?: MutationLifecycleSnapshot;
  mutationVerification?: MutationVerificationResult;
  verificationConfidence?: number;
  verificationReasons?: string[];
  instabilityDetected?: boolean;
  retriableVerificationFailure?: boolean;
  rollbackStability?: RollbackStability;
  rollbackConfidence?: number;
  rollbackIntegrityScore?: number;
  rollbackBlockers?: readonly string[];
  restorationFeasibility?: number;
  rollbackAllowed?: boolean;
  mutationHeartbeat?: MutationHeartbeat;
  mutationHealthScore?: number;
  mutationDriftScore?: number;
  transportFreshnessScore?: number;
  heartbeatStatus?: "healthy" | "watch" | "degraded" | "critical";
  freshnessGrace?: FreshnessGraceEvaluation;
  graceState?: "inactive" | "active" | "expired";
  graceFailure?: boolean;
  graceConfidencePenalty?: number;
  graceReasons?: readonly string[];
  mutationAuditTrail?: readonly MutationAuditEntry[];
  executionDegradationReasons?: string[];
  executionStabilityScore?: number;
  transportIntegrityScore?: number;
  mutationRecoverabilityScore?: number;
  rollbackVerificationStage?: RollbackVerificationStage;
  rollbackReconciliationState?: "pending" | "reconciled" | "degraded" | "failed";
  continuityTrustScore?: number;
  rollbackVerificationBlockers?: readonly string[];
  telemetryVersion?: number;
  telemetryUpdatedAt?: number;
  verificationSequence?: number;
  transportMutationHeartbeatAt?: string;
  queuePreparationHeartbeatAt?: string;
  freshnessPropagationAt?: string;
  lastSynchronizationRecoveryAt?: string;
  freshnessRecoveryState?: "stable" | "recovering" | "degraded";
  graceStabilizationActive?: boolean;
  rollbackFreshnessInheritedAt?: string;
  freshnessInheritanceChain?: import("@/lib/spotify/freshness-inheritance-chain").FreshnessInheritanceChain;
  globalConvergenceState?: "stable" | "degraded" | "divergent";
  executionValidationResult?: import("@/lib/ai/execution-validation-types").ExecutionValidationResult;
  executionTrustScore?: number;
  executionDriftSeverity?: "low" | "moderate" | "severe";
  runtimeTrustCalibration?: import("@/lib/ai/runtime-trust-calibration").RuntimeTrustCalibration;
  autonomyReadiness?: import("@/lib/ai/autonomy-readiness-engine").AutonomyReadinessResult;
  strategyReliability?: {
    byStrategy: Partial<
      Record<
        import("@/lib/ai/adaptive-orchestration").AdaptiveOrchestrationStrategy,
        import("@/lib/ai/strategy-reliability-history").StrategyReliabilityProfile
      >
    >;
    globalReliability: number;
  };
  rollbackSurvivability?: import("@/lib/spotify/rollback-survivability-engine").RollbackSurvivabilityResult;
  transportRecovery?: import("@/lib/spotify/transport-recovery-engine").TransportRecoveryAnalysis;
  mutationReliability?: number;
  latestCheckpointId?: string;
  mutationJournalSize?: number;
  runtimeLearningSignals?: string[];
  runtimeObservabilitySummary?: string[];
  degradationSeverity?: "none" | "low" | "moderate" | "high" | "critical";
  executionHealthClassification?:
    | "stable"
    | "stabilizing"
    | "degraded"
    | "rollback_sensitive"
    | "verification_risk"
    | "transport_unstable"
    | "critical";
  observabilitySurface?: {
    lifecycleState: TransportMutationState;
    verificationScore: number;
    rollbackConfidence: number;
    heartbeatHealth: number;
    graceState: "inactive" | "active" | "expired";
    degradationSeverity: "none" | "low" | "moderate" | "high" | "critical";
    executionHealthClassification:
      | "stable"
      | "stabilizing"
      | "degraded"
      | "rollback_sensitive"
      | "verification_risk"
      | "transport_unstable"
      | "critical";
    latestAuditCount: number;
  };
};

type QueueRollbackSnapshot = {
  currentTrackUri: string | null;
  queueHeadUri: string | null;
  playbackPositionMs: number | null;
  snapshotHash?: string;
  snapshotCreatedAt?: number;
  ownerUserId?: string;
};

type ExecutionSession = {
  state: PlaybackExecutionState;
  rollbackSnapshot: QueueRollbackSnapshot | null;
  preparedAt: number;
  approved: boolean;
  mutationFailures: number;
  mutationAttemptCount: number;
  lifecycle: MutationLifecycleSnapshot;
  mutationAuditTrail: readonly MutationAuditEntry[];
  graceStartedAt: number | null;
};

const executionStore = new Map<string, ExecutionSession>();

function publishExecutionTelemetry(
  session: ExecutionSession,
  reason: string,
  patch?: Partial<PlaybackExecutionState>,
) {
  const now = Date.now();
  const nextVersion = (session.state.telemetryVersion ?? 0) + 1;
  const nextSequence = (session.state.verificationSequence ?? 0) + 1;
  session.state = {
    ...session.state,
    ...patch,
    telemetryVersion: nextVersion,
    telemetryUpdatedAt: now,
    verificationSequence: nextSequence,
    mutationHeartbeatAt: now,
    transportMutationHeartbeatAt: new Date(now).toISOString(),
  };
  console.log("[TELEMETRY] stabilization finalized", {
    reason,
    telemetryVersion: nextVersion,
    verificationSequence: nextSequence,
    telemetryUpdatedAt: now,
    rollbackIntegrity: session.state.rollbackIntegrity,
    verificationConfidence: session.state.verificationConfidence,
    verificationFinalized: session.state.verificationFinalized,
    rollbackVerificationStage: session.state.rollbackVerificationStage,
    lifecycleState: session.lifecycle.state,
  });
}

function randomExecutionId() {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function deriveExecutionHealthClassification(params: {
  stability: number;
  rollbackAllowed: boolean;
  verificationScore: number;
  transportIntegrity: number;
  degradationSeverity: PlaybackExecutionState["degradationSeverity"];
}) {
  if (
    params.degradationSeverity === "critical" ||
    params.stability < 35 ||
    params.verificationScore < 35 ||
    params.transportIntegrity < 35
  ) {
    return "critical" as const;
  }
  if (!params.rollbackAllowed && (params.degradationSeverity === "high" || params.transportIntegrity < 52)) {
    return "rollback_sensitive" as const;
  }
  if (params.verificationScore < 55) return "verification_risk" as const;
  if (params.transportIntegrity < 55) return "transport_unstable" as const;
  if (params.degradationSeverity === "high" || params.degradationSeverity === "moderate") return "degraded" as const;
  if (params.stability < 74) return "stabilizing" as const;
  return "stable" as const;
}

function deriveDegradationSeverity(params: {
  degradationCount: number;
  rollbackAllowed: boolean;
  graceFailure: boolean;
  heartbeatStatus: PlaybackExecutionState["heartbeatStatus"];
  verificationScore: number;
}) {
  const pressure =
    params.degradationCount * 11 +
    (params.rollbackAllowed ? 0 : 22) +
    (params.graceFailure ? 16 : 0) +
    (params.heartbeatStatus === "critical"
      ? 18
      : params.heartbeatStatus === "degraded"
        ? 10
        : params.heartbeatStatus === "watch"
          ? 4
          : 0) +
    (params.verificationScore < 42 ? 22 : params.verificationScore < 58 ? 10 : 0);
  if (pressure >= 70) return "critical" as const;
  if (pressure >= 48) return "high" as const;
  if (pressure >= 28) return "moderate" as const;
  if (pressure >= 10) return "low" as const;
  return "none" as const;
}

function buildPlaybackExecutionObservability(state: PlaybackExecutionState): PlaybackExecutionState {
  const verificationScore = round(
    state.mutationVerification?.verificationScore ??
      state.verificationConfidence ??
      state.mutationVerificationConfidence ??
      0,
  );
  const rollbackConfidence = round(state.rollbackConfidence ?? state.rollbackIntegrity ?? 0);
  const heartbeatHealth = round(state.mutationHealthScore ?? state.mutationHeartbeat?.mutationHealthScore ?? 0);
  const executionStabilityScore = round(
    clamp(
      (state.mutationContinuity ?? 0) * 0.28 +
        verificationScore * 0.26 +
        rollbackConfidence * 0.18 +
        heartbeatHealth * 0.18 +
        (state.transportMutationSafety ?? 0) * 0.1 -
        (state.graceFailure ? 8 : 0),
      0,
      100,
    ),
  );
  const transportIntegrityScore = round(
    clamp(
      (state.transportMutationSafety ?? 0) * 0.46 +
        (state.transportFreshnessScore ?? 0) * 0.2 +
        (state.verificationTransportLatency ?? 0) * 0.14 +
        (state.verificationHeartbeatContinuity ?? 0) * 0.1 +
        (state.mutationHeartbeat?.playbackDesyncScore ?? 0) * 0.1,
      0,
      100,
    ),
  );
  const mutationRecoverabilityScore = round(
    clamp(
      rollbackConfidence * 0.5 +
        (state.restorationFeasibility ?? 0) * 0.25 +
        (state.rollbackAllowed ? 18 : 0) +
        (100 - (state.verificationFailurePressure ?? 0)) * 0.1 +
        (state.verificationRecoveryConfidence ?? 0) * 0.15,
      0,
      100,
    ),
  );
  const degradationSeverity = deriveDegradationSeverity({
    degradationCount: (state.executionDegradationReasons ?? []).length,
    rollbackAllowed: state.rollbackAllowed ?? true,
    graceFailure: state.graceFailure ?? false,
    heartbeatStatus: state.heartbeatStatus,
    verificationScore,
  });
  const executionHealthClassification = deriveExecutionHealthClassification({
    stability: executionStabilityScore,
    rollbackAllowed: state.rollbackAllowed ?? true,
    verificationScore,
    transportIntegrity: transportIntegrityScore,
    degradationSeverity,
  });
  const runtimeObservabilitySummary: string[] = [];
  runtimeObservabilitySummary.push(`Lifecycle ${state.mutationLifecycle?.state ?? "pending"} observed.`);
  runtimeObservabilitySummary.push(`Verification score ${verificationScore.toFixed(2)}; rollback confidence ${rollbackConfidence.toFixed(2)}.`);
  runtimeObservabilitySummary.push(`Heartbeat ${state.heartbeatStatus ?? "degraded"} (${heartbeatHealth.toFixed(2)}).`);
  runtimeObservabilitySummary.push(
    `Grace ${state.graceState ?? "inactive"}${state.graceFailure ? " with deterministic expiry failure." : "."}`,
  );
  runtimeObservabilitySummary.push(
    `Execution health ${executionHealthClassification} with degradation severity ${degradationSeverity}.`,
  );
  return {
    ...state,
    executionStabilityScore,
    transportIntegrityScore,
    mutationRecoverabilityScore,
    runtimeObservabilitySummary,
    degradationSeverity,
    executionHealthClassification,
    observabilitySurface: {
      lifecycleState: state.mutationLifecycle?.state ?? "pending",
      verificationScore,
      rollbackConfidence,
      heartbeatHealth,
      graceState: state.graceState ?? "inactive",
      degradationSeverity,
      executionHealthClassification,
      latestAuditCount: state.mutationAuditTrail?.length ?? 0,
    },
  };
}

function computeRollbackSnapshotHash(snapshot: QueueRollbackSnapshot | null) {
  if (!snapshot) return "missing_snapshot";
  return [
    snapshot.currentTrackUri ?? "none",
    snapshot.queueHeadUri ?? "none",
    snapshot.playbackPositionMs ?? "none",
  ].join("|");
}

function evaluateNormalizedRollbackStability(params: {
  userId: string;
  session: ExecutionSession;
  verificationPassed: boolean;
  playbackStable: boolean;
  syncHealthy: boolean;
  transportConsistencyScore: number;
}) {
  const now = Date.now();
  const snapshotHash = computeRollbackSnapshotHash(params.session.rollbackSnapshot);
  const snapshotCreatedAt = params.session.rollbackSnapshot?.snapshotCreatedAt ?? params.session.preparedAt;
  const snapshotAgeMs = Math.max(0, now - snapshotCreatedAt);
  const ownershipContinuity = (params.session.rollbackSnapshot?.ownerUserId ?? params.userId) === params.userId;
  const playbackRecoverability = round(
    clamp((params.playbackStable ? 70 : 34) + (params.verificationPassed ? 24 : 8), 0, 100),
  );
  const normalized = evaluateRollbackStability({
    now,
    mutationId: params.session.lifecycle.mutationId,
    orchestrationId: params.session.lifecycle.orchestrationId,
    snapshotHashBefore: params.session.rollbackSnapshot?.snapshotHash ?? snapshotHash,
    snapshotHashCurrent: snapshotHash,
    snapshotAgeMs,
    snapshotMaxAgeMs: 120_000,
    ownershipContinuity,
    playbackRecoverability,
    transportConsistency: clamp(params.transportConsistencyScore, 0, 100),
  });
  const boundedLegacyIntegrity = computeRollbackIntegrity({
    rollbackSnapshot: params.session.rollbackSnapshot,
    verificationPassed: params.verificationPassed,
    playbackStable: params.playbackStable,
    syncHealthy: params.syncHealthy,
  });
  const mergedRollbackIntegrity = round(
    clamp(boundedLegacyIntegrity * 0.44 + normalized.rollbackIntegrityScore * 0.56, 0, 100),
  );
  return {
    normalized,
    mergedRollbackIntegrity,
    rollbackAllowed: normalized.rollbackAllowed && mergedRollbackIntegrity >= 50,
    rollbackBlockers: normalized.rollbackBlockers,
    restorationFeasibility: normalized.restorationFeasibility,
    rollbackConfidence: normalized.rollbackConfidence,
    rollbackReasoning: normalized.rollbackReasoning,
    snapshotHash,
  };
}

function normalizeTransportSyncState(syncStatus?: string): TransportSyncState {
  return syncStatus === "synced" ? "synced" : syncStatus === "degraded" ? "degraded" : syncStatus === "desynced" ? "desynced" : "unknown";
}

function mapLifecycleToLegacyMutationState(state: TransportMutationState): NonNullable<PlaybackExecutionState["mutationState"]> {
  if (state === "pending") return "idle";
  if (state === "executing") return "executing";
  if (state === "rollback_ready" || state === "rollback_executing") return "rollback_pending";
  if (state === "rollback_complete") return "rollback_complete";
  return state;
}

function normalizeRequestedMutationState(
  state:
    | TransportMutationState
    | "mutating"
    | "rollback_pending"
    | NonNullable<PlaybackExecutionState["mutationState"]>,
): TransportMutationState {
  if (state === "mutating") return "executing";
  if (state === "rollback_pending") return "rollback_ready";
  if (state === "idle") return "pending";
  return state;
}

function touchMutationHeartbeat(userId: string) {
  const at = Date.now();
  refreshPlaybackHeartbeat(userId);
  refreshDeviceHeartbeat(userId);
  refreshQueueHeartbeat(userId);
  return at;
}

export function updateMutationHeartbeat(params: {
  userId: string;
  session?: ExecutionSession;
  phase?: string;
}) {
  const allowedPhases = new Set(["preparing", "validating", "mutating", "verifying"]);
  if (params.phase && !allowedPhases.has(params.phase)) {
    return params.session?.state.mutationHeartbeatAt ?? Date.now();
  }
  const at = touchMutationHeartbeat(params.userId);
  if (params.session) {
    params.session.state = {
      ...params.session.state,
      mutationHeartbeatAt: at,
      mutationTimeline: [
        ...(params.session.state.mutationTimeline ?? []),
        {
          timestamp: at,
          state: "heartbeat_update",
          reasoning: "Mutation heartbeat refreshed.",
        },
      ],
    };
  }
  return at;
}

function transitionMutationState(params: {
  userId: string;
  session: ExecutionSession;
  state:
    | TransportMutationState
    | "mutating"
    | "rollback_pending"
    | NonNullable<PlaybackExecutionState["mutationState"]>;
  reasoning: string;
  executionPhase?: string;
  transportSyncState?: TransportSyncState;
  rollbackReadiness?: number;
  queueSnapshotHash?: string;
  freshnessAgeMs?: number;
  heartbeatHealth?: number;
  verificationPassed?: boolean;
  verificationScore?: number;
  runtimeWarnings?: string[];
  transitionDiagnostics?: string[];
  confidenceValue?: number;
  confidenceDelta?: number;
  degradationReasons?: string[];
}) {
  const timestamp = Date.now();
  const normalizedState = normalizeRequestedMutationState(params.state);
  const heartbeatPhase =
    normalizedState === "executing"
      ? "mutating"
      : normalizedState === "rollback_executing"
        ? "verifying"
        : normalizedState;
  const heartbeatAt = updateMutationHeartbeat({
    userId: params.userId,
    session: params.session,
    phase: heartbeatPhase,
  });
  const nextLifecycle = transitionMutationLifecycle(
    params.session.lifecycle,
    {
      nextState: normalizedState,
      reason: params.reasoning,
      transportSyncState: params.transportSyncState,
      rollbackReadiness: params.rollbackReadiness,
      queueSnapshotHash: params.queueSnapshotHash,
      freshnessAgeMs: params.freshnessAgeMs,
      heartbeatHealth: params.heartbeatHealth,
    },
    timestamp,
  );
  const heartbeatSnapshot = computeMutationHeartbeatSnapshot({
    userId: params.userId,
    session: params.session,
    transportSyncStatus:
      params.transportSyncState === "synced"
        ? "synced"
        : params.transportSyncState === "degraded"
          ? "degraded"
          : params.transportSyncState === "desynced"
            ? "desynced"
            : "unknown",
    playbackContinuityStability: params.heartbeatHealth,
  });
  const graceAllowed =
    normalizedState === "verifying" ||
    normalizedState === "executing" ||
    normalizedState === "rollback_ready" ||
    normalizedState === "rollback_executing";
  if (graceAllowed && params.session.graceStartedAt === null) {
    params.session.graceStartedAt = Date.now();
  }
  if (!graceAllowed) {
    params.session.graceStartedAt = null;
  }
  const graceSnapshot = computeFreshnessGraceSnapshot({
    userId: params.userId,
    session: params.session,
    baseConfidence: params.session.state.executionConfidence ?? 0,
    graceAllowed,
    propagationDelayMs: heartbeatSnapshot.propagationDelayMs,
  });
  const effectiveConfidence = round(
    clamp(
      (params.confidenceValue ?? params.session.state.executionConfidence ?? 0) -
        (graceSnapshot.grace.confidencePenalty + (graceSnapshot.grace.graceFailure ? 8 : 0)),
      0,
      100,
    ),
  );
  const effectiveDegradationReasons = [
    ...(params.degradationReasons ?? []),
    ...(graceSnapshot.grace.state === "active" ? ["freshness_grace_active"] : []),
    ...(graceSnapshot.grace.graceFailure ? ["freshness_grace_expired"] : []),
  ];
  params.session.lifecycle = nextLifecycle;
  params.session.mutationAuditTrail = appendMutationAuditEntry(params.session.mutationAuditTrail, {
    mutationId: nextLifecycle.mutationId,
    orchestrationId: nextLifecycle.orchestrationId,
    lifecycleState: nextLifecycle.state,
    executionPhase: params.executionPhase ?? nextLifecycle.state,
    confidenceValue: effectiveConfidence,
    confidenceDelta: Number((params.confidenceDelta ?? 0).toFixed(2)),
    degradationReasons: effectiveDegradationReasons,
    queueSnapshotHash: nextLifecycle.queueSnapshotHash,
    rollbackReadiness: Number((params.rollbackReadiness ?? nextLifecycle.rollbackReadiness).toFixed(2)),
    heartbeatDiagnostics: {
      heartbeatStatus: heartbeatSnapshot.heartbeat.heartbeatStatus,
      mutationHealthScore: Number(heartbeatSnapshot.heartbeat.mutationHealthScore.toFixed(2)),
      mutationDriftScore: Number(heartbeatSnapshot.heartbeat.mutationDriftScore.toFixed(2)),
      transportFreshnessScore: Number(heartbeatSnapshot.heartbeat.transportFreshnessScore.toFixed(2)),
    },
    verificationOutcome: {
      verificationState: nextLifecycle.verificationState,
      verificationScore: Number((params.verificationScore ?? params.session.state.mutationVerificationConfidence ?? 0).toFixed(2)),
      passed: params.verificationPassed ?? Boolean(params.session.state.queueVerificationPassed),
    },
    runtimeWarnings: [...(params.runtimeWarnings ?? []), ...graceSnapshot.grace.reasons],
    transitionDiagnostics: [
      ...(params.transitionDiagnostics ?? []),
      `grace_state:${graceSnapshot.grace.state}`,
      `grace_penalty:${graceSnapshot.grace.confidencePenalty.toFixed(2)}`,
    ],
    timestamp,
  });

  params.session.state = {
    ...params.session.state,
    mutationState: mapLifecycleToLegacyMutationState(nextLifecycle.state),
    mutationStateChangedAt: nextLifecycle.stateUpdatedAt,
    mutationHeartbeatAt: heartbeatAt,
    mutationLifecycle: nextLifecycle,
    mutationAuditTrail: params.session.mutationAuditTrail,
    mutationHeartbeat: heartbeatSnapshot.heartbeat,
    mutationHealthScore: heartbeatSnapshot.heartbeat.mutationHealthScore,
    mutationDriftScore: heartbeatSnapshot.heartbeat.mutationDriftScore,
    transportFreshnessScore: heartbeatSnapshot.heartbeat.transportFreshnessScore,
    heartbeatStatus: heartbeatSnapshot.heartbeat.heartbeatStatus,
    freshnessGrace: graceSnapshot.grace,
    graceState: graceSnapshot.grace.state,
    graceFailure: graceSnapshot.grace.graceFailure,
    graceConfidencePenalty: graceSnapshot.grace.confidencePenalty,
    graceReasons: graceSnapshot.grace.reasons,
    executionDegradationReasons:
      effectiveDegradationReasons.length > 0 ? effectiveDegradationReasons : params.session.state.executionDegradationReasons ?? [],
    mutationTimeline: [
      ...(params.session.state.mutationTimeline ?? []),
      {
        timestamp,
        state: nextLifecycle.state,
        reasoning: params.reasoning,
      },
    ],
    executionReasoning: [...params.session.state.executionReasoning, params.reasoning],
  };
}

function freshnessToScore(userId: string) {
  const heartbeat = evaluateTelemetryFreshness(userId);
  const playbackScore =
    heartbeat.playbackFreshness === "healthy"
      ? 100
      : heartbeat.playbackFreshness === "aging"
        ? 78
        : heartbeat.playbackFreshness === "stale"
          ? 52
          : 24;
  const queueScore =
    heartbeat.queueFreshness === "healthy"
      ? 100
      : heartbeat.queueFreshness === "aging"
        ? 80
        : heartbeat.queueFreshness === "stale"
          ? 58
          : 30;
  const deviceScore =
    heartbeat.deviceFreshness === "healthy"
      ? 100
      : heartbeat.deviceFreshness === "aging"
        ? 82
        : heartbeat.deviceFreshness === "stale"
          ? 54
          : 22;
  return {
    heartbeat,
    freshnessScore: Number(clamp(playbackScore * 0.5 + queueScore * 0.3 + deviceScore * 0.2, 0, 100).toFixed(2)),
  };
}

function computeMutationContinuity(params: {
  freshnessScore: number;
  transportStability: number;
  heartbeatContinuity: number;
  mutationFailures: number;
}) {
  return Number(
    clamp(
      params.freshnessScore * 0.28 +
        params.transportStability * 0.42 +
        params.heartbeatContinuity * 0.3 -
        params.mutationFailures * 10,
      0,
      100,
    ).toFixed(2),
  );
}

function computeRollbackIntegrity(params: {
  rollbackSnapshot: QueueRollbackSnapshot | null;
  verificationPassed: boolean;
  playbackStable: boolean;
  syncHealthy: boolean;
}) {
  const snapshotComplete = Boolean(
    params.rollbackSnapshot &&
      params.rollbackSnapshot.currentTrackUri &&
      params.rollbackSnapshot.queueHeadUri &&
      params.rollbackSnapshot.playbackPositionMs !== null,
  );
  return Number(
    clamp(
      (snapshotComplete ? 50 : 18) +
        (params.verificationPassed ? 22 : 0) +
        (params.playbackStable ? 14 : 4) +
        (params.syncHealthy ? 14 : 3),
      0,
      100,
    ).toFixed(2),
  );
}

function describeRollbackIntegrity(params: {
  rollbackSnapshot: QueueRollbackSnapshot | null;
  verificationPassed: boolean;
  playbackStable: boolean;
  syncHealthy: boolean;
}) {
  const reasons: string[] = [];
  if (
    params.rollbackSnapshot?.currentTrackUri &&
    params.rollbackSnapshot?.queueHeadUri &&
    params.rollbackSnapshot?.playbackPositionMs !== null
  ) {
    reasons.push("Rollback snapshot is complete.");
  } else {
    reasons.push("Rollback snapshot is incomplete.");
  }
  reasons.push(params.verificationPassed ? "Queue verification succeeded." : "Queue verification pending/failed.");
  reasons.push(params.playbackStable ? "Playback remained stable." : "Playback stability degraded.");
  reasons.push(params.syncHealthy ? "Device synchronization healthy." : "Device synchronization degraded.");
  return reasons;
}

function computeMutationSafety(params: {
  readinessScore: number;
  transportStability: number;
  heartbeatContinuity: number;
  freshnessScore: number;
  blockersCount: number;
}) {
  return Number(
    clamp(
      params.readinessScore * 0.38 +
        params.transportStability * 0.32 +
        params.heartbeatContinuity * 0.2 +
        params.freshnessScore * 0.1 -
        params.blockersCount * 7,
      0,
      100,
    ).toFixed(2),
  );
}

async function withTokenRecovery<T>(params: {
  userId: string;
  run: () => Promise<T>;
}): Promise<{ ok: boolean; value: T | null; tokenRefreshStatus: "not_needed" | "refreshed" | "failed" }> {
  try {
    const value = await params.run();
    return { ok: true, value, tokenRefreshStatus: "not_needed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("401")) {
      throw error;
    }
    try {
      await forceRefreshSpotifyAccessToken(params.userId);
      const retryValue = await params.run();
      return { ok: true, value: retryValue, tokenRefreshStatus: "refreshed" };
    } catch {
      return { ok: false, value: null, tokenRefreshStatus: "failed" };
    }
  }
}

function computeRollbackIntegrityRecovery(params: {
  baseIntegrity: number;
  mutationState?: PlaybackExecutionState["mutationState"];
  mutationContinuity: number;
  heartbeatContinuity: number;
  queueFreshness: number;
  deviceHealthy: boolean;
  transportHealthy: boolean;
  verificationPassed: boolean;
  mutationStateChangedAt?: number;
}) {
  const inPreservationState = params.mutationState === "mutating" || params.mutationState === "verifying";
  const verificationGraceActive =
    params.mutationState === "verifying" &&
    Date.now() - (params.mutationStateChangedAt ?? Date.now()) <= 8_000 &&
    params.deviceHealthy &&
    params.transportHealthy &&
    params.heartbeatContinuity >= 65;
  const preservationActive =
    inPreservationState &&
    params.deviceHealthy &&
    params.transportHealthy &&
    params.heartbeatContinuity >= 65 &&
    params.queueFreshness >= 60;
  const continuityLift = preservationActive
    ? clamp(
        params.mutationContinuity * 0.08 +
          params.heartbeatContinuity * 0.06 +
          (verificationGraceActive ? 6 : 0) +
          (params.verificationPassed ? 8 : 0),
        0,
        18,
      )
    : 0;
  const stabilizedIntegrity = Number(clamp(params.baseIntegrity + continuityLift, 0, 100).toFixed(2));
  return {
    rollbackIntegrity: stabilizedIntegrity,
    verificationGraceActive,
    rollbackPreservationActive: preservationActive || verificationGraceActive,
  };
}

function boundedPush<T>(list: T[], next: T, max = 96) {
  const merged = [...list, next];
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

function mapFreshnessStateToScore(state: "healthy" | "aging" | "stale" | "expired") {
  return state === "healthy" ? 100 : state === "aging" ? 78 : state === "stale" ? 48 : 18;
}

function computeFreshnessGraceSnapshot(params: {
  userId: string;
  session: ExecutionSession;
  baseConfidence: number;
  graceAllowed: boolean;
  propagationDelayMs?: number;
}) {
  const freshness = evaluateTelemetryFreshness(params.userId);
  const freshnessAgeMs = Math.max(freshness.playbackAgeMs ?? 0, freshness.deviceAgeMs ?? 0, freshness.queueAgeMs ?? 0);
  const inferredDelay = Math.max(0, params.propagationDelayMs ?? freshnessAgeMs * 0.25);
  const freshnessState = freshness.playbackFreshness;
  const grace = evaluateBoundedFreshnessGrace({
    now: Date.now(),
    graceStartedAt: params.session.graceStartedAt,
    maxGraceWindowMs: 20_000,
    freshnessState,
    baseConfidence: clamp(params.baseConfidence, 0, 100),
    graceAllowed: params.graceAllowed,
  });
  return {
    grace,
    freshnessAgeMs,
    inferredDelay,
    freshnessState,
  };
}

function computeMutationHeartbeatSnapshot(params: {
  userId: string;
  session: ExecutionSession;
  transportSyncStatus?: string;
  propagationDelayMs?: number;
  acknowledgementLatencyMs?: number;
  playbackContinuityStability?: number;
  queueDriftDelta?: number;
  playbackDesyncDelta?: number;
}) {
  const freshness = evaluateTelemetryFreshness(params.userId);
  const telemetryFreshnessAgeMs = Math.max(
    freshness.playbackAgeMs ?? 0,
    freshness.deviceAgeMs ?? 0,
    freshness.queueAgeMs ?? 0,
  );
  const propagationDelayMs = Math.max(0, params.propagationDelayMs ?? telemetryFreshnessAgeMs * 0.25);
  const acknowledgementLatencyMs = Math.max(0, params.acknowledgementLatencyMs ?? telemetryFreshnessAgeMs * 0.2);
  const queueDriftDelta = Math.max(
    0,
    params.queueDriftDelta ??
      Math.abs((params.session.state.verificationTransportLatency ?? 70) - (params.session.state.verificationWindowIntegrity ?? 70)),
  );
  const syncPenalty =
    params.transportSyncStatus === "synced"
      ? 8
      : params.transportSyncStatus === "degraded"
        ? 38
        : params.transportSyncStatus === "desynced"
          ? 72
          : 44;
  const playbackDesyncDelta = Math.max(
    0,
    params.playbackDesyncDelta ??
      clamp(
        Math.abs(100 - (params.session.state.verificationHeartbeatContinuity ?? freshness.heartbeatContinuityScore ?? 62)) +
          syncPenalty * 0.35,
        0,
        100,
      ),
  );
  const playbackContinuityStability = clamp(
    params.playbackContinuityStability ??
      (params.session.state.verificationMutationConsistency ??
        params.session.state.mutationContinuity ??
        freshness.heartbeatContinuityScore ??
        62),
    0,
    100,
  );
  const heartbeat = evaluateMutationHeartbeat({
    now: Date.now(),
    mutationId: params.session.lifecycle.mutationId,
    orchestrationId: params.session.lifecycle.orchestrationId,
    telemetryFreshnessState: freshness.playbackFreshness,
    telemetryFreshnessAgeMs,
    propagationDelayMs,
    acknowledgementLatencyMs,
    playbackDesyncDelta,
    queueDriftDelta,
    playbackContinuityStability,
  });
  return {
    heartbeat,
    telemetryFreshnessAgeMs,
    queueDriftDelta,
    playbackDesyncDelta,
    propagationDelayMs,
    acknowledgementLatencyMs,
    freshness,
  };
}

function evaluateVerificationStabilization(params: {
  previous: PlaybackExecutionState;
  freshness: ReturnType<typeof freshnessToScore>;
  transportStability: number;
  mutationContinuity: number;
  rollbackIntegrity: number;
  verificationPhaseDurationMs: number;
  runtimeVerificationWindowMs: number;
  authState: PlaybackExecutionState["transportAuthState"];
  runtimeConvergence: number;
  queueVerificationPassed: boolean;
  recentMutationFailures: number;
  recentSuccessfulSyncCycles: number;
  recoveryState: "idle" | "active" | "completed" | "failed";
  graceActive: boolean;
}) {
  const now = Date.now();
  const prevContinuity = params.previous.verificationContinuity ?? 58;
  const prevFailurePressure = params.previous.verificationFailurePressure ?? 28;
  const prevHeartbeatContinuity = params.previous.verificationHeartbeatContinuity ?? 62;
  const prevSnapshotReliability = params.previous.verificationSnapshotReliability ?? 62;
  const playbackFreshnessScore = mapFreshnessStateToScore(params.freshness.heartbeat.playbackFreshness);
  const queueFreshnessScore = mapFreshnessStateToScore(params.freshness.heartbeat.queueFreshness);
  const deviceFreshnessScore = mapFreshnessStateToScore(params.freshness.heartbeat.deviceFreshness);
  const heartbeatAgeMs = Math.max(0, now - (params.previous.mutationHeartbeatAt ?? now));
  const heartbeatAgePenalty = clamp(heartbeatAgeMs / 150, 0, 100);
  const verificationTimingGap = Math.abs(params.verificationPhaseDurationMs - params.runtimeVerificationWindowMs);
  const timingGapPenalty = clamp(verificationTimingGap / 65, 0, 100);
  const timeoutClusterCount = (params.previous.verificationLatencyHistory ?? [])
    .slice(-8)
    .filter((item) => item.timingGap >= 62 || item.latency >= 70).length;
  const staleWindowCount = (params.previous.verificationFreshnessHistory ?? [])
    .slice(-10)
    .filter((item) => item.freshnessConfidence < 52).length;
  const syncInterruptionFrequency = clamp(params.recentMutationFailures * 14 + timeoutClusterCount * 7, 0, 100);
  const heartbeatDriftFrequency = clamp(
    Math.max(0, params.freshness.heartbeat.heartbeatDrift - 20) * 1.05 + timeoutClusterCount * 5,
    0,
    100,
  );
  const mutationTimingGaps = clamp(
    timingGapPenalty * 0.72 + heartbeatAgePenalty * 0.28 + timeoutClusterCount * 4,
    0,
    100,
  );
  const playbackSnapshotJitter = clamp(
    (100 - params.transportStability) * 0.52 + params.freshness.heartbeat.heartbeatDrift * 0.3 + timeoutClusterCount * 4,
    0,
    100,
  );
  const verificationTransportLatency = Number(
    clamp(
      100 -
        (timingGapPenalty * 0.42 +
          heartbeatAgePenalty * 0.28 +
          playbackSnapshotJitter * 0.14 +
          syncInterruptionFrequency * 0.16),
      0,
      100,
    ).toFixed(2),
  );
  const freshnessGraceApplied =
    params.graceActive &&
    params.freshness.heartbeat.playbackFreshness !== "healthy" &&
    params.freshness.heartbeat.heartbeatContinuityScore >= 65 &&
    params.transportStability >= 62;
  const verificationFreshnessConfidence = Number(
    clamp(
      playbackFreshnessScore * 0.42 +
        queueFreshnessScore * 0.3 +
        deviceFreshnessScore * 0.14 +
        params.freshness.heartbeat.heartbeatContinuityScore * 0.14 +
        (freshnessGraceApplied ? 8 : 0),
      0,
      100,
    ).toFixed(2),
  );
  const verificationHeartbeatContinuity = Number(
    clamp(
      params.freshness.heartbeat.heartbeatContinuityScore * 0.62 +
        (100 - heartbeatAgePenalty) * 0.2 +
        (100 - heartbeatDriftFrequency) * 0.18,
      0,
      100,
    ).toFixed(2),
  );
  const verificationMutationConsistency = Number(
    clamp(
      params.mutationContinuity * 0.34 +
        params.rollbackIntegrity * 0.2 +
        params.transportStability * 0.2 +
        params.runtimeConvergence * 0.14 +
        (100 - syncInterruptionFrequency) * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const verificationWindowIntegrity = Number(
    clamp(
      (100 - timingGapPenalty) * 0.44 +
        verificationHeartbeatContinuity * 0.2 +
        verificationTransportLatency * 0.2 +
        params.transportStability * 0.16,
      0,
      100,
    ).toFixed(2),
  );
  const verificationSnapshotReliability = Number(
    clamp(
      params.rollbackIntegrity * 0.32 +
        params.transportStability * 0.24 +
        verificationHeartbeatContinuity * 0.2 +
        (100 - playbackSnapshotJitter) * 0.14 +
        (params.queueVerificationPassed ? 10 : 0),
      0,
      100,
    ).toFixed(2),
  );
  const verificationRecoveryConfidence = Number(
    clamp(
      params.recentSuccessfulSyncCycles * 0.24 +
        (100 - syncInterruptionFrequency) * 0.16 +
        verificationSnapshotReliability * 0.18 +
        (params.authState === "healthy" || params.authState === "refreshed" ? 14 : 3) +
        (params.recoveryState === "completed" ? 12 : params.recoveryState === "active" ? 7 : params.recoveryState === "failed" ? -8 : 0) +
        params.runtimeConvergence * 0.16 +
        (100 - staleWindowCount * 8) * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const pressureIncrease =
    (params.queueVerificationPassed ? 0 : 9) +
    (params.recentMutationFailures > 0 ? 8 : 0) +
    (staleWindowCount >= 2 ? 7 : 0) +
    (timeoutClusterCount >= 2 ? 7 : 0) +
    (params.rollbackIntegrity < 50 ? 6 : 0) +
    (params.authState === "degraded" ? 10 : 0);
  const pressureDecay =
    params.queueVerificationPassed &&
    verificationHeartbeatContinuity >= 66 &&
    verificationFreshnessConfidence >= 62 &&
    params.transportStability >= 64
      ? 8
      : params.recoveryState === "completed"
        ? 5
        : 2;
  const verificationFailurePressure = Number(
    clamp(prevFailurePressure + pressureIncrease - pressureDecay, 0, 100).toFixed(2),
  );
  const verificationContinuity = Number(
    clamp(
      prevContinuity * 0.24 +
        verificationFreshnessConfidence * 0.16 +
        verificationHeartbeatContinuity * 0.16 +
        verificationMutationConsistency * 0.16 +
        verificationWindowIntegrity * 0.14 +
        verificationSnapshotReliability * 0.14,
      0,
      100,
    ).toFixed(2),
  );
  const verificationStabilizationConfidence = Number(
    clamp(
      verificationContinuity * 0.26 +
        verificationRecoveryConfidence * 0.2 +
        verificationWindowIntegrity * 0.16 +
        verificationSnapshotReliability * 0.16 +
        verificationTransportLatency * 0.12 +
        (100 - verificationFailurePressure) * 0.1,
      0,
      100,
    ).toFixed(2),
  );

  const verificationContinuityHistory = boundedPush(
    params.previous.verificationContinuityHistory ?? [],
    {
      timestamp: now,
      continuity: verificationContinuity,
      heartbeatContinuity: verificationHeartbeatContinuity,
      mutationConsistency: verificationMutationConsistency,
    },
    96,
  );
  const verificationLatencyHistory = boundedPush(
    params.previous.verificationLatencyHistory ?? [],
    {
      timestamp: now,
      latency: verificationTransportLatency,
      transportLatency: Number(clamp(100 - playbackSnapshotJitter, 0, 100).toFixed(2)),
      timingGap: Number(clamp(timingGapPenalty, 0, 100).toFixed(2)),
    },
    96,
  );
  const verificationFreshnessHistory = boundedPush(
    params.previous.verificationFreshnessHistory ?? [],
    {
      timestamp: now,
      freshnessConfidence: verificationFreshnessConfidence,
      playbackFreshness: playbackFreshnessScore,
      queueFreshness: queueFreshnessScore,
      graceApplied: freshnessGraceApplied,
    },
    96,
  );
  const verificationIntegrityHistory = boundedPush(
    params.previous.verificationIntegrityHistory ?? [],
    {
      timestamp: now,
      windowIntegrity: verificationWindowIntegrity,
      snapshotReliability: verificationSnapshotReliability,
      recoveryConfidence: verificationRecoveryConfidence,
      failurePressure: verificationFailurePressure,
    },
    96,
  );
  const verificationStabilizationSummary: string[] = [];
  if (verificationFreshnessConfidence < 55) {
    verificationStabilizationSummary.push("Freshness became stale from repeated stale playback/queue telemetry windows.");
  }
  if (verificationHeartbeatContinuity < prevHeartbeatContinuity - 5) {
    verificationStabilizationSummary.push("Heartbeat continuity degraded due to drift bursts or mutation heartbeat age growth.");
  }
  if (timingGapPenalty >= 60 || timeoutClusterCount >= 2) {
    verificationStabilizationSummary.push("Verification timing failed under timeout clustering and mutation timing gaps.");
  }
  if (verificationMutationConsistency < 58) {
    verificationStabilizationSummary.push("Mutation consistency unstable from sync interruptions, rollback pressure, or auth stress.");
  }
  if (freshnessGraceApplied) {
    verificationStabilizationSummary.push("Guarded freshness grace applied within active verification window under stable heartbeat/transport.");
  }
  if (verificationStabilizationConfidence >= 68 || verificationRecoveryConfidence >= 70) {
    verificationStabilizationSummary.push("Stabilization confidence improved through sync recovery and snapshot reliability gains.");
  }
  if (verificationSnapshotReliability <= prevSnapshotReliability - 5) {
    verificationStabilizationSummary.push("Snapshot reliability degraded from transport jitter and verification interruption clustering.");
  }
  if (verificationStabilizationSummary.length === 0) {
    verificationStabilizationSummary.push("Verification telemetry remained stable under supervised continuity constraints.");
  }
  return {
    verificationContinuity,
    verificationFreshnessConfidence,
    verificationTransportLatency,
    verificationHeartbeatContinuity,
    verificationMutationConsistency,
    verificationWindowIntegrity,
    verificationSnapshotReliability,
    verificationRecoveryConfidence,
    verificationStabilizationConfidence,
    verificationFailurePressure,
    verificationContinuityHistory,
    verificationLatencyHistory,
    verificationFreshnessHistory,
    verificationIntegrityHistory,
    verificationStabilizationSummary,
  };
}

export async function verifyQueueMutation(params: {
  userId: string;
  targetTrackUri: string;
  rollbackSnapshot: QueueRollbackSnapshot | null;
  preMutationQueue?: Array<{ uri: string }>;
  expectedInsertionIndex?: number | null;
  expectedDeviceId?: string | null;
}) {
  const continuity = await ensureSpotifyTransportAuth({
    userId: params.userId,
    minValidityMs: 90_000,
    supervisedExecutionActive: true,
    reason: "mutation_verification_precheck",
  });
  if (!continuity.ok) {
    return {
      verificationPassed: false,
      verificationConfidence: 0,
      queueVerified: false,
      targetUriDetected: false,
      transportHealthy: false,
      rollbackSnapshotHealthy: false,
      verificationReasoning: [
        "Execution blocked due to auth expiry/degradation before verification.",
        ...continuity.state.authRecoveryReasoning.slice(-3),
      ],
      tokenRefreshStatus: "failed" as const,
      authDegraded: true,
      authContinuity: continuity.state,
      normalizedVerification: undefined as MutationVerificationResult | undefined,
    };
  }
  let queueFetch:
    | { ok: boolean; value: Awaited<ReturnType<typeof getSpotifyQueueState>> | null; tokenRefreshStatus: "not_needed" | "refreshed" | "failed" }
    | null = null;
  let playbackFetch:
    | {
        ok: boolean;
        value: Awaited<ReturnType<typeof getPlaybackOrchestrationState>> | null;
        tokenRefreshStatus: "not_needed" | "refreshed" | "failed";
      }
    | null = null;
  try {
    queueFetch = await withTokenRecovery({
      userId: params.userId,
      run: () => getSpotifyQueueState(params.userId),
    });
    playbackFetch = await withTokenRecovery({
      userId: params.userId,
      run: () => getPlaybackOrchestrationState(params.userId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authLikely = message.includes("401");
    return {
      verificationPassed: false,
      verificationConfidence: 0,
      queueVerified: false,
      targetUriDetected: false,
      transportHealthy: false,
      rollbackSnapshotHealthy: false,
      verificationReasoning: [
        authLikely
          ? "Verification failed due to auth during Spotify verification fetch."
          : "Verification blocked due to hard safety gate in verification fetch.",
      ],
      tokenRefreshStatus: authLikely ? ("failed" as const) : ("not_needed" as const),
      authDegraded: authLikely,
      authContinuity: continuity.state,
      normalizedVerification: undefined as MutationVerificationResult | undefined,
    };
  }
  if (!queueFetch || !playbackFetch) {
    return {
      verificationPassed: false,
      verificationConfidence: 0,
      queueVerified: false,
      targetUriDetected: false,
      transportHealthy: false,
      rollbackSnapshotHealthy: false,
      verificationReasoning: ["Stabilization blocked due to hard safety gate in verification fetch."],
      tokenRefreshStatus: "not_needed" as const,
      authDegraded: false,
      authContinuity: continuity.state,
      normalizedVerification: undefined as MutationVerificationResult | undefined,
    };
  }
  if (!queueFetch.ok || !playbackFetch.ok || !playbackFetch.value) {
    return {
      verificationPassed: false,
      verificationConfidence: 0,
      queueVerified: false,
      targetUriDetected: false,
      transportHealthy: false,
      rollbackSnapshotHealthy: false,
      verificationReasoning: ["Verification failed due to auth refresh failure or transport auth degradation."],
      tokenRefreshStatus:
        queueFetch.tokenRefreshStatus === "failed" || playbackFetch.tokenRefreshStatus === "failed"
          ? ("failed" as const)
          : queueFetch.tokenRefreshStatus === "refreshed" || playbackFetch.tokenRefreshStatus === "refreshed"
            ? ("refreshed" as const)
            : ("not_needed" as const),
      authDegraded: true,
      authContinuity: continuity.state,
      normalizedVerification: undefined as MutationVerificationResult | undefined,
    };
  }
  const queueState = queueFetch.value;
  const playback = playbackFetch.value;
  const targetUriDetected = Boolean(queueState?.queue?.some((track) => track.uri === params.targetTrackUri));
  const queueVerified = Boolean(queueState && queueState.queue.length > 0);
  const transportHealthy = Boolean(
    playback.activeDevice &&
      !playback.activeDevice.is_restricted &&
      playback.queueStatus?.syncStatus === "synced" &&
      playback.playbackState,
  );
  const rollbackSnapshotHealthy = Boolean(
    params.rollbackSnapshot &&
      params.rollbackSnapshot.currentTrackUri &&
      params.rollbackSnapshot.queueHeadUri &&
      params.rollbackSnapshot.playbackPositionMs !== null,
  );
  const legacyVerificationPassed = targetUriDetected && queueVerified && transportHealthy && rollbackSnapshotHealthy;
  const legacyVerificationConfidence = Number(
    clamp(
      (targetUriDetected ? 34 : 8) +
        (queueVerified ? 24 : 8) +
        (transportHealthy ? 24 : 8) +
        (rollbackSnapshotHealthy ? 18 : 6),
      0,
      100,
    ).toFixed(2),
  );
  const normalizedVerification = evaluateQueueVerification({
    now: Date.now(),
    mutationId: params.targetTrackUri,
    orchestrationId: continuity.state.transportAuthState,
    expectedTrackUri: params.targetTrackUri,
    expectedInsertionIndex: params.expectedInsertionIndex ?? null,
    queueBefore: params.preMutationQueue ?? [],
    queueAfter: queueState?.queue?.map((track) => ({ uri: track.uri })).filter((track) => Boolean(track.uri)) as Array<{ uri: string }>,
    playbackContinuityScore: transportHealthy ? 86 : 38,
    playbackDeviceUnchanged: params.expectedDeviceId
      ? playback.activeDevice?.id === params.expectedDeviceId
      : Boolean(playback.activeDevice),
    transportSyncState: normalizeTransportSyncState(playback.queueStatus?.syncStatus),
  });
  const verificationPassed = legacyVerificationPassed && normalizedVerification.passed;
  const verificationConfidence = Number(
    clamp(legacyVerificationConfidence * 0.48 + normalizedVerification.verificationConfidence * 0.52, 0, 100).toFixed(2),
  );
  const verificationReasoning: string[] = [];
  verificationReasoning.push(
    targetUriDetected ? "Target URI detected in Spotify queue." : "Target URI missing from Spotify queue.",
  );
  verificationReasoning.push(queueVerified ? "Queue verification succeeded." : "Queue verification incomplete.");
  verificationReasoning.push(
    transportHealthy ? "Transport remained healthy during mutation." : "Transport health degraded during mutation.",
  );
  verificationReasoning.push(
    rollbackSnapshotHealthy
      ? "Rollback snapshot integrity confirmed."
      : "Rollback snapshot integrity degraded.",
  );
  const tokenRefreshStatus =
    queueFetch.tokenRefreshStatus === "refreshed" || playbackFetch.tokenRefreshStatus === "refreshed"
      ? ("refreshed" as const)
      : ("not_needed" as const);
  if (tokenRefreshStatus === "refreshed") {
    verificationReasoning.push("Spotify token refreshed successfully during verification.");
  }
  verificationReasoning.push(...normalizedVerification.reasons);
  if (normalizedVerification.instabilityDetected) {
    verificationReasoning.push("Verification instability detected; supervised degradation path engaged.");
  }
  return {
    verificationPassed,
    verificationConfidence,
    queueVerified,
    targetUriDetected,
    transportHealthy,
    rollbackSnapshotHealthy,
    verificationReasoning,
    tokenRefreshStatus,
    authDegraded: false,
    authContinuity: continuity.state,
    normalizedVerification,
  };
}

function finalizeVerificationStabilization(params: {
  userId: string;
  session: ExecutionSession;
  evaluation: TransitionEvaluationResult;
  verification: Awaited<ReturnType<typeof verifyQueueMutation>>;
  validation: Awaited<ReturnType<typeof validateQueueMutation>>;
  verificationPhaseDurationMs: number;
}) {
  const verificationPassed = params.verification.verificationPassed;
  const normalizedVerification = params.verification.normalizedVerification;
  const legacyVerificationConfidence = Number(
    clamp(
      (params.verification.targetUriDetected ? 22 : 4) +
        (params.verification.queueVerified ? 20 : 4) +
        (params.verification.transportHealthy ? 20 : 4) +
        (params.evaluation.currentState.playbackActive ? 16 : 6) +
        (params.verification.rollbackSnapshotHealthy ? 22 : 6),
      0,
      100,
    ).toFixed(2),
  );
  const verificationConfidence = Number(
    clamp(
      legacyVerificationConfidence * 0.46 + (normalizedVerification?.verificationConfidence ?? legacyVerificationConfidence) * 0.54,
      0,
      100,
    ).toFixed(2),
  );
  const verificationInstabilityDetected = Boolean(normalizedVerification?.instabilityDetected);
  const retriableVerificationFailure = Boolean(normalizedVerification?.retriable && !params.verification.verificationPassed);
  const degradationReasons = [
    ...(verificationInstabilityDetected ? ["verification_instability_detected"] : []),
    ...(retriableVerificationFailure ? ["verification_retry_eligible"] : []),
    ...(!params.verification.verificationPassed ? ["verification_failed"] : []),
  ];
  const baseSafety = computeMutationSafety({
    readinessScore: params.evaluation.executionReadinessScore,
    transportStability: params.evaluation.transportStability,
    heartbeatContinuity: params.validation.heartbeat.heartbeatContinuityScore,
    freshnessScore: params.validation.freshnessScore,
    blockersCount: verificationPassed ? 0 : 1 + (verificationInstabilityDetected ? 1 : 0),
  });
  const heartbeatSnapshot = computeMutationHeartbeatSnapshot({
    userId: params.userId,
    session: params.session,
    transportSyncStatus: params.validation.playback.queueStatus?.syncStatus,
    propagationDelayMs: params.verificationPhaseDurationMs,
    acknowledgementLatencyMs: params.verificationPhaseDurationMs * 0.7,
    playbackContinuityStability: params.verification.transportHealthy
      ? 84
      : params.validation.heartbeat.heartbeatContinuityScore * 0.56,
    queueDriftDelta: Math.abs((params.validation.heartbeat.heartbeatDrift ?? 0) - (params.evaluation.heartbeatDrift ?? 0)),
    playbackDesyncDelta: Math.abs(
      (params.validation.heartbeat.heartbeatContinuityScore ?? 60) - (params.evaluation.deviceSynchronizationConfidence ?? 60),
    ),
  });
  const heartbeatPenalty =
    heartbeatSnapshot.heartbeat.heartbeatStatus === "critical"
      ? 14
      : heartbeatSnapshot.heartbeat.heartbeatStatus === "degraded"
        ? 8
        : heartbeatSnapshot.heartbeat.heartbeatStatus === "watch"
          ? 3
          : 0;
  const graceSnapshot = computeFreshnessGraceSnapshot({
    userId: params.userId,
    session: params.session,
    baseConfidence: verificationConfidence,
    graceAllowed: true,
    propagationDelayMs: heartbeatSnapshot.propagationDelayMs,
  });
  const gracePenalty = graceSnapshot.grace.confidencePenalty + (graceSnapshot.grace.graceFailure ? 10 : 0);
  const graceFailure = graceSnapshot.grace.graceFailure;
  const recomputedSafety = Number(clamp(baseSafety + (verificationPassed ? 10 : -8), 0, 100).toFixed(2));
  const normalizedRollback = evaluateNormalizedRollbackStability({
    userId: params.userId,
    session: params.session,
    verificationPassed,
    playbackStable: params.verification.transportHealthy,
    syncHealthy: params.verification.transportHealthy && params.evaluation.deviceSynchronizationConfidence >= 70,
    transportConsistencyScore: params.evaluation.transportStability,
  });
  const rollbackRecovery = computeRollbackIntegrityRecovery({
    baseIntegrity: normalizedRollback.mergedRollbackIntegrity,
    mutationState: params.session.state.mutationState,
    mutationContinuity: params.session.state.mutationContinuity ?? 0,
    heartbeatContinuity: params.validation.heartbeat.heartbeatContinuityScore,
    queueFreshness: params.validation.freshnessScore,
    deviceHealthy: Boolean(params.verification.transportHealthy),
    transportHealthy: Boolean(params.verification.transportHealthy),
    verificationPassed,
    mutationStateChangedAt: params.session.state.mutationStateChangedAt,
  });
  const recentMutationFailures = params.session.mutationFailures;
  const recentSuccessfulSyncCycles = clamp(
    (params.validation.playback.queueStatus?.syncStatus === "synced" ? 48 : 20) +
      (params.verification.transportHealthy ? 32 : 10) +
      (params.validation.heartbeat.heartbeatContinuityScore >= 65 ? 20 : 0),
    0,
    100,
  );
  const verificationStabilization = evaluateVerificationStabilization({
    previous: params.session.state,
    freshness: {
      heartbeat: params.validation.heartbeat,
      freshnessScore: params.validation.freshnessScore,
    },
    transportStability: params.evaluation.transportStability,
    mutationContinuity: params.session.state.mutationContinuity ?? 0,
    rollbackIntegrity: rollbackRecovery.rollbackIntegrity,
    verificationPhaseDurationMs: params.verificationPhaseDurationMs,
    runtimeVerificationWindowMs: 6_000,
    authState: params.verification.authDegraded ? "degraded" : params.verification.tokenRefreshStatus === "refreshed" ? "refreshed" : "healthy",
    runtimeConvergence: params.evaluation.executionReadinessScore,
    queueVerificationPassed: verificationPassed,
    recentMutationFailures,
    recentSuccessfulSyncCycles,
    recoveryState: verificationPassed ? "completed" : "active",
    graceActive: rollbackRecovery.verificationGraceActive || params.validation.graceStabilization,
  });
  return {
    verificationPassed,
    mutationVerificationConfidence: Number(
      clamp(verificationConfidence - heartbeatPenalty - gracePenalty, 0, 100).toFixed(2),
    ),
    normalizedVerification,
    verificationInstabilityDetected,
    retriableVerificationFailure,
    degradationReasons,
    transportMutationSafety: recomputedSafety,
    rollbackIntegrity: rollbackRecovery.rollbackIntegrity,
    rollbackStability: normalizedRollback.normalized,
    rollbackConfidence: normalizedRollback.rollbackConfidence,
    rollbackIntegrityScore: normalizedRollback.normalized.rollbackIntegrityScore,
    rollbackBlockers: normalizedRollback.rollbackBlockers,
    restorationFeasibility: normalizedRollback.restorationFeasibility,
    rollbackAllowed: normalizedRollback.rollbackAllowed,
    rollbackReasoning: normalizedRollback.rollbackReasoning,
    rollbackRecovery,
    verificationStabilization,
    mutationHeartbeat: heartbeatSnapshot.heartbeat,
    mutationHealthScore: heartbeatSnapshot.heartbeat.mutationHealthScore,
    mutationDriftScore: heartbeatSnapshot.heartbeat.mutationDriftScore,
    transportFreshnessScore: heartbeatSnapshot.heartbeat.transportFreshnessScore,
    heartbeatStatus: heartbeatSnapshot.heartbeat.heartbeatStatus,
    heartbeatReasoning: heartbeatSnapshot.heartbeat.reasoning,
    heartbeatPenalty,
    freshnessGrace: graceSnapshot.grace,
    graceState: graceSnapshot.grace.state,
    graceFailure,
    graceConfidencePenalty: graceSnapshot.grace.confidencePenalty,
    graceReasons: graceSnapshot.grace.reasons,
    gracePenalty,
  };
}

export async function refreshRollbackSurvivabilityContext(params: {
  userId: string;
  evaluation?: import("@/lib/ai/transition-engine").TransitionEvaluationResult | null;
  transportRuntime?: import("@/lib/transition-orchestration/layer-state").TransportRuntimeState | null;
  queueUris?: string[];
  playbackActive?: boolean;
}) {
  const session = executionStore.get(params.userId);
  const { analyzeTransportRecovery } = await import("@/lib/spotify/transport-recovery-engine");
  const { evaluateRollbackSurvivability } = await import("@/lib/spotify/rollback-survivability-engine");
  const { computeMutationReliability } = await import("@/lib/spotify/mutation-journal");
  const { getLatestCheckpoint } = await import("@/lib/spotify/mutation-checkpoint-engine");
  const { getMutationHistory } = await import("@/lib/spotify/mutation-journal");

  const transportRecovery = analyzeTransportRecovery({
    userId: params.userId,
    transportRuntime: params.transportRuntime ?? null,
    deviceSynchronizationConfidence: params.evaluation?.deviceSynchronizationConfidence,
    transportStability: params.evaluation?.transportStability,
    heartbeatContinuity: params.evaluation?.heartbeatContinuity,
    rollbackIntegrity: session?.state.rollbackIntegrity ?? session?.state.rollbackIntegrityScore,
    queueContinuityScore: params.transportRuntime?.queueContinuityScore,
  });

  const survivability = evaluateRollbackSurvivability({
    userId: params.userId,
    evaluation: params.evaluation,
    executionState: session
      ? {
          rollbackSnapshot: session.rollbackSnapshot,
          rollbackIntegrity: session.state.rollbackIntegrity,
          rollbackIntegrityScore: session.state.rollbackIntegrityScore,
          rollbackConfidence: session.state.rollbackConfidence,
          verificationFinalized: session.state.verificationFinalized,
          verificationSnapshotReliability: session.state.verificationSnapshotReliability,
          verificationRecoveryConfidence: session.state.verificationRecoveryConfidence,
          transportIntegrityScore: session.state.transportIntegrityScore,
          mutationRecoverabilityScore: session.state.mutationRecoverabilityScore,
        }
      : null,
    transportRuntime: params.transportRuntime ?? null,
    queueUris: params.queueUris,
    playbackActive: params.playbackActive,
    transportRecovery,
  });

  const mutationReliability = computeMutationReliability(params.userId);
  const latestCheckpointId = getLatestCheckpoint(params.userId)?.checkpointId;
  const mutationJournalSize = getMutationHistory(params.userId).length;

  if (session) {
    session.state = {
      ...session.state,
      rollbackSurvivability: survivability,
      transportRecovery,
      mutationReliability,
      latestCheckpointId,
      mutationJournalSize,
      rollbackReadiness: survivability.rollbackReadiness,
      rollbackIntegrity: Number(
        clamp(
          Math.max(session.state.rollbackIntegrity ?? 0, survivability.replayConfidence),
          0,
          100,
        ).toFixed(2),
      ),
      rollbackConfidence: Number(
        clamp(
          Math.max(session.state.rollbackConfidence ?? 0, survivability.replayConfidence * 0.95),
          0,
          100,
        ).toFixed(2),
      ),
      mutationRecoverabilityScore: Number(
        clamp(
          Math.max(session.state.mutationRecoverabilityScore ?? 0, survivability.survivabilityScore),
          0,
          100,
        ).toFixed(2),
      ),
    };
    executionStore.set(params.userId, session);
  }

  return { survivability, transportRecovery, mutationReliability, latestCheckpointId, mutationJournalSize };
}

export function getPlaybackExecutionState(userId: string): PlaybackExecutionState {
  const session = executionStore.get(userId);
  const authState = getSpotifyTransportAuthContinuityState(userId);
  if (session)
    return buildPlaybackExecutionObservability({
      ...session.state,
      mutationLifecycle: session.lifecycle,
      mutationAuditTrail: session.mutationAuditTrail,
      accessTokenExpiresAt: authState.accessTokenExpiresAt,
      lastSuccessfulRefreshAt: authState.lastSuccessfulRefreshAt,
      refreshFailureCount: authState.refreshFailureCount,
      authRecoveryReasoning: authState.authRecoveryReasoning.slice(-6),
      transportAuthState:
        authState.transportAuthState === "refreshing"
          ? "refreshed"
          : authState.transportAuthState === "healthy"
            ? (session.state.transportAuthState ?? "healthy")
            : "degraded",
    });
  return buildPlaybackExecutionObservability({
    executionId: randomExecutionId(),
    executionStatus: "idle",
    preparationConfidence: 0,
    executionConfidence: 0,
    rollbackAvailable: false,
    executionReasoning: ["No active playback execution session."],
    executionSafety: "guarded",
    operatorApprovalRequired: false,
    mutationSessionId: randomExecutionId(),
    mutationState: "idle",
    mutationContinuity: 0,
    mutationVerificationConfidence: 0,
    queueMutationFreshness: 0,
    rollbackIntegrity: 0,
    transportMutationSafety: 0,
    queueVerificationPassed: false,
    queueVerificationResult: "No mutation verification has run.",
    mutationAttemptCount: 0,
    retryBoundReached: false,
    mutationStateChangedAt: undefined,
    rollbackIntegrityReasoning: [],
    latestVerificationResult: undefined,
    mutationTimeline: [],
    verificationPhaseDurationMs: undefined,
    verificationGraceActive: false,
    rollbackPreservationState: "inactive",
    rollbackIntegrityContributors: [],
    transportAuthState: authState.transportAuthState === "healthy" ? "healthy" : "degraded",
    tokenRefreshStatus: "not_needed",
    verificationFinalized: false,
    stabilizationCompleted: false,
    rollbackRecomputeStatus: "pending",
    recommendationFreshnessState: "healthy",
    accessTokenExpiresAt: authState.accessTokenExpiresAt,
    lastSuccessfulRefreshAt: authState.lastSuccessfulRefreshAt,
    refreshFailureCount: authState.refreshFailureCount,
    authRecoveryReasoning: authState.authRecoveryReasoning.slice(-6),
    verificationContinuity: 0,
    verificationFreshnessConfidence: 0,
    verificationTransportLatency: 0,
    verificationHeartbeatContinuity: 0,
    verificationMutationConsistency: 0,
    verificationWindowIntegrity: 0,
    verificationSnapshotReliability: 0,
    verificationRecoveryConfidence: 0,
    verificationStabilizationConfidence: 0,
    verificationFailurePressure: 0,
    verificationContinuityHistory: [],
    verificationLatencyHistory: [],
    verificationFreshnessHistory: [],
    verificationIntegrityHistory: [],
    verificationStabilizationSummary: [],
    mutationLifecycle: createMutationLifecycle({
      mutationId: randomExecutionId(),
      orchestrationId: randomExecutionId(),
      queueSnapshotHash: "none",
    }),
    mutationAuditTrail: [],
    executionDegradationReasons: [],
    mutationVerification: undefined,
    verificationConfidence: 0,
    verificationReasons: [],
    instabilityDetected: false,
    retriableVerificationFailure: false,
    rollbackConfidence: 0,
    rollbackIntegrityScore: 0,
    rollbackBlockers: [],
    restorationFeasibility: 0,
    rollbackAllowed: false,
    mutationHeartbeat: undefined,
    mutationHealthScore: 0,
    mutationDriftScore: 0,
    transportFreshnessScore: 0,
    heartbeatStatus: "degraded",
    freshnessGrace: undefined,
    graceState: "inactive",
    graceFailure: false,
    graceConfidencePenalty: 0,
    graceReasons: [],
  });
}

function shouldRequireApproval(evaluation: TransitionEvaluationResult) {
  return (
    evaluation.riskLevel === "high" ||
    evaluation.executionStrategy === "fast_cut" ||
    evaluation.rollbackReadiness < 52 ||
    evaluation.transitionDiagnostics.vocalOverlapRisk >= 60 ||
    evaluation.transitionAggressiveness >= 72
  );
}

export async function validateQueueMutation(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const reasoning: string[] = [];
  const authContinuity = await ensureSpotifyTransportAuth({
    userId: params.userId,
    minValidityMs: 90_000,
    supervisedExecutionActive: true,
    reason: "mutation_validation_precheck",
  });
  const playback = await getPlaybackOrchestrationState(params.userId);
  const { heartbeat, freshnessScore } = freshnessToScore(params.userId);
  const session = executionStore.get(params.userId);
  const tokenLikelyValid = Boolean(playback.activeDevice || playback.playbackState);
  const graceStabilization =
    Boolean(session) &&
    Boolean(playback.playbackState?.isPlaying) &&
    tokenLikelyValid &&
    params.evaluation.deviceSynchronizationConfidence >= 70 &&
    heartbeat.heartbeatContinuityScore >= 65 &&
    Date.now() - (session?.state.mutationStartedAt ?? 0) <= 20_000;
  if (!playback.activeDevice) blockers.push("no_active_device");
  if (!authContinuity.ok) blockers.push("transport_auth_expired");
  if (playback.activeDevice?.is_restricted) blockers.push("device_restricted");
  if (params.evaluation.executionReadiness === "blocked") blockers.push("execution_readiness_blocked");
  if (params.evaluation.executionWindowState === "expired_window") blockers.push("execution_window_expired");
  if (params.evaluation.heartbeatContinuity < 58) blockers.push("heartbeat_continuity_low");
  if (params.evaluation.transportStability < 50) blockers.push("transport_stability_low");
  const playbackPositionMs = playback.playbackState?.progressMs ?? null;
  const preparationRollbackReadiness = computePreparationRollbackReadiness({
    snapshotComplete: Boolean(playback.playbackState?.track?.uri && playbackPositionMs !== null),
    playbackActive: Boolean(playback.playbackState?.isPlaying ?? playback.playbackState?.track),
    syncState: normalizeTransportSyncState(playback.queueStatus?.syncStatus),
    heartbeatContinuity: heartbeat.heartbeatContinuityScore,
    queueFreshnessScore: freshnessScore,
    transportMutationSafety: computeMutationSafety({
      readinessScore: params.evaluation.executionReadinessScore,
      transportStability: params.evaluation.transportStability,
      heartbeatContinuity: heartbeat.heartbeatContinuityScore,
      freshnessScore,
      blockersCount: 0,
    }),
    playbackPositionKnown: playbackPositionMs !== null,
  });
  const effectiveRollbackReadiness = Math.max(params.evaluation.rollbackReadiness, preparationRollbackReadiness);
  if (effectiveRollbackReadiness < PREPARATION_ROLLBACK_READINESS_THRESHOLD) {
    blockers.push("rollback_readiness_low");
  } else if (
    params.evaluation.rollbackReadiness < PREPARATION_ROLLBACK_READINESS_THRESHOLD &&
    preparationRollbackReadiness >= PREPARATION_ROLLBACK_READINESS_THRESHOLD
  ) {
    warnings.push("rollback_readiness_stabilized_from_preparation_telemetry");
    reasoning.push(
      `Preparation rollback readiness ${preparationRollbackReadiness.toFixed(2)} superseded transition estimate ${params.evaluation.rollbackReadiness.toFixed(2)}.`,
    );
  }
  const freshnessCoordination = coordinateTelemetryFreshness(session?.state ?? null, {
    playbackAgeMs: heartbeat.playbackAgeMs,
    deviceAgeMs: heartbeat.deviceAgeMs,
    queueAgeMs: heartbeat.queueAgeMs,
  });
  console.log("[FRESHNESS] coordination", freshnessCoordination);

  const inheritanceAllowsPrep = freshnessInheritanceAllowsQueuePrep({
    chain: session?.state.freshnessInheritanceChain,
    coordination: freshnessCoordination,
    verificationFinalized: session?.state.verificationFinalized,
  });

  if (params.evaluation.executionBlockers.includes("stale_telemetry")) {
    if (freshnessCoordination.freshness === "expired" && !inheritanceAllowsPrep) {
      blockers.push("stale_playback_telemetry");
    } else if (freshnessCoordination.freshness === "grace_window" || inheritanceAllowsPrep) {
      warnings.push("telemetry_grace_window_active");
      if (inheritanceAllowsPrep) {
        console.log("[CONVERGENCE] telemetry inheritance preserved");
      }
    }
  }
  if (params.evaluation.deviceSynchronizationConfidence < 45) blockers.push("transport_sync_critical");
  if (heartbeat.playbackFreshness === "expired") {
    if (freshnessCoordination.freshness === "expired" && !inheritanceAllowsPrep) {
      blockers.push("playback_telemetry_expired");
    } else if (freshnessCoordination.freshness === "grace_window" || inheritanceAllowsPrep) {
      warnings.push("telemetry_grace_window_active");
    }
  }
  if (heartbeat.deviceFreshness === "expired") {
    if (freshnessCoordination.freshness === "expired" && !inheritanceAllowsPrep) {
      blockers.push("device_telemetry_expired");
    } else if (freshnessCoordination.freshness === "grace_window" || inheritanceAllowsPrep) {
      warnings.push("telemetry_grace_window_active");
    }
  }
  if (heartbeat.queueFreshness === "expired" && freshnessCoordination.freshness === "expired") {
    blockers.push("queue_telemetry_expired");
  } else if (
    (heartbeat.queueFreshness === "stale" || heartbeat.queueFreshness === "expired") &&
    freshnessCoordination.freshness === "grace_window"
  ) {
    warnings.push("telemetry_grace_window_active");
  }
  if (params.evaluation.executionWindowState === "narrow_window") warnings.push("narrow_execution_window");
  if (params.evaluation.riskLevel === "high") warnings.push("high_execution_risk");
  if (graceStabilization) warnings.push("mutation_freshness_grace_active");
  if (heartbeat.queueFreshness === "stale" || heartbeat.queueFreshness === "expired")
    warnings.push("queue_freshness_degraded");

  reasoning.push(
    blockers.length === 0
      ? "Queue mutation validated under supervised safety gates."
      : "Queue mutation blocked due to safety gate failure.",
  );
  if (graceStabilization) {
    reasoning.push("Mutation freshness grace active: guarded continuity preserved during active playback.");
    reasoning.push("Grace scope limited to transient stale telemetry sensitivity only.");
    reasoning.push("Bounded mutation freshness grace activated during verification continuity.");
  }
  if (authContinuity.ok) {
    reasoning.push("Auth healthy for supervised queue mutation validation.");
  } else {
    reasoning.push("Execution blocked due to auth expiry.");
    reasoning.push(...authContinuity.state.authRecoveryReasoning.slice(-3));
  }
  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    reasoning,
    playback,
    heartbeat,
    freshnessScore,
    graceStabilization,
    transportMutationSafety: computeMutationSafety({
      readinessScore: params.evaluation.executionReadinessScore,
      transportStability: params.evaluation.transportStability,
      heartbeatContinuity: heartbeat.heartbeatContinuityScore,
      freshnessScore,
      blockersCount: blockers.length,
    }),
    authContinuityState: authContinuity.state,
  };
}

function toExecutionSafety(evaluation: TransitionEvaluationResult): PlaybackExecutionState["executionSafety"] {
  if (evaluation.executionReadiness === "ready" && evaluation.riskLevel !== "high") return "safe";
  if (evaluation.executionReadiness === "guarded" || evaluation.riskLevel === "high") return "high_risk";
  return "guarded";
}

const PREPARATION_VERIFICATION_MAX_RETRIES = 2;
const PREPARATION_VERIFICATION_RETRY_DELAY_MS = 800;

function applyMutationLifecycleTransition(
  session: ExecutionSession,
  nextState: TransportMutationState,
  reason: string,
  patch?: Omit<MutationLifecycleTransitionRequest, "nextState" | "reason">,
) {
  const fromState = session.lifecycle.state;
  if (!canTransitionMutationLifecycle(fromState, nextState)) {
    throw new Error(
      `Invalid lifecycle transition: ${fromState} -> ${nextState}. Rollback verification metadata must not skip lifecycle gates.`,
    );
  }
  session.lifecycle = transitionMutationLifecycle(
    session.lifecycle,
    {
      nextState,
      reason,
      ...patch,
    },
    Date.now(),
  );
  session.state.mutationLifecycle = session.lifecycle;
  session.state.mutationState = mapLifecycleToLegacyMutationState(session.lifecycle.state);
  session.state.mutationStateChangedAt = session.lifecycle.stateUpdatedAt;
}

async function stabilizeTransportMutationPreparation(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  validation: Awaited<ReturnType<typeof validateQueueMutation>>;
}) {
  const session = executionStore.get(params.userId);
  if (!session) {
    return {
      blockers: ["no_prepared_session"] as string[],
      warnings: [] as string[],
      rollbackSafe: false,
    };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  let stage: RollbackVerificationStage = "snapshot_created";
  console.log("[ROLLBACK] snapshot created");

  const syncState = normalizeTransportSyncState(params.validation.playback.queueStatus?.syncStatus);
  const expectedDeviceId = params.validation.playback.activeDevice?.id;
  const playbackContinuityScore = round(
    clamp(
      (params.validation.playback.playbackState ? 72 : 34) +
        params.validation.heartbeat.heartbeatContinuityScore * 0.28,
      0,
      100,
    ),
  );

  session.state = {
    ...session.state,
    rollbackVerificationStage: stage,
    rollbackReconciliationState: "pending",
    queueVerificationResult: "Bounded preparation verification in progress.",
    rollbackIntegrityReasoning: ["Rollback snapshot captured; stabilization pass started."],
    verificationFinalized: false,
    stabilizationCompleted: false,
    rollbackRecomputeStatus: "pending",
  };

  const lifecycleMutable = session.lifecycle.state !== "failed" && session.lifecycle.state !== "rollback_complete";
  if (lifecycleMutable && session.lifecycle.state === "preparing") {
    applyMutationLifecycleTransition(
      session,
      "validating",
      "Entering bounded rollback verification during preparation (transport_prepare).",
      {
        verificationState: "not_started",
        transportSyncState: syncState,
        heartbeatHealth: params.validation.heartbeat.heartbeatContinuityScore,
        freshnessAgeMs: Math.max(
          params.validation.heartbeat.playbackAgeMs,
          params.validation.heartbeat.deviceAgeMs,
          params.validation.heartbeat.queueAgeMs,
        ),
      },
    );
  }

  let queueSnapshot = await getSpotifyQueueState(params.userId);
  let preparationVerification = evaluatePreparationMutationVerification({
    snapshotComplete: false,
    queueReadable: Boolean(queueSnapshot),
    playbackReconciled: false,
    transportSyncState: syncState,
    heartbeatContinuity: params.validation.heartbeat.heartbeatContinuityScore,
    queueFreshnessScore: params.validation.freshnessScore,
    transportMutationSafety: session.state.transportMutationSafety ?? 0,
    playbackContinuityScore,
  });
  let normalizedRollback = evaluateNormalizedRollbackStability({
    userId: params.userId,
    session,
    verificationPassed: false,
    playbackStable: false,
    syncHealthy: syncState === "synced",
    transportConsistencyScore: params.evaluation.transportStability,
  });

  for (let attempt = 0; attempt <= PREPARATION_VERIFICATION_MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      console.log("[ROLLBACK] retry queue verification", { attempt });
      await new Promise((resolve) => setTimeout(resolve, PREPARATION_VERIFICATION_RETRY_DELAY_MS));
      touchMutationHeartbeat(params.userId);
      queueSnapshot = await getSpotifyQueueState(params.userId);
    }

    const snapshotComplete = Boolean(
      session.rollbackSnapshot?.currentTrackUri &&
        session.rollbackSnapshot?.queueHeadUri &&
        session.rollbackSnapshot.playbackPositionMs !== null,
    );
    if (!snapshotComplete) {
      blockers.push("rollback_snapshot_incomplete");
      stage = "rollback_blocked";
      session.state.rollbackVerificationStage = stage;
      break;
    }

    stage = "continuity_verified";
    console.log("[ROLLBACK] verifying queue continuity");
    const queueReadable = Boolean(queueSnapshot);
    const queueTracks: Array<{ uri: string }> = [];
    for (const track of queueSnapshot?.queue ?? []) {
      if (track.uri) queueTracks.push({ uri: track.uri });
    }

    const playbackReconciled = Boolean(
      params.validation.playback.playbackState &&
        params.validation.playback.activeDevice &&
        !params.validation.playback.activeDevice.is_restricted &&
        (expectedDeviceId ? params.validation.playback.activeDevice.id === expectedDeviceId : true),
    );
    stage = "playback_reconciled";
    console.log("[ROLLBACK] validating playback reconciliation");
    session.state.rollbackReconciliationState = playbackReconciled ? "reconciled" : "degraded";

    const graceSnapshot = computeFreshnessGraceSnapshot({
      userId: params.userId,
      session,
      baseConfidence: params.validation.freshnessScore,
      graceAllowed: params.validation.graceStabilization,
      propagationDelayMs: params.validation.heartbeat.queueAgeMs,
    });
    if (graceSnapshot.grace.graceActive) {
      warnings.push("queue_freshness_grace_active");
    }
    if (graceSnapshot.grace.graceFailure) {
      blockers.push("freshness_grace_expired");
    }

    preparationVerification = evaluatePreparationMutationVerification({
      snapshotComplete,
      queueReadable,
      playbackReconciled,
      transportSyncState: syncState,
      heartbeatContinuity: params.validation.heartbeat.heartbeatContinuityScore,
      queueFreshnessScore: params.validation.freshnessScore,
      transportMutationSafety: session.state.transportMutationSafety ?? 0,
      playbackContinuityScore: playbackReconciled ? playbackContinuityScore : Math.max(0, playbackContinuityScore - 20),
    });

    const targetTrackUri = session.state.targetTrackUri;
    const normalizedQueueVerification = evaluateQueueVerification({
      now: Date.now(),
      mutationId: session.lifecycle.mutationId,
      orchestrationId: session.lifecycle.orchestrationId,
      expectedTrackUri: targetTrackUri ?? "spotify:track:pending",
      expectedInsertionIndex: null,
      queueBefore: queueTracks,
      queueAfter: queueTracks,
      playbackContinuityScore: playbackReconciled ? playbackContinuityScore : 40,
      playbackDeviceUnchanged: playbackReconciled,
      transportSyncState: syncState,
    });

    stage = preparationVerification.passed ? "mutation_verified" : "rollback_blocked";
    session.state.rollbackVerificationStage = stage;

    const verificationPassed = preparationVerification.passed && !graceSnapshot.grace.graceFailure;
    normalizedRollback = evaluateNormalizedRollbackStability({
      userId: params.userId,
      session,
      verificationPassed,
      playbackStable: playbackReconciled,
      syncHealthy: syncState === "synced" && params.evaluation.deviceSynchronizationConfidence >= 55,
      transportConsistencyScore: params.evaluation.transportStability,
    });

    const rollbackRecovery = computeRollbackIntegrityRecovery({
      baseIntegrity: normalizedRollback.mergedRollbackIntegrity,
      mutationState: "validating",
      mutationContinuity: session.state.mutationContinuity ?? 0,
      heartbeatContinuity: params.validation.heartbeat.heartbeatContinuityScore,
      queueFreshness: params.validation.freshnessScore,
      deviceHealthy: playbackReconciled,
      transportHealthy: syncState !== "desynced",
      verificationPassed,
      mutationStateChangedAt: Date.now(),
    });

    const continuityTrust = round(
      clamp(
        preparationVerification.verificationConfidence * 0.4 +
          normalizedRollback.mergedRollbackIntegrity * 0.35 +
          params.validation.heartbeat.heartbeatContinuityScore * 0.15 +
          (graceSnapshot.grace.graceActive ? graceSnapshot.grace.degradedConfidence * 0.1 : params.validation.freshnessScore * 0.1),
        0,
        100,
      ),
    );

    session.state = {
      ...session.state,
      rollbackVerificationStage: stage,
      continuityTrustScore: continuityTrust,
      mutationVerificationConfidence: preparationVerification.verificationConfidence,
      verificationConfidence: preparationVerification.verificationConfidence,
      mutationVerification: {
        timestamp: Date.now(),
        mutationId: session.lifecycle.mutationId,
        orchestrationId: session.lifecycle.orchestrationId,
        verificationState: verificationPassed ? "precheck_passed" : "precheck_failed",
        expectedInsertionIndex: null,
        actualInsertionIndex: normalizedQueueVerification.actualInsertionIndex,
        queueContinuity: normalizedQueueVerification.queueContinuity,
        duplicateCorruption: normalizedQueueVerification.duplicateCorruption,
        truncationDetection: normalizedQueueVerification.truncationDetection,
        playbackContinuity: normalizedQueueVerification.playbackContinuity,
        transportSynchronization: normalizedQueueVerification.transportSynchronization,
        verificationScore: preparationVerification.verificationScore,
        verificationConfidence: preparationVerification.verificationConfidence,
        passed: verificationPassed,
        retriable: !verificationPassed && normalizedQueueVerification.retriable,
        instabilityDetected: !verificationPassed,
        reasons: preparationVerification.reasons,
      },
      queueVerificationPassed: verificationPassed,
      queueVerificationResult: verificationPassed
        ? "Preparation queue verification finalized under bounded stabilization."
        : "Preparation queue verification incomplete; bounded retry allowed.",
      rollbackIntegrity: rollbackRecovery.rollbackIntegrity,
      rollbackIntegrityScore: normalizedRollback.normalized.rollbackIntegrityScore,
      rollbackConfidence: normalizedRollback.rollbackConfidence,
      rollbackAllowed: normalizedRollback.rollbackAllowed,
      rollbackBlockers: [...normalizedRollback.rollbackBlockers],
      restorationFeasibility: normalizedRollback.restorationFeasibility,
      rollbackStability: normalizedRollback.normalized,
      rollbackIntegrityReasoning: [
        ...normalizedRollback.rollbackReasoning,
        ...describeRollbackIntegrity({
          rollbackSnapshot: session.rollbackSnapshot,
          verificationPassed,
          playbackStable: playbackReconciled,
          syncHealthy: syncState === "synced",
        }),
        ...preparationVerification.reasons,
      ],
      rollbackIntegrityContributors: [
        `snapshot:${snapshotComplete ? "complete" : "incomplete"}`,
        `reconciliation:${playbackReconciled ? "ok" : "degraded"}`,
        `sync:${syncState}`,
        `grace:${graceSnapshot.grace.state}`,
      ],
      verificationFinalized: false,
      stabilizationCompleted: false,
      rollbackRecomputeStatus: "pending",
      verificationGraceActive: rollbackRecovery.verificationGraceActive,
      rollbackPreservationState: rollbackRecovery.rollbackPreservationActive ? "active" : "inactive",
      verificationReasons: [...preparationVerification.reasons],
      verificationStabilizationSummary: [
        `Stage ${stage} at attempt ${attempt + 1}.`,
        `Integrity ${rollbackRecovery.rollbackIntegrity.toFixed(2)}; confidence ${preparationVerification.verificationConfidence.toFixed(2)}.`,
      ],
      latestVerificationResult: {
        verificationPassed,
        verificationConfidence: preparationVerification.verificationConfidence,
        queueVerified: queueReadable,
        targetUriDetected: Boolean(
          targetTrackUri && queueSnapshot?.queue?.some((track) => track.uri === targetTrackUri),
        ),
        transportHealthy: syncState === "synced",
        rollbackSnapshotHealthy: snapshotComplete,
        verificationReasoning: [...preparationVerification.reasons],
      },
    };

    if (
      verificationPassed &&
      rollbackRecovery.rollbackIntegrity >= PREPARATION_INTEGRITY_THRESHOLD &&
      continuityTrust >= PREPARATION_ROLLBACK_READINESS_THRESHOLD
    ) {
      stage = "rollback_safe";
      console.log("[ROLLBACK] integrity score", rollbackRecovery.rollbackIntegrity);
      console.log("[ROLLBACK] verification confidence", preparationVerification.verificationConfidence);
      session.state.rollbackVerificationStage = stage;
      session.state.rollbackVerificationBlockers = [];
      break;
    }

    if (attempt < PREPARATION_VERIFICATION_MAX_RETRIES) {
      warnings.push("preparation_verification_retry_scheduled");
      continue;
    }

    stage = "rollback_blocked";
    session.state.rollbackVerificationStage = stage;
    if (rollbackRecovery.rollbackIntegrity < PREPARATION_INTEGRITY_THRESHOLD) {
      blockers.push("rollback_integrity_low");
    }
    if (preparationVerification.verificationConfidence < PREPARATION_VERIFICATION_CONFIDENCE_THRESHOLD) {
      blockers.push("verification_confidence_low");
    }
    if (!playbackReconciled) blockers.push("playback_reconciliation_incomplete");
    if (!snapshotComplete) blockers.push("rollback_snapshot_incomplete");
    session.state.rollbackVerificationBlockers = blockers;
  }

  const rollbackSafe = stage === "rollback_safe";
  const lifecyclePatch = {
    rollbackReadiness: session.state.rollbackIntegrity ?? 0,
    heartbeatHealth: params.validation.heartbeat.heartbeatContinuityScore,
    freshnessAgeMs: Math.max(
      params.validation.heartbeat.playbackAgeMs,
      params.validation.heartbeat.deviceAgeMs,
      params.validation.heartbeat.queueAgeMs,
    ),
    transportSyncState: syncState,
  };

  if (!lifecycleMutable) {
    session.state.rollbackVerificationStage = stage;
    session.state.verificationFinalized = false;
    session.state.stabilizationCompleted = false;
  } else if (rollbackSafe && session.lifecycle.state === "validating") {
    touchMutationHeartbeat(params.userId);
    applyMutationLifecycleTransition(
      session,
      "rollback_ready",
      "Preparation stabilization finalized; rollback snapshot verified (rollback_safe).",
      {
        ...lifecyclePatch,
        verificationState: "precheck_passed",
      },
    );
    const rollbackSafeCoordination = coordinateTelemetryFreshness(session.state, {
      playbackAgeMs: params.validation.heartbeat.playbackAgeMs,
      deviceAgeMs: params.validation.heartbeat.deviceAgeMs,
      queueAgeMs: params.validation.heartbeat.queueAgeMs,
    });
    const inheritanceChain = inheritFreshnessAcrossMutationLifecycle({
      stabilizationSource: "rollback_ready",
      sessionId: session.state.mutationSessionId,
      verificationConfidence: session.state.verificationConfidence,
      rollbackIntegrity: session.state.rollbackIntegrity,
      coordination: rollbackSafeCoordination,
      previousChain: session.state.freshnessInheritanceChain,
    });
    publishExecutionTelemetry(session, "rollback_safe", {
      verificationFinalized: true,
      stabilizationCompleted: true,
      rollbackRecomputeStatus: "completed",
      queueVerificationResult:
        "Preparation verification finalized; lifecycle reached rollback_ready.",
      rollbackVerificationStage: "rollback_safe",
      freshnessRecoveryState: "stable",
      graceStabilizationActive: true,
      rollbackFreshnessInheritedAt: new Date().toISOString(),
      freshnessInheritanceChain: inheritanceChain,
      globalConvergenceState: "stable",
    });
    console.log("[FRESHNESS] inherited rollback stabilization freshness");
  } else if (blockers.length > 0) {
    if (session.lifecycle.state === "validating" && canTransitionMutationLifecycle("validating", "degraded")) {
      applyMutationLifecycleTransition(
        session,
        "degraded",
        "Preparation stabilization completed with guarded degradation.",
        {
          ...lifecyclePatch,
          verificationState: "precheck_failed",
        },
      );
    } else if (session.lifecycle.state === "preparing" && canTransitionMutationLifecycle("preparing", "failed")) {
      applyMutationLifecycleTransition(session, "failed", "Preparation stabilization failed before validation gate.", {
        ...lifecyclePatch,
        verificationState: "precheck_failed",
      });
    } else if (session.lifecycle.state === "validating" && canTransitionMutationLifecycle("validating", "failed")) {
      applyMutationLifecycleTransition(session, "failed", "Preparation stabilization failed verification gate.", {
        ...lifecyclePatch,
        verificationState: "precheck_failed",
      });
    }
    session.state.verificationFinalized = false;
    session.state.stabilizationCompleted = false;
    session.state.rollbackRecomputeStatus = "pending";
  } else if (session.lifecycle.state === "validating") {
    session.state.verificationFinalized = false;
    session.state.stabilizationCompleted = false;
    session.state.queueVerificationResult = "Preparation verification in progress; lifecycle remains validating.";
  }
  session.mutationAuditTrail = appendMutationAuditEntry(session.mutationAuditTrail, {
    mutationId: session.lifecycle.mutationId,
    orchestrationId: session.lifecycle.orchestrationId,
    lifecycleState: session.lifecycle.state,
    executionPhase: "stabilize",
    confidenceValue: session.state.verificationConfidence ?? 0,
    confidenceDelta: (session.state.verificationConfidence ?? 0) - (session.state.executionConfidence ?? 0),
    degradationReasons: blockers,
    queueSnapshotHash: session.lifecycle.queueSnapshotHash,
    rollbackReadiness: session.lifecycle.rollbackReadiness,
    heartbeatDiagnostics: {
      heartbeatStatus: session.state.heartbeatStatus ?? "degraded",
      mutationHealthScore: session.state.mutationHealthScore ?? 0,
      mutationDriftScore: session.state.mutationDriftScore ?? 0,
      transportFreshnessScore: session.state.transportFreshnessScore ?? 0,
    },
    verificationOutcome: {
      verificationState: session.lifecycle.verificationState,
      verificationScore: session.state.mutationVerification?.verificationScore ?? 0,
      passed: rollbackSafe,
    },
    runtimeWarnings: warnings,
    transitionDiagnostics: session.state.rollbackIntegrityReasoning ?? [],
  });
  session.state.mutationAuditTrail = session.mutationAuditTrail;

  return { blockers, warnings, rollbackSafe };
}

export async function prepareTrackQueue(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
}) {
  console.log("[SYNC] prepareTrackQueue start", { userId: params.userId });
  const mutationStartedAt = Date.now();
  const mutationHeartbeatAt = updateMutationHeartbeat({ userId: params.userId, phase: "preparing" });
  console.log("[SYNC] validating transport auth and queue mutation gates");
  const validation = await validateQueueMutation({
    userId: params.userId,
    evaluation: params.evaluation,
  });
  console.log("[SYNC] fetching queue snapshot", {
    allowed: validation.allowed,
    blockers: validation.blockers,
    hasActiveDevice: Boolean(validation.playback.activeDevice),
    authOk: validation.authContinuityState.transportAuthState === "healthy",
  });
  const queueState = await getSpotifyQueueState(params.userId);
  const targetTrackId = params.evaluation.executionPlan.targetTrackId;
  const targetTrackUri = targetTrackId ? `spotify:track:${targetTrackId}` : undefined;
  const queueAlreadyPrepared = Boolean(
    targetTrackUri && queueState?.queue?.some((track) => track.uri === targetTrackUri),
  );
  if (queueAlreadyPrepared) {
    validation.warnings.push("duplicate_queue_mutation_prevented");
  }
  const preparationConfidence = Number(
    clamp(
      params.evaluation.executionReadinessScore * 0.55 +
        params.evaluation.transportStability * 0.25 +
        params.evaluation.heartbeatContinuity * 0.2 -
        validation.blockers.length * 8,
      0,
      100,
    ).toFixed(2),
  );
  const executionState: PlaybackExecutionState = {
    executionId: randomExecutionId(),
    executionStatus: validation.allowed ? "preparing" : "aborted",
    targetTrackUri,
    targetTrackName: params.evaluation.executionPlan.targetTrackLabel ?? undefined,
    preparationConfidence,
    executionConfidence: Number(clamp(params.evaluation.confidence.score * 0.8, 0, 100).toFixed(2)),
    rollbackAvailable: Boolean(queueState?.currentlyPlaying?.uri),
    executionStartedAt: Date.now(),
    executionReasoning: [
      ...validation.reasoning,
      queueAlreadyPrepared
        ? "Queue already contains prepared target; duplicate mutation prevented."
        : "Queue preparation staged successfully.",
    ],
    executionSafety: toExecutionSafety(params.evaluation),
    operatorApprovalRequired: shouldRequireApproval(params.evaluation),
    mutationSessionId: randomExecutionId(),
    mutationStartedAt,
    mutationHeartbeatAt,
    telemetryVersion: 0,
    telemetryUpdatedAt: mutationStartedAt,
    verificationSequence: 0,
    mutationState: validation.allowed ? "preparing" : "failed",
    mutationContinuity: computeMutationContinuity({
      freshnessScore: validation.freshnessScore,
      transportStability: params.evaluation.transportStability,
      heartbeatContinuity: validation.heartbeat.heartbeatContinuityScore,
      mutationFailures: 0,
    }),
    mutationVerificationConfidence: 0,
    queueMutationFreshness: validation.freshnessScore,
    rollbackIntegrity: 0,
    transportMutationSafety: validation.transportMutationSafety,
    queueVerificationPassed: false,
    queueVerificationResult: "Queue mutation verification pending.",
    mutationAttemptCount: 0,
    retryBoundReached: false,
    mutationStateChangedAt: mutationStartedAt,
    rollbackIntegrityReasoning: [],
    latestVerificationResult: undefined,
    mutationTimeline: [
      {
        timestamp: mutationStartedAt,
        state: "preparing",
        reasoning: "Beginning guarded mutation preparation.",
      },
    ],
    transportAuthState: "healthy",
    tokenRefreshStatus: "not_needed",
    verificationFinalized: false,
    stabilizationCompleted: false,
    rollbackRecomputeStatus: "pending",
    recommendationFreshnessState:
      validation.heartbeat.queueFreshness === "healthy" || validation.heartbeat.queueFreshness === "aging"
        ? "healthy"
        : validation.heartbeat.queueFreshness,
    accessTokenExpiresAt: validation.authContinuityState.accessTokenExpiresAt,
    lastSuccessfulRefreshAt: validation.authContinuityState.lastSuccessfulRefreshAt,
    refreshFailureCount: validation.authContinuityState.refreshFailureCount,
    authRecoveryReasoning: validation.authContinuityState.authRecoveryReasoning.slice(-6),
    verificationContinuity: 0,
    verificationFreshnessConfidence: 0,
    verificationTransportLatency: 0,
    verificationHeartbeatContinuity: 0,
    verificationMutationConsistency: 0,
    verificationWindowIntegrity: 0,
    verificationSnapshotReliability: 0,
    verificationRecoveryConfidence: 0,
    verificationStabilizationConfidence: 0,
    verificationFailurePressure: 0,
    verificationContinuityHistory: [],
    verificationLatencyHistory: [],
    verificationFreshnessHistory: [],
    verificationIntegrityHistory: [],
    verificationStabilizationSummary: [],
    mutationAuditTrail: [],
    executionDegradationReasons: validation.blockers,
    mutationVerification: undefined,
    verificationConfidence: 0,
    verificationReasons: [],
    instabilityDetected: false,
    retriableVerificationFailure: false,
    rollbackConfidence: 0,
    rollbackIntegrityScore: 0,
    rollbackBlockers: [],
    restorationFeasibility: 0,
    rollbackAllowed: false,
    mutationHeartbeat: undefined,
    mutationHealthScore: 0,
    mutationDriftScore: 0,
    transportFreshnessScore: 0,
    heartbeatStatus: "degraded",
    freshnessGrace: undefined,
    graceState: "inactive",
    graceFailure: false,
    graceConfidencePenalty: 0,
    graceReasons: [],
  };
  const rollbackSnapshot: QueueRollbackSnapshot = {
    currentTrackUri: queueState?.currentlyPlaying?.uri ?? null,
    queueHeadUri: queueState?.queue?.[0]?.uri ?? null,
    playbackPositionMs: validation.playback.playbackState?.progressMs ?? null,
    snapshotHash: computeRollbackSnapshotHash({
      currentTrackUri: queueState?.currentlyPlaying?.uri ?? null,
      queueHeadUri: queueState?.queue?.[0]?.uri ?? null,
      playbackPositionMs: validation.playback.playbackState?.progressMs ?? null,
    }),
    snapshotCreatedAt: Date.now(),
    ownerUserId: params.userId,
  };
  console.log("[SYNC] rollback snapshot created", {
    snapshotHash: rollbackSnapshot.snapshotHash,
    hasCurrentTrack: Boolean(rollbackSnapshot.currentTrackUri),
    queueHeadPresent: Boolean(rollbackSnapshot.queueHeadUri),
  });
  const lifecycle = createMutationLifecycle({
    mutationId: executionState.mutationSessionId ?? randomExecutionId(),
    orchestrationId: executionState.executionId,
    queueSnapshotHash: targetTrackUri ?? "none",
    now: mutationStartedAt,
    initialTransportSyncState: normalizeTransportSyncState(validation.playback.queueStatus?.syncStatus),
  });
  const seededLifecycle = transitionMutationLifecycle(
    lifecycle,
    {
      nextState: validation.allowed ? "preparing" : "failed",
      reason: validation.allowed
        ? "Beginning guarded mutation preparation."
        : "Queue mutation blocked due to safety gate failure.",
      rollbackReadiness: executionState.rollbackIntegrity ?? 0,
      freshnessAgeMs: Math.max(
        validation.heartbeat.playbackAgeMs,
        validation.heartbeat.deviceAgeMs,
        validation.heartbeat.queueAgeMs,
      ),
      heartbeatHealth: validation.heartbeat.heartbeatContinuityScore,
    },
    mutationStartedAt,
  );
  executionState.mutationLifecycle = seededLifecycle;
  executionState.mutationState = mapLifecycleToLegacyMutationState(seededLifecycle.state);
  executionState.mutationStateChangedAt = seededLifecycle.stateUpdatedAt;
  const initialAudit = appendMutationAuditEntry([], {
    mutationId: seededLifecycle.mutationId,
    orchestrationId: seededLifecycle.orchestrationId,
    lifecycleState: seededLifecycle.state,
    executionPhase: "prepare",
    confidenceValue: executionState.executionConfidence,
    confidenceDelta: 0,
    degradationReasons: executionState.executionDegradationReasons ?? [],
    queueSnapshotHash: seededLifecycle.queueSnapshotHash,
    rollbackReadiness: seededLifecycle.rollbackReadiness,
    heartbeatDiagnostics: {
      heartbeatStatus: "degraded",
      mutationHealthScore: 0,
      mutationDriftScore: 0,
      transportFreshnessScore: executionState.queueMutationFreshness ?? 0,
    },
    verificationOutcome: {
      verificationState: seededLifecycle.verificationState,
      verificationScore: 0,
      passed: false,
    },
    runtimeWarnings: validation.warnings,
    transitionDiagnostics: validation.reasoning,
    timestamp: mutationStartedAt,
  });
  executionState.mutationAuditTrail = initialAudit;

  executionStore.set(params.userId, {
    state: executionState,
    rollbackSnapshot,
    preparedAt: Date.now(),
    approved: false,
    mutationFailures: 0,
    mutationAttemptCount: 0,
    lifecycle: seededLifecycle,
    mutationAuditTrail: initialAudit,
    graceStartedAt: validation.graceStabilization ? Date.now() : null,
  });

  const stabilization = await stabilizeTransportMutationPreparation({
    userId: params.userId,
    evaluation: params.evaluation,
    validation,
  });

  const session = executionStore.get(params.userId);
  let mergedBlockers = [...validation.blockers, ...stabilization.blockers];
  const mergedWarnings = [...validation.warnings, ...stabilization.warnings];
  if (stabilization.rollbackSafe) {
    mergedBlockers = mergedBlockers.filter((blocker) => blocker !== "rollback_readiness_low");
    if (session && session.state.executionStatus === "aborted" && mergedBlockers.length === 0) {
      session.state = {
        ...session.state,
        executionStatus: "preparing",
        mutationState: mapLifecycleToLegacyMutationState(session.lifecycle.state),
        executionDegradationReasons: [],
        executionReasoning: [
          ...session.state.executionReasoning,
          "Preparation stabilization cleared rollback readiness gate.",
        ],
      };
    }
  } else if (session) {
    session.state = {
      ...session.state,
      executionDegradationReasons: [...new Set([...(session.state.executionDegradationReasons ?? []), ...mergedBlockers])],
    };
  }

  touchMutationHeartbeat(params.userId);
  const preparedState = getPlaybackExecutionState(params.userId);
  console.log("[TELEMETRY] state refresh received", {
    telemetryVersion: preparedState.telemetryVersion,
    telemetryUpdatedAt: preparedState.telemetryUpdatedAt,
    verificationSequence: preparedState.verificationSequence,
    rollbackIntegrity: preparedState.rollbackIntegrity,
    verificationConfidence: preparedState.verificationConfidence,
    verificationFinalized: preparedState.verificationFinalized,
  });
  console.log("[SYNC] execution state updated", {
    lifecycleState: preparedState.mutationLifecycle?.state ?? "pending",
    transportIntegrityScore: preparedState.transportIntegrityScore ?? 0,
    rollbackAvailable: preparedState.rollbackAvailable,
    rollbackIntegrity: preparedState.rollbackIntegrity,
    verificationConfidence: preparedState.verificationConfidence,
    rollbackVerificationStage: preparedState.rollbackVerificationStage,
    executionStatus: preparedState.executionStatus,
  });
  console.log("[SYNC] completed successfully", { allowed: mergedBlockers.length === 0 });
  return {
    state: preparedState,
    blockers: mergedBlockers,
    warnings: mergedWarnings,
  };
}

function refreshQueuePreparationTelemetry(session: ExecutionSession, userId: string) {
  propagateTransportFreshnessSynchronization({ userId, session, phase: "prepare_queue" });
}

export function propagateTransportFreshnessSynchronization(params: {
  userId: string;
  session?: ExecutionSession;
  phase: "prepare_window" | "prepare_queue" | "rollback_safe";
}) {
  const session = params.session ?? executionStore.get(params.userId);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  refreshPlaybackHeartbeat(params.userId);
  refreshDeviceHeartbeat(params.userId);
  refreshQueueHeartbeat(params.userId);

  if (session) {
    const queueCoordination = coordinateTelemetryFreshness(session.state, {
      playbackAgeMs: 4_000,
      deviceAgeMs: 4_000,
      queueAgeMs: 4_000,
    });
    session.state.freshnessInheritanceChain = inheritFreshnessAcrossMutationLifecycle({
      stabilizationSource: params.phase === "prepare_queue" ? "queue_prepared" : "prepare_window",
      sessionId: session.state.mutationSessionId,
      verificationConfidence: session.state.verificationConfidence ?? 72,
      rollbackIntegrity: session.state.rollbackIntegrity ?? session.state.rollbackIntegrityScore ?? 70,
      coordination: queueCoordination,
      previousChain: session.state.freshnessInheritanceChain,
    });
    publishExecutionTelemetry(session, `${params.phase}_freshness_propagation`, {
      queuePreparationHeartbeatAt:
        params.phase === "prepare_queue" ? nowIso : session.state.queuePreparationHeartbeatAt,
      freshnessPropagationAt: nowIso,
      lastSynchronizationRecoveryAt: nowIso,
      freshnessRecoveryState: "recovering",
      graceStabilizationActive: queueCoordination.freshness === "grace_window",
    });
    executionStore.set(params.userId, session);
  }

  console.log("[FRESHNESS] telemetry propagation refreshed", { phase: params.phase });
  if (params.phase === "prepare_queue") {
    console.log("[FRESHNESS] queue preparation inherited synchronization");
  }
}

export async function queuePreparedTrack(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  refinementContext?: {
    selectedCandidate?: AdaptiveOrchestrationCandidate | null;
    convergenceMetrics?: OrchestrationConvergenceMetrics | null;
  };
}) {
  const session = executionStore.get(params.userId);
  if (!session) {
    return {
      ok: false,
      state: getPlaybackExecutionState(params.userId),
      message: "No prepared execution found.",
    };
  }
  session.mutationAttemptCount += 1;
  if (session.mutationAttemptCount > 1) {
    transitionMutationState({
      userId: params.userId,
      session,
      state: "failed",
      reasoning: "Retry bound reached: supervised execution allows one mutation attempt only.",
      executionPhase: "retry_guard",
      confidenceDelta: -8,
      degradationReasons: ["retry_bound_reached"],
    });
    session.state = {
      ...session.state,
      executionStatus: "aborted",
      retryBoundReached: true,
      mutationAttemptCount: session.mutationAttemptCount,
      executionCompletedAt: Date.now(),
    };
    executionStore.set(params.userId, session);
    return {
      ok: false,
      state: getPlaybackExecutionState(params.userId),
      message: "Retry bound reached.",
    };
  }

  const validation = await validateQueueMutation({
    userId: params.userId,
    evaluation: params.evaluation,
  });
  const preMutationQueueState = await getSpotifyQueueState(params.userId);
  const preMutationQueue =
    preMutationQueueState?.queue
      ?.map((track) => ({ uri: track.uri }))
      .filter((track): track is { uri: string } => typeof track.uri === "string" && track.uri.length > 0) ?? [];
  const expectedInsertionIndex = preMutationQueue.length;
  const expectedDeviceId = validation.playback.activeDevice?.id ?? null;
  if (validation.allowed) {
    refreshQueuePreparationTelemetry(session, params.userId);
    const queueCoordination = coordinateTelemetryFreshness(session.state, {
      playbackAgeMs: validation.heartbeat.playbackAgeMs,
      deviceAgeMs: validation.heartbeat.deviceAgeMs,
      queueAgeMs: validation.heartbeat.queueAgeMs,
    });
    session.state.freshnessInheritanceChain = inheritFreshnessAcrossMutationLifecycle({
      stabilizationSource: "queue_prepared",
      sessionId: session.state.mutationSessionId,
      verificationConfidence: session.state.verificationConfidence,
      rollbackIntegrity: session.state.rollbackIntegrity,
      coordination: queueCoordination,
      previousChain: session.state.freshnessInheritanceChain,
    });
    publishExecutionTelemetry(session, "queue_prepared_inheritance");
  }

  if (!validation.allowed) {
    session.mutationFailures += 1;
    transitionMutationState({
      userId: params.userId,
      session,
      state: "degraded",
      reasoning: "Playback mutation blocked due to stale telemetry or transport safety violations.",
      executionPhase: "validation_gate",
      confidenceDelta: -6,
      degradationReasons: validation.blockers,
      runtimeWarnings: validation.warnings,
      transitionDiagnostics: validation.reasoning,
      transportSyncState: normalizeTransportSyncState(validation.playback.queueStatus?.syncStatus),
      heartbeatHealth: validation.heartbeat.heartbeatContinuityScore,
    });
    transitionMutationState({
      userId: params.userId,
      session,
      state: "failed",
      reasoning: "Why mutation safety blocked execution: transport or freshness gates failed.",
      executionPhase: "validation_gate",
      confidenceDelta: -4,
      degradationReasons: validation.blockers,
      runtimeWarnings: validation.warnings,
      transitionDiagnostics: validation.reasoning,
    });
    session.state = {
      ...session.state,
      executionStatus: "aborted",
      mutationContinuity: computeMutationContinuity({
        freshnessScore: validation.freshnessScore,
        transportStability: params.evaluation.transportStability,
        heartbeatContinuity: validation.heartbeat.heartbeatContinuityScore,
        mutationFailures: session.mutationFailures,
      }),
      queueMutationFreshness: validation.freshnessScore,
      transportMutationSafety: validation.transportMutationSafety,
      mutationAttemptCount: session.mutationAttemptCount,
      retryBoundReached: false,
      executionCompletedAt: Date.now(),
    };
    executionStore.set(params.userId, session);
    return {
      ok: false,
      state: getPlaybackExecutionState(params.userId),
      message: validation.blockers.join(", "),
    };
  }
  if (session.state.operatorApprovalRequired && !session.approved) {
    transitionMutationState({
      userId: params.userId,
      session,
      state: "validating",
      reasoning: "Execution held awaiting operator approval.",
      executionPhase: "operator_gate",
    });
    session.state = {
      ...session.state,
      executionStatus: "queued",
      mutationAttemptCount: session.mutationAttemptCount,
    };
    executionStore.set(params.userId, session);
    return {
      ok: false,
      state: getPlaybackExecutionState(params.userId),
      message: "Operator approval required before execution.",
    };
  }

  const targetTrackId = params.evaluation.executionPlan.targetTrackId;
  if (!targetTrackId) {
    session.mutationFailures += 1;
    transitionMutationState({
      userId: params.userId,
      session,
      state: "failed",
      reasoning: "No target track available for queue mutation.",
      executionPhase: "target_resolution",
      confidenceDelta: -8,
      degradationReasons: ["missing_target_track"],
    });
    session.state = {
      ...session.state,
      executionStatus: "aborted",
      mutationAttemptCount: session.mutationAttemptCount,
      executionCompletedAt: Date.now(),
    };
    executionStore.set(params.userId, session);
    return { ok: false, state: getPlaybackExecutionState(params.userId), message: "Missing target track." };
  }

  transitionMutationState({
    userId: params.userId,
    session,
    state: "validating",
    reasoning: "Beginning guarded mutation validation.",
    executionPhase: "validation_start",
  });
  session.state = {
    ...session.state,
    executionStatus: "executing",
    mutationAttemptCount: session.mutationAttemptCount,
  };
  executionStore.set(params.userId, session);

  transitionMutationState({
    userId: params.userId,
    session,
    state: "executing",
    reasoning: "Executing supervised queue mutation.",
    executionPhase: "mutation_execute",
  });
  executionStore.set(params.userId, session);

  const guardedResult = await executeGuardedPlaybackCommand({
    userId: params.userId,
    commandType: "queue",
    executionSource: "live_session_sync",
    trackUri: `spotify:track:${targetTrackId}`,
    commandPayload: {
      source: "playback_execution_engine",
      executionId: session.state.executionId,
      readiness: params.evaluation.executionReadiness,
    },
    execute: () => queueAiRecommendedTrack({ userId: params.userId, spotifyTrackId: targetTrackId }),
  });
  if (!guardedResult.ok) {
    session.mutationFailures += 1;
    transitionMutationState({
      userId: params.userId,
      session,
      state: "rollback_ready",
      reasoning: "Queue mutation failed; rollback snapshot captured for safe recovery.",
      executionPhase: "guarded_execution",
      confidenceDelta: -9,
      degradationReasons: ["queue_mutation_guardrail_failure"],
    });
    session.state = {
      ...session.state,
      executionStatus: "rollback",
      mutationContinuity: computeMutationContinuity({
        freshnessScore: validation.freshnessScore,
        transportStability: params.evaluation.transportStability,
        heartbeatContinuity: validation.heartbeat.heartbeatContinuityScore,
        mutationFailures: session.mutationFailures,
      }),
      queueMutationFreshness: validation.freshnessScore,
      transportMutationSafety: validation.transportMutationSafety,
      mutationAttemptCount: session.mutationAttemptCount,
      retryBoundReached: false,
      rollbackIntegrity: computeRollbackIntegrity({
        rollbackSnapshot: session.rollbackSnapshot,
        verificationPassed: false,
        playbackStable: Boolean(validation.playback.playbackState),
        syncHealthy: validation.playback.queueStatus?.syncStatus === "synced",
      }),
      queueVerificationPassed: false,
      queueVerificationResult: "Queue mutation command failed before verification.",
      latestVerificationResult: {
        verificationPassed: false,
        verificationConfidence: 0,
        queueVerified: false,
        targetUriDetected: false,
        transportHealthy: Boolean(validation.playback.activeDevice),
        rollbackSnapshotHealthy: Boolean(session.rollbackSnapshot),
        verificationReasoning: ["Queue mutation command failed before verification."],
      },
      rollbackIntegrityReasoning: describeRollbackIntegrity({
        rollbackSnapshot: session.rollbackSnapshot,
        verificationPassed: false,
        playbackStable: Boolean(validation.playback.playbackState),
        syncHealthy: validation.playback.queueStatus?.syncStatus === "synced",
      }),
      executionReasoning: [
        ...session.state.executionReasoning,
        "Queue mutation failed; rollback snapshot captured for safe recovery.",
        "Why rollback activated: queue mutation guardrail failure.",
      ],
      executionCompletedAt: Date.now(),
    };
    executionStore.set(params.userId, session);
    return {
      ok: false,
      state: getPlaybackExecutionState(params.userId),
      message: guardedResult.message ?? "Queue mutation failed.",
    };
  }

  transitionMutationState({
    userId: params.userId,
    session,
    state: "verifying",
    reasoning: "Verifying queue mutation integrity.",
    executionPhase: "verification_start",
  });
  executionStore.set(params.userId, session);
  const verification = await verifyQueueMutation({
    userId: params.userId,
    targetTrackUri: `spotify:track:${targetTrackId}`,
    rollbackSnapshot: session.rollbackSnapshot,
    preMutationQueue,
    expectedInsertionIndex,
    expectedDeviceId,
  });
  const recommendationFreshnessSync = await refreshRecommendationFreshnessTimestamps({
    userId: params.userId,
    activeDeviceHealthy: Boolean(verification.transportHealthy),
  });
  const verificationPhaseDurationMs = Math.max(
    0,
    Date.now() - (session.state.mutationStateChangedAt ?? session.state.mutationStartedAt ?? Date.now()),
  );
  const finalized = finalizeVerificationStabilization({
    userId: params.userId,
    session,
    evaluation: params.evaluation,
    verification,
    validation,
    verificationPhaseDurationMs,
  });
  const verificationPassed = finalized.verificationPassed;
  const verificationConfidence = finalized.mutationVerificationConfidence;
  const normalizedVerification = finalized.normalizedVerification;
  const verificationReasons = normalizedVerification?.reasons ?? verification.verificationReasoning;
  const instabilityDetected = finalized.verificationInstabilityDetected;
  const retriableVerificationFailure = finalized.retriableVerificationFailure;
  const degradationReasons = finalized.degradationReasons;
  const verificationResult = verification.verificationReasoning.join(" ");
  const rollbackRecovery = finalized.rollbackRecovery;
  const rollbackIntegrity = finalized.rollbackIntegrity;
  const rollbackStability = finalized.rollbackStability;
  const rollbackAllowed = finalized.rollbackAllowed;
  const rollbackBlockers = finalized.rollbackBlockers;
  const verificationStabilization = finalized.verificationStabilization;
  const mutationHeartbeat = finalized.mutationHeartbeat;
  const graceFailure = finalized.graceFailure;
  const rollbackContributors = [
    verification.rollbackSnapshotHealthy ? "rollback_snapshot_exists" : "rollback_snapshot_incomplete",
    verification.targetUriDetected ? "target_uri_detected" : "target_uri_missing",
    verification.transportHealthy ? "transport_healthy" : "transport_unhealthy",
    (session.state.mutationContinuity ?? 0) >= 65 ? "mutation_continuity_healthy" : "mutation_continuity_low",
    validation.heartbeat.heartbeatContinuityScore >= 65 ? "heartbeat_continuity_healthy" : "heartbeat_continuity_low",
    rollbackRecovery.rollbackPreservationActive ? "rollback_preservation_active" : "rollback_preservation_inactive",
  ];

  if (!verificationPassed) {
    session.mutationFailures += 1;
    transitionMutationState({
      userId: params.userId,
      session,
      state: "degraded",
      reasoning: "Queue mutation verification failed; entering degraded recovery lane.",
      executionPhase: "verification_finalize",
      confidenceDelta: -7,
      degradationReasons: [...degradationReasons, ...(graceFailure ? ["freshness_grace_expired"] : [])],
      runtimeWarnings: retriableVerificationFailure ? ["verification_retry_eligible"] : [],
      verificationPassed: false,
      verificationScore: verificationConfidence,
    });
    transitionMutationState({
      userId: params.userId,
      session,
      state: "rollback_ready",
      reasoning: "Queue mutation verification failed; rollback pending.",
      executionPhase: "verification_finalize",
      confidenceDelta: -5,
      degradationReasons: [...degradationReasons, ...(rollbackAllowed ? [] : ["rollback_not_allowed"])],
      runtimeWarnings: retriableVerificationFailure ? ["verification_retry_eligible"] : [],
      verificationPassed: false,
      verificationScore: verificationConfidence,
    });
    session.state = {
      ...session.state,
      executionStatus: "rollback",
      mutationVerificationConfidence: verificationConfidence,
      mutationVerification: normalizedVerification,
      verificationConfidence,
      verificationReasons: verificationReasons.slice(-10),
      instabilityDetected,
      retriableVerificationFailure,
      queueVerificationPassed: false,
      queueVerificationResult: verificationResult,
      latestVerificationResult: verification,
      rollbackIntegrity,
      mutationHeartbeat,
      mutationHealthScore: finalized.mutationHealthScore,
      mutationDriftScore: finalized.mutationDriftScore,
      transportFreshnessScore: finalized.transportFreshnessScore,
      heartbeatStatus: finalized.heartbeatStatus,
      freshnessGrace: finalized.freshnessGrace,
      graceState: finalized.graceState,
      graceFailure,
      graceConfidencePenalty: finalized.graceConfidencePenalty,
      graceReasons: finalized.graceReasons,
      rollbackStability,
      rollbackConfidence: finalized.rollbackConfidence,
      rollbackIntegrityScore: finalized.rollbackIntegrityScore,
      rollbackBlockers,
      restorationFeasibility: finalized.restorationFeasibility,
      rollbackAllowed,
      verificationPhaseDurationMs,
      verificationGraceActive: rollbackRecovery.verificationGraceActive,
      rollbackPreservationState: rollbackRecovery.rollbackPreservationActive ? "active" : "inactive",
      rollbackIntegrityContributors: rollbackContributors,
      transportMutationSafety: finalized.transportMutationSafety,
      transportAuthState: verification.authDegraded
        ? "degraded"
        : verification.tokenRefreshStatus === "refreshed"
          ? "refreshed"
          : "healthy",
      tokenRefreshStatus: verification.tokenRefreshStatus,
      verificationFinalized: true,
      stabilizationCompleted: false,
      rollbackRecomputeStatus: "completed",
      recommendationFreshnessState:
        recommendationFreshnessSync.state === "refreshed" || recommendationFreshnessSync.state === "noop"
          ? "healthy"
          : validation.heartbeat.queueFreshness === "healthy" || validation.heartbeat.queueFreshness === "aging"
          ? "healthy"
          : validation.heartbeat.queueFreshness,
      accessTokenExpiresAt: verification.authContinuity?.accessTokenExpiresAt ?? null,
      lastSuccessfulRefreshAt: verification.authContinuity?.lastSuccessfulRefreshAt ?? null,
      refreshFailureCount: verification.authContinuity?.refreshFailureCount ?? 0,
      authRecoveryReasoning: verification.authContinuity?.authRecoveryReasoning?.slice(-6) ?? [],
      verificationContinuity: verificationStabilization.verificationContinuity,
      verificationFreshnessConfidence: verificationStabilization.verificationFreshnessConfidence,
      verificationTransportLatency: verificationStabilization.verificationTransportLatency,
      verificationHeartbeatContinuity: verificationStabilization.verificationHeartbeatContinuity,
      verificationMutationConsistency: verificationStabilization.verificationMutationConsistency,
      verificationWindowIntegrity: verificationStabilization.verificationWindowIntegrity,
      verificationSnapshotReliability: verificationStabilization.verificationSnapshotReliability,
      verificationRecoveryConfidence: verificationStabilization.verificationRecoveryConfidence,
      verificationStabilizationConfidence: verificationStabilization.verificationStabilizationConfidence,
      verificationFailurePressure: verificationStabilization.verificationFailurePressure,
      verificationContinuityHistory: verificationStabilization.verificationContinuityHistory,
      verificationLatencyHistory: verificationStabilization.verificationLatencyHistory,
      verificationFreshnessHistory: verificationStabilization.verificationFreshnessHistory,
      verificationIntegrityHistory: verificationStabilization.verificationIntegrityHistory,
      verificationStabilizationSummary: verificationStabilization.verificationStabilizationSummary.slice(-6),
      mutationAttemptCount: session.mutationAttemptCount,
      retryBoundReached: false,
      rollbackIntegrityReasoning: describeRollbackIntegrity({
        rollbackSnapshot: session.rollbackSnapshot,
        verificationPassed: false,
        playbackStable: verification.transportHealthy,
        syncHealthy: verification.transportHealthy && params.evaluation.deviceSynchronizationConfidence >= 70,
      }),
      executionReasoning: [
        ...session.state.executionReasoning,
        "Queue mutation verification failed; rollback pending.",
        "Verification finalized with failure.",
        "Rollback integrity recomputed after verification completion.",
        verification.authDegraded
          ? "Verification failed due to auth degradation."
          : "Verification failed due to transport/queue integrity checks.",
        recommendationFreshnessSync.state === "refreshed"
          ? "Recommendation freshness stabilized during active verification."
          : "Recommendation freshness not refreshed during verification.",
        rollbackRecovery.verificationGraceActive
          ? "Verification grace was active but integrity checks still failed."
          : "Verification grace inactive during rollback evaluation.",
        ...verificationStabilization.verificationStabilizationSummary,
        ...(instabilityDetected
          ? ["Verification normalization detected instability; confidence degraded gradually."]
          : []),
        ...(retriableVerificationFailure
          ? ["Verification failure is retriable under supervised constraints."]
          : []),
        ...(!rollbackAllowed
          ? ["Rollback gating blocked execution: rollback integrity/recoverability below deterministic threshold."]
          : []),
        ...(finalized.rollbackReasoning ?? []),
        ...(finalized.heartbeatPenalty > 0
          ? [`Heartbeat instability penalty applied (${finalized.heartbeatPenalty.toFixed(2)}).`]
          : ["Heartbeat remained stable without additional penalty."]),
        ...finalized.heartbeatReasoning,
        ...(finalized.gracePenalty > 0
          ? [`Freshness grace penalty applied (${finalized.gracePenalty.toFixed(2)}).`]
          : ["No freshness grace penalty required."]),
        ...(graceFailure
          ? ["Freshness grace expired; deterministic verification-failure semantics escalated."]
          : []),
        ...finalized.graceReasons,
        ...verification.verificationReasoning,
      ],
      executionCompletedAt: Date.now(),
      executionDegradationReasons: degradationReasons,
    };
    executionStore.set(params.userId, session);
    return {
      ok: false,
      state: getPlaybackExecutionState(params.userId),
      message: "Queue verification failed after mutation.",
    };
  }

  transitionMutationState({
    userId: params.userId,
    session,
    state: "stabilized",
    reasoning: "Stabilization completed.",
    executionPhase: "verification_finalize",
    confidenceDelta: 3,
    verificationPassed: true,
    verificationScore: verificationConfidence,
    degradationReasons: graceFailure ? ["freshness_grace_expired"] : [],
  });
  session.state = {
    ...session.state,
    executionStatus: "completed",
    mutationVerificationConfidence: verificationConfidence,
    mutationVerification: normalizedVerification,
    verificationConfidence,
    verificationReasons: verificationReasons.slice(-10),
    instabilityDetected,
    retriableVerificationFailure: false,
    queueVerificationPassed: true,
    queueVerificationResult: verificationResult,
    latestVerificationResult: verification,
    rollbackIntegrity,
    mutationHeartbeat,
    mutationHealthScore: finalized.mutationHealthScore,
    mutationDriftScore: finalized.mutationDriftScore,
    transportFreshnessScore: finalized.transportFreshnessScore,
    heartbeatStatus: finalized.heartbeatStatus,
    freshnessGrace: finalized.freshnessGrace,
    graceState: finalized.graceState,
    graceFailure,
    graceConfidencePenalty: finalized.graceConfidencePenalty,
    graceReasons: finalized.graceReasons,
    rollbackStability,
    rollbackConfidence: finalized.rollbackConfidence,
    rollbackIntegrityScore: finalized.rollbackIntegrityScore,
    rollbackBlockers,
    restorationFeasibility: finalized.restorationFeasibility,
    rollbackAllowed,
    verificationPhaseDurationMs,
    verificationGraceActive: rollbackRecovery.verificationGraceActive,
    rollbackPreservationState: rollbackRecovery.rollbackPreservationActive ? "active" : "inactive",
    rollbackIntegrityContributors: rollbackContributors,
    transportMutationSafety: finalized.transportMutationSafety,
    transportAuthState: verification.tokenRefreshStatus === "refreshed" ? "refreshed" : "healthy",
    tokenRefreshStatus: verification.tokenRefreshStatus,
    verificationFinalized: true,
    stabilizationCompleted: true,
    rollbackRecomputeStatus: "completed",
    recommendationFreshnessState:
      recommendationFreshnessSync.state === "refreshed" || recommendationFreshnessSync.state === "noop"
        ? "healthy"
        : validation.heartbeat.queueFreshness === "healthy" || validation.heartbeat.queueFreshness === "aging"
        ? "healthy"
        : validation.heartbeat.queueFreshness,
    accessTokenExpiresAt: verification.authContinuity?.accessTokenExpiresAt ?? null,
    lastSuccessfulRefreshAt: verification.authContinuity?.lastSuccessfulRefreshAt ?? null,
    refreshFailureCount: verification.authContinuity?.refreshFailureCount ?? 0,
    authRecoveryReasoning: verification.authContinuity?.authRecoveryReasoning?.slice(-6) ?? [],
    verificationContinuity: verificationStabilization.verificationContinuity,
    verificationFreshnessConfidence: verificationStabilization.verificationFreshnessConfidence,
    verificationTransportLatency: verificationStabilization.verificationTransportLatency,
    verificationHeartbeatContinuity: verificationStabilization.verificationHeartbeatContinuity,
    verificationMutationConsistency: verificationStabilization.verificationMutationConsistency,
    verificationWindowIntegrity: verificationStabilization.verificationWindowIntegrity,
    verificationSnapshotReliability: verificationStabilization.verificationSnapshotReliability,
    verificationRecoveryConfidence: verificationStabilization.verificationRecoveryConfidence,
    verificationStabilizationConfidence: verificationStabilization.verificationStabilizationConfidence,
    verificationFailurePressure: verificationStabilization.verificationFailurePressure,
    verificationContinuityHistory: verificationStabilization.verificationContinuityHistory,
    verificationLatencyHistory: verificationStabilization.verificationLatencyHistory,
    verificationFreshnessHistory: verificationStabilization.verificationFreshnessHistory,
    verificationIntegrityHistory: verificationStabilization.verificationIntegrityHistory,
    verificationStabilizationSummary: verificationStabilization.verificationStabilizationSummary.slice(-6),
    mutationAttemptCount: session.mutationAttemptCount,
    retryBoundReached: false,
    rollbackIntegrityReasoning: describeRollbackIntegrity({
      rollbackSnapshot: session.rollbackSnapshot,
      verificationPassed: true,
      playbackStable: verification.transportHealthy,
      syncHealthy: verification.transportHealthy && params.evaluation.deviceSynchronizationConfidence >= 70,
    }),
    mutationContinuity: computeMutationContinuity({
      freshnessScore: validation.freshnessScore,
      transportStability: params.evaluation.transportStability,
      heartbeatContinuity: validation.heartbeat.heartbeatContinuityScore,
      mutationFailures: session.mutationFailures,
    }),
    queueMutationFreshness: validation.freshnessScore,
    executionReasoning: [
      ...session.state.executionReasoning,
      "Queue prepared successfully.",
      "Verification finalized successfully.",
      "Rollback integrity recomputed after verification completion.",
      "Stabilization completed.",
      verification.tokenRefreshStatus === "refreshed"
        ? "Token refreshed successfully during verification."
        : "No token refresh needed during verification.",
      recommendationFreshnessSync.state === "refreshed"
        ? "Recommendation freshness timestamps refreshed during supervised mutation."
        : "Recommendation freshness unchanged during supervised mutation.",
      "Why mutation stabilized: queue verification confirmed continuity and sync integrity.",
      rollbackRecovery.rollbackPreservationActive
        ? "Rollback preservation window remained active through verification."
        : "Rollback preservation window inactive at stabilization.",
      ...verificationStabilization.verificationStabilizationSummary,
      ...(instabilityDetected
        ? ["Minor verification instability detected but convergence remained inside safe supervised bounds."]
        : []),
      ...(finalized.rollbackReasoning ?? []),
      ...(finalized.heartbeatPenalty > 0
        ? [`Heartbeat watch/degraded penalty applied (${finalized.heartbeatPenalty.toFixed(2)}).`]
        : ["Heartbeat stability preserved during finalization."]),
      ...finalized.heartbeatReasoning,
      ...(finalized.gracePenalty > 0
        ? [`Bounded freshness grace penalty applied (${finalized.gracePenalty.toFixed(2)}).`]
        : ["Freshness remained stable without grace penalty."]),
      ...(graceFailure
        ? ["Grace window expired during verification; stability remained guarded through fallback scoring."]
        : []),
      ...finalized.graceReasons,
      "Rollback snapshot captured.",
      ...verification.verificationReasoning,
    ],
    executionCompletedAt: Date.now(),
    executionDegradationReasons: [],
  };
  executionStore.set(params.userId, session);

  const validationBundle = await runSupervisedExecutionValidation({
    userId: params.userId,
    evaluation: params.evaluation,
    queueMutationSuccess: true,
    selectedCandidate: params.refinementContext?.selectedCandidate,
    convergenceMetrics: params.refinementContext?.convergenceMetrics,
    executionId: session.state.executionId,
  });

  return {
    ok: true,
    state: getPlaybackExecutionState(params.userId),
    message: "Queue prepared successfully.",
    executionValidation: validationBundle.validation,
    historicalTrust: validationBundle.historicalTrust,
    learningSignals: validationBundle.learningSignals,
    runtimeTrustCalibration: validationBundle.runtimeTrustCalibration,
    autonomyReadiness: validationBundle.autonomyReadiness,
  };
}

export async function runSupervisedExecutionValidation(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  queueMutationSuccess: boolean;
  selectedCandidate?: AdaptiveOrchestrationCandidate | null;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
  executionId?: string;
}) {
  const session = executionStore.get(params.userId);
  const bundle = await validateExecutionOutcome({
    userId: params.userId,
    evaluation: params.evaluation,
    queueMutationSuccess: params.queueMutationSuccess,
    selectedCandidate: params.selectedCandidate,
    convergenceMetrics: params.convergenceMetrics,
    executionId: params.executionId ?? session?.state.executionId,
    executionState: session?.state ?? null,
  });
  if (session) {
    const patch = applyExecutionValidationToPlaybackState({
      userId: params.userId,
      validation: bundle.validation,
      historicalTrustScore: bundle.historicalTrust.trustScore,
      runtimeTrustCalibration: bundle.runtimeTrustCalibration,
      autonomyReadiness: bundle.autonomyReadiness,
      strategyReliability: bundle.strategyReliability,
    });
    session.state = {
      ...session.state,
      ...patch,
      runtimeLearningSignals: bundle.learningSignals.map((s) => s.description),
    };
    executionStore.set(params.userId, session);
  }
  return bundle;
}

export function approvePreparedExecution(userId: string) {
  const session = executionStore.get(userId);
  if (!session) return { ok: false, state: getPlaybackExecutionState(userId), message: "No prepared execution found." };
  session.approved = true;
  const nextLegacyMutationState = session.state.executionStatus === "queued" ? "executing" : session.state.mutationState;
  if (session.state.executionStatus === "queued") {
    transitionMutationState({
      userId,
      session,
      state: "executing",
      reasoning: "Operator approved execution.",
      executionPhase: "operator_approval",
      confidenceDelta: 2,
    });
  }
  session.state = {
    ...session.state,
    executionStatus: session.state.executionStatus === "queued" ? "executing" : session.state.executionStatus,
    mutationState: nextLegacyMutationState,
    mutationTimeline: [
      ...(session.state.mutationTimeline ?? []),
      {
        timestamp: Date.now(),
        state: "approval",
        reasoning: "Operator approved execution.",
      },
    ],
    executionReasoning: [...session.state.executionReasoning, "Operator approved execution."],
  };
  executionStore.set(userId, session);
  return { ok: true, state: getPlaybackExecutionState(userId), message: "Execution approved." };
}

export function abortPreparedExecution(userId: string, reason = "Operator aborted execution.") {
  const session = executionStore.get(userId);
  if (!session) return { ok: false, state: getPlaybackExecutionState(userId), message: "No prepared execution found." };
  transitionMutationState({
    userId,
    session,
    state: "failed",
    reasoning: reason,
    executionPhase: "operator_abort",
    confidenceDelta: -6,
    degradationReasons: ["operator_abort"],
  });
  session.state = {
    ...session.state,
    executionStatus: "aborted",
    executionCompletedAt: Date.now(),
    retryBoundReached: session.state.retryBoundReached,
    executionReasoning: [...session.state.executionReasoning, reason, "Why mutation failed: supervised abort requested."],
  };
  executionStore.set(userId, session);
  return { ok: true, state: getPlaybackExecutionState(userId), message: "Execution aborted." };
}

export async function rollbackQueueMutation(userId: string) {
  const session = executionStore.get(userId);
  if (!session || !session.rollbackSnapshot) {
    return { ok: false, state: getPlaybackExecutionState(userId), message: "No rollback snapshot available." };
  }
  const rollbackStability = evaluateNormalizedRollbackStability({
    userId,
    session,
    verificationPassed: Boolean(session.state.queueVerificationPassed),
    playbackStable: true,
    syncHealthy: true,
    transportConsistencyScore: session.state.transportMutationSafety ?? 60,
  });
  if (!rollbackStability.rollbackAllowed) {
    transitionMutationState({
      userId,
      session,
      state: "failed",
      reasoning: "Rollback execution blocked: rollback stability gate rejected unsafe restoration.",
      executionPhase: "rollback_gate",
      confidenceDelta: -8,
      degradationReasons: [...rollbackStability.rollbackBlockers, "rollback_gate_blocked"],
      runtimeWarnings: [...rollbackStability.rollbackBlockers],
      transitionDiagnostics: [...rollbackStability.rollbackReasoning],
    });
    session.state = {
      ...session.state,
      rollbackStability: rollbackStability.normalized,
      rollbackConfidence: rollbackStability.rollbackConfidence,
      rollbackIntegrityScore: rollbackStability.normalized.rollbackIntegrityScore,
      rollbackBlockers: rollbackStability.rollbackBlockers,
      restorationFeasibility: rollbackStability.restorationFeasibility,
      rollbackAllowed: false,
      mutationHeartbeat: session.state.mutationHeartbeat,
      mutationHealthScore: session.state.mutationHealthScore,
      mutationDriftScore: session.state.mutationDriftScore,
      transportFreshnessScore: session.state.transportFreshnessScore,
      heartbeatStatus: session.state.heartbeatStatus,
      freshnessGrace: session.state.freshnessGrace,
      graceState: session.state.graceState,
      graceFailure: session.state.graceFailure,
      graceConfidencePenalty: session.state.graceConfidencePenalty,
      graceReasons: session.state.graceReasons,
      executionDegradationReasons: [...(session.state.executionDegradationReasons ?? []), ...rollbackStability.rollbackBlockers],
      executionReasoning: [
        ...session.state.executionReasoning,
        "Rollback blocked by deterministic rollback stability gating.",
        ...rollbackStability.rollbackReasoning,
      ],
      rollbackRecomputeStatus: "failed",
    };
    executionStore.set(userId, session);
    return {
      ok: false,
      state: getPlaybackExecutionState(userId),
      message: "Rollback blocked by rollback stability gate.",
    };
  }
  transitionMutationState({
    userId,
    session,
    state: "rollback_ready",
    reasoning: "Rollback activated by operator/safety flow.",
    executionPhase: "rollback_start",
    confidenceDelta: -4,
    degradationReasons: ["rollback_requested"],
  });
  transitionMutationState({
    userId,
    session,
    state: "rollback_executing",
    reasoning: "Rollback execution started under supervised controls.",
    executionPhase: "rollback_execute",
    confidenceDelta: -2,
    degradationReasons: ["rollback_requested"],
  });
  transitionMutationState({
    userId,
    session,
    state: "rollback_complete",
    reasoning: "Rollback path completed (checkpoint restored).",
    executionPhase: "rollback_finalize",
    confidenceDelta: 1,
  });
  session.state = {
    ...session.state,
    executionStatus: "rollback",
    mutationState: "rollback_complete",
    rollbackIntegrity: rollbackStability.mergedRollbackIntegrity,
    rollbackStability: rollbackStability.normalized,
    rollbackConfidence: rollbackStability.rollbackConfidence,
    rollbackIntegrityScore: rollbackStability.normalized.rollbackIntegrityScore,
    rollbackBlockers: rollbackStability.rollbackBlockers,
    restorationFeasibility: rollbackStability.restorationFeasibility,
    rollbackAllowed: true,
    freshnessGrace: session.state.freshnessGrace,
    graceState: session.state.graceState,
    graceFailure: session.state.graceFailure,
    graceConfidencePenalty: session.state.graceConfidencePenalty,
    graceReasons: session.state.graceReasons,
    queueVerificationPassed: false,
    queueVerificationResult: "Rollback activated by operator/safety flow.",
    rollbackPreservationState: "inactive",
    verificationGraceActive: false,
    verificationPhaseDurationMs: session.state.verificationPhaseDurationMs,
    rollbackIntegrityContributors: [
      "rollback_snapshot_exists",
      "transport_recovery_manual",
      "rollback_preservation_inactive",
    ],
    transportAuthState: "healthy",
    tokenRefreshStatus: "not_needed",
    verificationFinalized: false,
    stabilizationCompleted: false,
    rollbackRecomputeStatus: "pending",
    recommendationFreshnessState: "healthy",
    retryBoundReached: session.state.retryBoundReached,
    rollbackIntegrityReasoning: describeRollbackIntegrity({
      rollbackSnapshot: session.rollbackSnapshot,
      verificationPassed: false,
      playbackStable: true,
      syncHealthy: true,
    }),
    executionCompletedAt: Date.now(),
    executionReasoning: [
      ...session.state.executionReasoning,
      "Rollback snapshot restored for queue safety (state checkpoint only).",
      "Why rollback activated: supervised recovery requested.",
      ...rollbackStability.rollbackReasoning,
    ],
  };
  executionStore.set(userId, session);
  return {
    ok: true,
    state: getPlaybackExecutionState(userId),
    message: "Rollback path completed (checkpoint restored).",
  };
}
