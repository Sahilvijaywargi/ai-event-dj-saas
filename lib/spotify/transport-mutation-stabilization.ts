import "server-only";

import {
  FreshnessGraceEvaluation,
  FreshnessState,
  HEARTBEAT_STATUSES,
  HeartbeatStatus,
  MutationAuditEntry,
  MutationHeartbeat,
  MutationLifecycleSnapshot,
  MutationLifecycleTransitionRequest,
  MutationVerificationResult,
  MutationVerificationState,
  RollbackStability,
  TransportMutationState,
  TransportSyncState,
  VerificationCheckResult,
} from "@/lib/spotify/mutation-types";

type QueueTrackShape = {
  uri: string;
};

type QueueVerificationInput = {
  now: number;
  mutationId: string;
  orchestrationId: string;
  expectedTrackUri: string;
  expectedInsertionIndex: number | null;
  queueBefore: readonly QueueTrackShape[];
  queueAfter: readonly QueueTrackShape[];
  playbackContinuityScore: number;
  playbackDeviceUnchanged: boolean;
  transportSyncState: TransportSyncState;
};

type RollbackEvaluationInput = {
  now: number;
  mutationId: string;
  orchestrationId: string;
  snapshotHashBefore: string | null;
  snapshotHashCurrent: string | null;
  snapshotAgeMs: number;
  snapshotMaxAgeMs: number;
  ownershipContinuity: boolean;
  playbackRecoverability: number;
  transportConsistency: number;
};

type HeartbeatEvaluationInput = {
  now: number;
  mutationId: string;
  orchestrationId: string;
  telemetryFreshnessState: FreshnessState;
  telemetryFreshnessAgeMs: number;
  propagationDelayMs: number;
  acknowledgementLatencyMs: number;
  playbackDesyncDelta: number;
  queueDriftDelta: number;
  playbackContinuityStability: number;
};

type FreshnessGraceInput = {
  now: number;
  graceStartedAt: number | null;
  maxGraceWindowMs: number;
  freshnessState: FreshnessState;
  baseConfidence: number;
  graceAllowed: boolean;
};

/**
 * Official mutation lifecycle graph.
 * Rollback verification stages (snapshot_created, rollback_safe, etc.) are metadata only.
 * Preparation stabilization path: pending → preparing → validating → rollback_ready → executing → …
 */
export const ALLOWED_LIFECYCLE_TRANSITIONS: Readonly<Record<TransportMutationState, readonly TransportMutationState[]>> = {
  pending: ["preparing", "failed"],
  preparing: ["validating", "degraded", "failed"],
  validating: ["executing", "degraded", "rollback_ready", "failed"],
  executing: ["verifying", "degraded", "rollback_ready", "failed"],
  verifying: ["stabilized", "degraded", "rollback_ready", "failed"],
  stabilized: ["degraded", "rollback_ready", "failed"],
  degraded: ["validating", "rollback_ready", "failed"],
  rollback_ready: ["rollback_executing", "failed"],
  rollback_executing: ["rollback_complete", "failed"],
  rollback_complete: [],
  failed: [],
};

const ALLOWED_TRANSITIONS = ALLOWED_LIFECYCLE_TRANSITIONS;

