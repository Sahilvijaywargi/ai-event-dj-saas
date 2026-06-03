import "server-only";

export const TRANSPORT_MUTATION_STATES = [
  "pending",
  "preparing",
  "validating",
  "executing",
  "verifying",
  "stabilized",
  "degraded",
  "rollback_ready",
  "rollback_executing",
  "rollback_complete",
  "failed",
] as const;

export type TransportMutationState = (typeof TRANSPORT_MUTATION_STATES)[number];

export const TRANSPORT_SYNC_STATES = ["synced", "degraded", "desynced", "unknown"] as const;
export type TransportSyncState = (typeof TRANSPORT_SYNC_STATES)[number];

export const MUTATION_VERIFICATION_STATES = [
  "not_started",
  "precheck_passed",
  "precheck_failed",
  "verified",
  "verification_failed",
] as const;
export type MutationVerificationState = (typeof MUTATION_VERIFICATION_STATES)[number];

export const HEARTBEAT_STATUSES = ["healthy", "watch", "degraded", "critical"] as const;
export type HeartbeatStatus = (typeof HEARTBEAT_STATUSES)[number];

export const FRESHNESS_STATES = ["healthy", "aging", "stale", "expired"] as const;
export type FreshnessState = (typeof FRESHNESS_STATES)[number];

export const ROLLBACK_VERIFICATION_STAGES = [
  "pending",
  "snapshot_created",
  "continuity_verified",
  "playback_reconciled",
  "mutation_verified",
  "rollback_safe",
  "rollback_blocked",
] as const;
export type RollbackVerificationStage = (typeof ROLLBACK_VERIFICATION_STAGES)[number];

export type VerificationCheckResult = {
  score: number;
  passed: boolean;
  reason: string;
};

export type MutationVerificationResult = {
  timestamp: number;
  mutationId: string;
  orchestrationId: string;
  verificationState: MutationVerificationState;
  expectedInsertionIndex: number | null;
  actualInsertionIndex: number | null;
  queueContinuity: VerificationCheckResult;
  duplicateCorruption: VerificationCheckResult;
  truncationDetection: VerificationCheckResult;
  playbackContinuity: VerificationCheckResult;
  transportSynchronization: VerificationCheckResult;
  verificationScore: number;
  verificationConfidence: number;
  passed: boolean;
  retriable: boolean;
  instabilityDetected: boolean;
  reasons: readonly string[];
};

export type RollbackStability = {
  timestamp: number;
  mutationId: string;
  orchestrationId: string;
  rollbackConfidence: number;
  rollbackIntegrityScore: number;
  restorationFeasibility: number;
  snapshotIntegrityScore: number;
  snapshotFreshnessScore: number;
  ownershipContinuityScore: number;
  rollbackAllowed: boolean;
  rollbackBlockers: readonly string[];
  rollbackReasoning: readonly string[];
};

export type MutationHeartbeat = {
  timestamp: number;
  mutationId: string;
  orchestrationId: string;
  heartbeatStatus: HeartbeatStatus;
  mutationHealthScore: number;
  mutationDriftScore: number;
  transportFreshnessScore: number;
  propagationDelayScore: number;
  playbackDesyncScore: number;
  telemetryFreshnessAgeMs: number;
  propagationDelayMs: number;
  acknowledgementLatencyMs: number;
  playbackContinuityStability: number;
  reasoning: readonly string[];
};

export type MutationLifecycleSnapshot = {
  mutationId: string;
  orchestrationId: string;
  state: TransportMutationState;
  previousState: TransportMutationState | null;
  transitionReason: string;
  verificationState: MutationVerificationState;
  transportSyncState: TransportSyncState;
  rollbackReadiness: number;
  queueSnapshotHash: string;
  retryCount: number;
  maxRetries: number;
  freshnessAgeMs: number;
  heartbeatHealth: number;
  executionStartedAt: number;
  stateUpdatedAt: number;
  executionCompletedAt: number | null;
};

export type MutationLifecycleTransitionRequest = {
  nextState: TransportMutationState;
  reason: string;
  verificationState?: MutationVerificationState;
  transportSyncState?: TransportSyncState;
  rollbackReadiness?: number;
  queueSnapshotHash?: string;
  freshnessAgeMs?: number;
  heartbeatHealth?: number;
  retryCount?: number;
};

export type MutationAuditEntry = {
  timestamp: number;
  mutationId: string;
  orchestrationId: string;
  lifecycleState: TransportMutationState;
  executionPhase: string;
  confidenceValue: number;
  confidenceDelta: number;
  degradationReasons: readonly string[];
  queueSnapshotHash: string;
  rollbackReadiness: number;
  heartbeatDiagnostics: {
    heartbeatStatus: HeartbeatStatus;
    mutationHealthScore: number;
    mutationDriftScore: number;
    transportFreshnessScore: number;
  };
  verificationOutcome: {
    verificationState: MutationVerificationState;
    verificationScore: number;
    passed: boolean;
  };
  runtimeWarnings: readonly string[];
  transitionDiagnostics: readonly string[];
};

export type FreshnessGraceEvaluation = {
  graceActive: boolean;
  graceExpired: boolean;
  graceFailure: boolean;
  graceWindowMs: number;
  graceRemainingMs: number;
  degradedConfidence: number;
  confidencePenalty: number;
  state: "inactive" | "active" | "expired";
  reasons: readonly string[];
};
