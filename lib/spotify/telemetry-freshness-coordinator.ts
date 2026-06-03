import "server-only";

export type TelemetryFreshnessExecutionState = {
  verificationFinalized?: boolean;
  stabilizationCompleted?: boolean;
  rollbackIntegrity?: number;
  rollbackIntegrityScore?: number;
  verificationConfidence?: number;
  mutationVerificationConfidence?: number;
  telemetryUpdatedAt?: number;
  mutationHeartbeatAt?: number;
  graceStabilizationActive?: boolean;
  rollbackFreshnessInheritedAt?: string;
};

export interface FreshnessCoordinationResult {
  freshness: "healthy" | "grace_window" | "expired";
  inherited: boolean;
  reason: string;
  freshnessAgeMs: number;
}

const HARD_HEALTHY_MAX_AGE_MS = 15_000;
const GRACE_WINDOW_MAX_AGE_MS = 45_000;
const ROLLBACK_INTEGRITY_GRACE_MIN = 85;
const VERIFICATION_CONFIDENCE_GRACE_MIN = 80;

export function coordinateTelemetryFreshness(
  state?: TelemetryFreshnessExecutionState | null,
  options?: {
    playbackAgeMs?: number;
    deviceAgeMs?: number;
    queueAgeMs?: number;
    now?: number;
  },
): FreshnessCoordinationResult {
  const now = options?.now ?? Date.now();
  const playbackAgeMs = options?.playbackAgeMs ?? inferAgeMs(state, now);
  const deviceAgeMs = options?.deviceAgeMs ?? playbackAgeMs;
  const queueAgeMs = options?.queueAgeMs ?? playbackAgeMs;
  const freshnessAgeMs = Math.max(playbackAgeMs, deviceAgeMs, queueAgeMs);

  const verificationFinalized = Boolean(state?.verificationFinalized);
  const stabilizationCompleted = Boolean(state?.stabilizationCompleted);
  const rollbackIntegrity = Math.max(
    state?.rollbackIntegrity ?? 0,
    state?.rollbackIntegrityScore ?? 0,
  );
  const verificationConfidence = Math.max(
    state?.verificationConfidence ?? 0,
    state?.mutationVerificationConfidence ?? 0,
  );

  if (
    freshnessAgeMs <= HARD_HEALTHY_MAX_AGE_MS &&
    verificationFinalized &&
    stabilizationCompleted
  ) {
    return {
      freshness: "healthy",
      inherited: false,
      reason: "stabilized_session_fresh",
      freshnessAgeMs,
    };
  }

  const inheritedEligible =
    verificationFinalized &&
    rollbackIntegrity >= ROLLBACK_INTEGRITY_GRACE_MIN &&
    verificationConfidence >= VERIFICATION_CONFIDENCE_GRACE_MIN &&
    freshnessAgeMs <= GRACE_WINDOW_MAX_AGE_MS;

  const graceMetadataActive =
    Boolean(state?.graceStabilizationActive) &&
    Boolean(state?.rollbackFreshnessInheritedAt) &&
    now - Date.parse(state!.rollbackFreshnessInheritedAt!) <= 120_000;

  if (inheritedEligible || (graceMetadataActive && verificationFinalized && freshnessAgeMs <= GRACE_WINDOW_MAX_AGE_MS)) {
    console.log("[FRESHNESS] inherited rollback stabilization freshness");
    console.log("[FRESHNESS] grace window active");
    return {
      freshness: "grace_window",
      inherited: true,
      reason: "rollback_stabilization_inheritance",
      freshnessAgeMs,
    };
  }

  if (
    verificationFinalized &&
    stabilizationCompleted &&
    freshnessAgeMs <= GRACE_WINDOW_MAX_AGE_MS &&
    rollbackIntegrity >= 70 &&
    verificationConfidence >= 72
  ) {
    console.log("[FRESHNESS] grace window active");
    return {
      freshness: "grace_window",
      inherited: true,
      reason: "bounded_post_stabilization_grace",
      freshnessAgeMs,
    };
  }

  return {
    freshness: "expired",
    inherited: false,
    reason: "freshness_expired",
    freshnessAgeMs,
  };
}

function inferAgeMs(state: TelemetryFreshnessExecutionState | null | undefined, now: number) {
  if (state?.telemetryUpdatedAt) {
    return Math.max(0, now - state.telemetryUpdatedAt);
  }
  if (state?.mutationHeartbeatAt) {
    return Math.max(0, now - state.mutationHeartbeatAt);
  }
  if (state?.rollbackFreshnessInheritedAt) {
    return Math.max(0, now - Date.parse(state.rollbackFreshnessInheritedAt));
  }
  return GRACE_WINDOW_MAX_AGE_MS + 1;
}