export function canTransitionMutationLifecycle(from: TransportMutationState, to: TransportMutationState) {
  return ALLOWED_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function getAllowedMutationLifecycleTargets(from: TransportMutationState) {
  return ALLOWED_LIFECYCLE_TRANSITIONS[from];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function freshnessScore(state: FreshnessState) {
  if (state === "healthy") return 100;
  if (state === "aging") return 76;
  if (state === "stale") return 44;
  return 16;
}

function toHeartbeatStatus(score: number): HeartbeatStatus {
  if (score >= 78) return HEARTBEAT_STATUSES[0];
  if (score >= 60) return HEARTBEAT_STATUSES[1];
  if (score >= 42) return HEARTBEAT_STATUSES[2];
  return HEARTBEAT_STATUSES[3];
}

function buildCheck(score: number, passThreshold: number, passReason: string, failReason: string): VerificationCheckResult {
  const bounded = round(clamp(score, 0, 100));
  const passed = bounded >= passThreshold;
  return {
    score: bounded,
    passed,
    reason: passed ? passReason : failReason,
  };
}

export function createMutationLifecycle(params: {
  mutationId: string;
  orchestrationId: string;
  queueSnapshotHash: string;
  now?: number;
  initialVerificationState?: MutationVerificationState;
  initialTransportSyncState?: TransportSyncState;
  maxRetries?: number;
}): MutationLifecycleSnapshot {
  const now = params.now ?? Date.now();
  return Object.freeze({
    mutationId: params.mutationId,
    orchestrationId: params.orchestrationId,
    state: "pending" as const,
    previousState: null,
    transitionReason: "Lifecycle initialized.",
    verificationState: params.initialVerificationState ?? "not_started",
    transportSyncState: params.initialTransportSyncState ?? "unknown",
    rollbackReadiness: 0,
    queueSnapshotHash: params.queueSnapshotHash,
    retryCount: 0,
    maxRetries: params.maxRetries ?? 1,
    freshnessAgeMs: 0,
    heartbeatHealth: 0,
    executionStartedAt: now,
    stateUpdatedAt: now,
    executionCompletedAt: null,
  });
}

export function transitionMutationLifecycle(
  current: MutationLifecycleSnapshot,
  request: MutationLifecycleTransitionRequest,
  now = Date.now(),
): MutationLifecycleSnapshot {
  const reason = request.reason.trim();
  if (!reason) {
    throw new Error("Lifecycle transition requires explicit reason.");
  }
  const fromState = current.state;
  const toState = request.nextState;
  const allowed = ALLOWED_TRANSITIONS[fromState];
  console.log("[LIFECYCLE]", fromState, "->", toState);
  if (!allowed.includes(toState)) {
    throw new Error(
      `Invalid lifecycle transition: ${fromState} -> ${toState}. Allowed from ${fromState}: ${allowed.join(", ")}.`,
    );
  }

  const retryCount =
    request.retryCount !== undefined ? request.retryCount : request.nextState === "executing" ? current.retryCount + 1 : current.retryCount;
  if (retryCount > current.maxRetries) {
    throw new Error("Retry count exceeded max retries.");
  }

  return Object.freeze({
    mutationId: current.mutationId,
    orchestrationId: current.orchestrationId,
    state: request.nextState,
    previousState: current.state,
    transitionReason: reason,
    verificationState: request.verificationState ?? current.verificationState,
    transportSyncState: request.transportSyncState ?? current.transportSyncState,
    rollbackReadiness: round(clamp(request.rollbackReadiness ?? current.rollbackReadiness, 0, 100)),
    queueSnapshotHash: request.queueSnapshotHash ?? current.queueSnapshotHash,
    retryCount,
    maxRetries: current.maxRetries,
    freshnessAgeMs: Math.max(0, request.freshnessAgeMs ?? current.freshnessAgeMs),
    heartbeatHealth: round(clamp(request.heartbeatHealth ?? current.heartbeatHealth, 0, 100)),
    executionStartedAt: current.executionStartedAt,
    stateUpdatedAt: now,
    executionCompletedAt:
      request.nextState === "stabilized" || request.nextState === "rollback_complete" || request.nextState === "failed"
        ? now
        : current.executionCompletedAt,
  });
}

export function appendMutationAuditEntry(
  current: readonly MutationAuditEntry[],
  entry: Omit<MutationAuditEntry, "timestamp"> & { timestamp?: number },
): readonly MutationAuditEntry[] {
  const immutableEntry: MutationAuditEntry = Object.freeze({
    ...entry,
    timestamp: entry.timestamp ?? Date.now(),
    degradationReasons: Object.freeze([...entry.degradationReasons]),
    runtimeWarnings: Object.freeze([...entry.runtimeWarnings]),
    transitionDiagnostics: Object.freeze([...entry.transitionDiagnostics]),
    heartbeatDiagnostics: Object.freeze({ ...entry.heartbeatDiagnostics }),
    verificationOutcome: Object.freeze({ ...entry.verificationOutcome }),
  });
  return Object.freeze([...current, immutableEntry]);
}

export function evaluateQueueVerification(input: QueueVerificationInput): MutationVerificationResult {
  const expectedIndex = input.expectedInsertionIndex;
  const actualIndex = input.queueAfter.findIndex((track) => track.uri === input.expectedTrackUri);
  const beforeUris = input.queueBefore.map((track) => track.uri);
  const afterUris = input.queueAfter.map((track) => track.uri);

  const continuityOverlap = beforeUris.filter((uri) => afterUris.includes(uri)).length;
  const continuityRatio = continuityOverlap / Math.max(beforeUris.length, 1);
  const continuityScore = continuityRatio * 100;

  const duplicateCount = afterUris.filter((uri) => uri === input.expectedTrackUri).length;
  const duplicateSafeScore = duplicateCount === 1 ? 100 : duplicateCount === 0 ? 45 : Math.max(0, 100 - (duplicateCount - 1) * 35);

  const truncationDetected = afterUris.length + 1 < beforeUris.length;
  const truncationScore = truncationDetected ? 24 : 100;

  const deviceContinuityScore = input.playbackDeviceUnchanged ? input.playbackContinuityScore : Math.max(0, input.playbackContinuityScore - 28);
  const syncScore =
    input.transportSyncState === "synced"
      ? 100
      : input.transportSyncState === "degraded"
        ? 58
        : input.transportSyncState === "desynced"
          ? 22
          : 38;

  const insertionScore =
    expectedIndex === null
      ? actualIndex >= 0
        ? 78
        : 32
      : actualIndex === expectedIndex
        ? 100
        : actualIndex >= 0
          ? Math.max(0, 100 - Math.abs(actualIndex - expectedIndex) * 22)
          : 18;

  const queueContinuity = buildCheck(
    continuityScore * 0.7 + insertionScore * 0.3,
    62,
    "Queue continuity and insertion position validated.",
    "Queue continuity drift or insertion mismatch detected.",
  );
  const duplicateCorruption = buildCheck(
    duplicateSafeScore,
    70,
    "No duplicate corruption detected.",
    "Duplicate corruption risk detected in queue mutation.",
  );
  const truncationDetection = buildCheck(
    truncationScore,
    70,
    "No queue truncation detected.",
    "Queue truncation detected after mutation.",
  );
  const playbackContinuity = buildCheck(
    deviceContinuityScore,
    60,
    "Playback continuity preserved.",
    "Playback continuity instability detected.",
  );
  const transportSynchronization = buildCheck(
    syncScore,
    60,
    "Transport synchronization remained healthy.",
    "Transport synchronization degraded after mutation.",
  );

  const verificationScore = round(
    queueContinuity.score * 0.24 +
      duplicateCorruption.score * 0.2 +
      truncationDetection.score * 0.2 +
      playbackContinuity.score * 0.18 +
      transportSynchronization.score * 0.18,
  );
  const verificationConfidence = round(
    clamp(
      verificationScore -
        (duplicateCount > 1 ? 14 : 0) -
        (truncationDetected ? 18 : 0) -
        (input.playbackDeviceUnchanged ? 0 : 8),
      0,
      100,
    ),
  );

  const passed =
    queueContinuity.passed &&
    duplicateCorruption.passed &&
    truncationDetection.passed &&
    playbackContinuity.passed &&
    transportSynchronization.passed;
  const instabilityDetected = !passed || verificationConfidence < 62;
  const retriable = instabilityDetected && !truncationDetected && input.transportSyncState !== "desynced";
  const verificationState: MutationVerificationState = passed ? "verified" : "verification_failed";

  const reasons = Object.freeze([
    queueContinuity.reason,
    duplicateCorruption.reason,
    truncationDetection.reason,
    playbackContinuity.reason,
    transportSynchronization.reason,
  ]);

  return {
    timestamp: input.now,
    mutationId: input.mutationId,
    orchestrationId: input.orchestrationId,
    verificationState,
    expectedInsertionIndex: expectedIndex,
    actualInsertionIndex: actualIndex >= 0 ? actualIndex : null,
    queueContinuity,
    duplicateCorruption,
    truncationDetection,
    playbackContinuity,
    transportSynchronization,
    verificationScore,
    verificationConfidence,
    passed,
    retriable,
    instabilityDetected,
    reasons,
  };
}

export function evaluateRollbackStability(input: RollbackEvaluationInput): RollbackStability {
  console.log("[ROLLBACK] validating playback reconciliation");
  const snapshotIntegrityScore =
    input.snapshotHashBefore && input.snapshotHashCurrent && input.snapshotHashBefore === input.snapshotHashCurrent
      ? 100
      : input.snapshotHashBefore && input.snapshotHashCurrent
        ? 56
        : 18;
  const snapshotFreshnessScore = round(clamp(100 - (input.snapshotAgeMs / Math.max(1, input.snapshotMaxAgeMs)) * 100, 0, 100));
  const ownershipContinuityScore = input.ownershipContinuity ? 100 : 28;
  const restorationFeasibility = round(
    clamp(
      input.playbackRecoverability * 0.42 + input.transportConsistency * 0.34 + snapshotFreshnessScore * 0.24,
      0,
      100,
    ),
  );
  const rollbackIntegrityScore = round(
    clamp(
      snapshotIntegrityScore * 0.44 +
        ownershipContinuityScore * 0.2 +
        snapshotFreshnessScore * 0.16 +
        restorationFeasibility * 0.2,
      0,
      100,
    ),
  );
  const rollbackConfidence = round(clamp(rollbackIntegrityScore * 0.7 + restorationFeasibility * 0.3, 0, 100));

  const blockers: string[] = [];
  const reasoning: string[] = [];
  if (snapshotIntegrityScore < 60) blockers.push("snapshot_integrity_low");
  if (snapshotFreshnessScore < 46) blockers.push("snapshot_stale");
  if (!input.ownershipContinuity) blockers.push("ownership_continuity_broken");
  if (input.transportConsistency < 50) blockers.push("transport_consistency_low");
  if (input.playbackRecoverability < 50) blockers.push("playback_recoverability_low");

  reasoning.push(snapshotIntegrityScore >= 60 ? "Rollback snapshot integrity acceptable." : "Rollback snapshot integrity degraded.");
  reasoning.push(snapshotFreshnessScore >= 50 ? "Rollback snapshot freshness within bounded recovery window." : "Rollback snapshot freshness exceeded safe threshold.");
  reasoning.push(input.ownershipContinuity ? "Ownership continuity preserved." : "Ownership continuity lost; rollback ownership unsafe.");
  reasoning.push(restorationFeasibility >= 60 ? "Restoration feasibility healthy." : "Restoration feasibility limited.");

  const rollbackAllowed = blockers.length === 0 && rollbackConfidence >= 58;

  console.log("[ROLLBACK] integrity score", rollbackIntegrityScore);
  console.log("[ROLLBACK] verification confidence", rollbackConfidence);

  return {
    timestamp: input.now,
    mutationId: input.mutationId,
    orchestrationId: input.orchestrationId,
    rollbackConfidence,
    rollbackIntegrityScore,
    restorationFeasibility,
    snapshotIntegrityScore: round(snapshotIntegrityScore),
    snapshotFreshnessScore,
    ownershipContinuityScore,
    rollbackAllowed,
    rollbackBlockers: Object.freeze(blockers),
    rollbackReasoning: Object.freeze(reasoning),
  };
}

export function evaluateMutationHeartbeat(input: HeartbeatEvaluationInput): MutationHeartbeat {
  const freshness = freshnessScore(input.telemetryFreshnessState);
  const freshnessAgingPenalty = round(clamp(input.telemetryFreshnessAgeMs / 120, 0, 100));
  const propagationDelayScore = round(clamp(100 - input.propagationDelayMs / 70, 0, 100));
  const acknowledgementScore = round(clamp(100 - input.acknowledgementLatencyMs / 70, 0, 100));
  const driftScore = round(
    clamp(input.queueDriftDelta * 0.58 + input.playbackDesyncDelta * 0.42 + Math.max(0, 100 - freshness) * 0.14, 0, 100),
  );
  const playbackDesyncScore = round(clamp(100 - input.playbackDesyncDelta, 0, 100));
  const transportFreshnessScore = round(clamp(freshness * 0.74 + (100 - freshnessAgingPenalty) * 0.26, 0, 100));
  const mutationHealthScore = round(
    clamp(
      transportFreshnessScore * 0.24 +
        propagationDelayScore * 0.18 +
        acknowledgementScore * 0.16 +
        playbackDesyncScore * 0.18 +
        input.playbackContinuityStability * 0.24 -
        driftScore * 0.18,
      0,
      100,
    ),
  );
  const heartbeatStatus = toHeartbeatStatus(mutationHealthScore);

  const reasoning: string[] = [];
  reasoning.push(transportFreshnessScore >= 62 ? "Telemetry freshness remains within supervised bounds." : "Telemetry freshness degraded; mutation confidence reduced.");
  reasoning.push(propagationDelayScore >= 62 ? "Propagation delay acceptable for queue mutation convergence." : "Propagation delay elevated; mutation acknowledgement lag detected.");
  reasoning.push(playbackDesyncScore >= 60 ? "Playback desync remains controlled." : "Playback desync elevated; supervision required.");
  reasoning.push(driftScore <= 42 ? "Mutation drift stable." : "Mutation drift pressure rising.");

  return {
    timestamp: input.now,
    mutationId: input.mutationId,
    orchestrationId: input.orchestrationId,
    heartbeatStatus,
    mutationHealthScore,
    mutationDriftScore: driftScore,
    transportFreshnessScore,
    propagationDelayScore,
    playbackDesyncScore,
    telemetryFreshnessAgeMs: input.telemetryFreshnessAgeMs,
    propagationDelayMs: input.propagationDelayMs,
    acknowledgementLatencyMs: input.acknowledgementLatencyMs,
    playbackContinuityStability: round(clamp(input.playbackContinuityStability, 0, 100)),
    reasoning: Object.freeze(reasoning),
  };
}

export const PREPARATION_ROLLBACK_READINESS_THRESHOLD = 45;
export const PREPARATION_INTEGRITY_THRESHOLD = 50;
export const PREPARATION_VERIFICATION_CONFIDENCE_THRESHOLD = 52;

export function computePreparationRollbackReadiness(input: {
  snapshotComplete: boolean;
  playbackActive: boolean;
  syncState: TransportSyncState;
  heartbeatContinuity: number;
  queueFreshnessScore: number;
  transportMutationSafety: number;
  playbackPositionKnown: boolean;
}) {
  console.log("[ROLLBACK] computing preparation rollback readiness");
  const snapshotScore = input.snapshotComplete ? 58 : input.playbackActive ? 28 : 12;
  const syncScore =
    input.syncState === "synced" ? 22 : input.syncState === "degraded" ? 12 : input.syncState === "desynced" ? 4 : 10;
  const continuityScore = round(clamp(input.heartbeatContinuity * 0.22, 0, 22));
  const freshnessScore = round(clamp(input.queueFreshnessScore * 0.12, 0, 12));
  const safetyScore = round(clamp(input.transportMutationSafety * 0.1, 0, 10));
  const positionScore = input.playbackPositionKnown ? 8 : 0;
  const readiness = round(
    clamp(snapshotScore + syncScore + continuityScore + freshnessScore + safetyScore + positionScore, 0, 100),
  );
  console.log("[ROLLBACK] preparation rollback readiness", readiness);
  return readiness;
}

export function evaluatePreparationMutationVerification(input: {
  snapshotComplete: boolean;
  queueReadable: boolean;
  playbackReconciled: boolean;
  transportSyncState: TransportSyncState;
  heartbeatContinuity: number;
  queueFreshnessScore: number;
  transportMutationSafety: number;
  playbackContinuityScore: number;
}) {
  console.log("[ROLLBACK] verifying queue continuity (preparation phase)");
  const snapshotCheck = buildCheck(
    input.snapshotComplete ? 92 : 24,
    55,
    "Rollback snapshot complete for supervised preparation.",
    "Rollback snapshot incomplete; verification cannot finalize.",
  );
  const queueCheck = buildCheck(
    input.queueReadable ? 88 : 30,
    50,
    "Queue state readable for continuity verification.",
    "Queue state unavailable for continuity verification.",
  );
  const reconciliationCheck = buildCheck(
    input.playbackReconciled ? input.playbackContinuityScore : Math.max(0, input.playbackContinuityScore - 24),
    52,
    "Playback reconciliation validated.",
    "Playback reconciliation incomplete.",
  );
  const transportCheck = buildCheck(
    input.transportSyncState === "synced"
      ? 90
      : input.transportSyncState === "degraded"
        ? 62
        : input.transportSyncState === "desynced"
          ? 22
          : 44,
    50,
    "Transport checkpoint healthy for preparation verification.",
    "Transport checkpoint degraded during preparation verification.",
  );
  const heartbeatCheck = buildCheck(input.heartbeatContinuity, 48, "Heartbeat continuity acceptable.", "Heartbeat continuity below preparation threshold.");

  const verificationScore = round(
    snapshotCheck.score * 0.28 +
      queueCheck.score * 0.22 +
      reconciliationCheck.score * 0.22 +
      transportCheck.score * 0.16 +
      heartbeatCheck.score * 0.12,
  );
  const verificationConfidence = round(
    clamp(
      verificationScore * 0.55 +
        input.queueFreshnessScore * 0.2 +
        input.transportMutationSafety * 0.15 +
        input.heartbeatContinuity * 0.1,
      0,
      100,
    ),
  );
  const passed =
    snapshotCheck.passed &&
    queueCheck.passed &&
    reconciliationCheck.passed &&
    transportCheck.passed &&
    verificationConfidence >= PREPARATION_VERIFICATION_CONFIDENCE_THRESHOLD;
  console.log("[ROLLBACK] verification confidence", verificationConfidence);
  return {
    verificationScore,
    verificationConfidence,
    passed,
    reasons: Object.freeze([
      snapshotCheck.reason,
      queueCheck.reason,
      reconciliationCheck.reason,
      transportCheck.reason,
      heartbeatCheck.reason,
    ]),
    checks: {
      snapshotCheck,
      queueCheck,
      reconciliationCheck,
      transportCheck,
      heartbeatCheck,
    },
  };
}

export function evaluateBoundedFreshnessGrace(input: FreshnessGraceInput): FreshnessGraceEvaluation {
  const reasons: string[] = [];
  if (!input.graceAllowed || input.graceStartedAt === null || input.freshnessState === "healthy") {
    reasons.push("Grace inactive: freshness healthy or grace not allowed.");
    return {
      graceActive: false,
      graceExpired: false,
      graceFailure: false,
      graceWindowMs: input.maxGraceWindowMs,
      graceRemainingMs: 0,
      degradedConfidence: round(clamp(input.baseConfidence, 0, 100)),
      confidencePenalty: 0,
      state: "inactive",
      reasons: Object.freeze(reasons),
    };
  }

  const elapsed = Math.max(0, input.now - input.graceStartedAt);
  const remaining = Math.max(0, input.maxGraceWindowMs - elapsed);
  const expired = elapsed >= input.maxGraceWindowMs;
  const graceActive = !expired;
  const severity =
    input.freshnessState === "aging" ? 0.45 : input.freshnessState === "stale" ? 0.8 : 1;
  const timePressure = clamp(elapsed / Math.max(1, input.maxGraceWindowMs), 0, 1);
  const confidencePenalty = round(clamp(8 + severity * 22 + timePressure * 20, 0, 48));
  const degradedConfidence = round(clamp(input.baseConfidence - confidencePenalty, 0, 100));
  const graceFailure = expired;

  reasons.push("Bounded freshness grace engaged for transient propagation delay.");
  reasons.push(`Confidence degraded by ${confidencePenalty.toFixed(2)} during grace window.`);
  if (graceFailure) {
    reasons.push("Grace window expired while freshness remained degraded.");
  } else {
    reasons.push(`Grace remaining ${Math.round(remaining)}ms before hard failure.`);
  }

  return {
    graceActive,
    graceExpired: expired,
    graceFailure,
    graceWindowMs: input.maxGraceWindowMs,
    graceRemainingMs: Math.round(remaining),
    degradedConfidence,
    confidencePenalty,
    state: expired ? "expired" : "active",
    reasons: Object.freeze(reasons),
  };
}
