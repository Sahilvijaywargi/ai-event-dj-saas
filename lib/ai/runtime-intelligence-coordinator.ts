import "server-only";

import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { createQueueEngineProvider } from "@/lib/ai/providers";
import { getAudioEnvironmentState } from "@/lib/audio/audio-energy";
import { getCrowdFeedbackSummary } from "@/lib/ai/crowd-feedback";
import { getAutonomousLoopState } from "@/lib/ai/autonomous-loop";
import { evaluateTransitionEngine } from "@/lib/ai/transition-engine";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import { getPlaybackExecutionState } from "@/lib/spotify/playback-execution-engine";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import {
  refreshRecommendationFreshnessTimestamps,
  serveAiSpotifyRecommendations,
} from "@/lib/spotify/recommendation-serving";
import {
  ensureSpotifyTransportAuth,
} from "@/lib/spotify/service";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeLearnedOrchestrationBias,
  getRuntimeMemoryPatterns,
  RuntimeBiasAdjustment,
  storeRuntimeMemoryPattern,
} from "@/lib/ai/runtime-memory";
import {
  getRuntimeReliabilityState,
  markStaleState,
  RuntimeReliabilityState,
  touchRuntimeHeartbeat,
} from "@/lib/runtime/reliability";
import {
  evaluateTelemetryFreshness,
  refreshDeviceHeartbeat,
  refreshPlaybackHeartbeat,
  refreshQueueHeartbeat,
} from "@/lib/runtime/telemetry-heartbeat";
import { analyzeRuntimeDrift } from "@/lib/ai/runtime-outcome-analysis";
import {
  recordCalibrationFromDrift,
  type ConfidenceCalibrationSnapshot,
} from "@/lib/ai/runtime-confidence-calibration";
import {
  buildRuntimeRecoverySnapshot,
  type RecoveryStrategy,
  type RuntimeRecoverySignalContext,
  type RuntimeRecoverySnapshot,
} from "@/lib/ai/runtime-recovery-intelligence";
import {
  buildRuntimeNarrativeSnapshot,
  type NarrativeFlowState,
  type RuntimeNarrativeSignalContext,
  type RuntimeNarrativeSnapshot,
} from "@/lib/ai/runtime-narrative-orchestration";

export type RuntimeSignalSummary = {
  autonomousLoopStatus: "running" | "stopped";
  transitionRiskLevel: "low" | "medium" | "high" | "n/a";
  crowdSentiment: number;
  audioEngagement: number;
  playbackSynced: boolean;
  recommendationFreshness: "fresh" | "stale" | "expired" | "unknown";
  playbackFreshness: "fresh" | "stale" | "expired";
  synchronizationHealth: "healthy" | "degraded" | "critical";
  executionReadiness: "ready" | "prepare" | "guarded" | "blocked";
  executionReadinessScore: number;
  executionWindowState: "stable_window" | "narrow_window" | "unstable_window" | "expired_window";
  transportStability: number;
  deviceSynchronizationConfidence: number;
  executionBlockers: string[];
  readinessDegradation: "none" | "watch" | "high";
  playbackFreshnessAgeMs: number;
  heartbeatContinuity: number;
  heartbeatDrift: number;
  freshnessRecoveryState: "stable" | "recovering" | "degraded";
  graceStabilizationActive: boolean;
  safetyBlocked: boolean;
  crowdEnergyState: "rising" | "stable" | "saturated" | "fatigued" | "recovering" | "unstable";
  crowdMomentumScore: number;
  crowdFatiguePressure: number;
  crowdRecoveryState: "stable" | "recovering" | "degraded";
  crowdEngagementConfidence: number;
  crowdEnergyVolatility: number;
  crowdHypeSaturation: number;
  crowdRecoveryConfidence: number;
  crowdAdaptationConfidence: number;
  narrativeFlowState: "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable";
  narrativeMomentum: number;
  narrativeTension: number;
  narrativeRecoveryPressure: number;
  narrativeContinuity: number;
  narrativeEnergyArc: number;
  narrativeFatigueRisk: number;
  narrativeProgressionConfidence: number;
  narrativeJourneyAlignment: number;
  narrativeResolutionConfidence: number;
  cadenceState: "restrained" | "balanced" | "escalating" | "aggressive" | "saturated" | "recovering" | "unstable";
  cadenceDensity: number;
  cadenceAggression: number;
  cadenceRecoverySpacing: number;
  cadenceEscalationPressure: number;
  cadenceBreathingRoom: number;
  cadenceStability: number;
  cadenceAdaptationConfidence: number;
  cadenceFatigueLoad: number;
  cadenceNarrativeBalance: number;
  orchestrationBalanceScore: number;
  orchestrationConflictPressure: number;
  orchestrationStability: number;
  orchestrationAlignment: number;
  orchestrationRecoveryPriority: number;
  orchestrationEscalationPriority: number;
  orchestrationContinuityPriority: number;
  orchestrationFatiguePriority: number;
  orchestrationNarrativePriority: number;
  orchestrationSynthesisConfidence: number;
  runtimeCalibrationState?: "stabilizing" | "stable" | "drifting" | "fatigued" | "recovering" | "unstable";
  runtimeBehaviorStability?: number;
  runtimeAdaptationDrift?: number;
  runtimeFatigueAccumulation?: number;
  runtimeRecoveryEfficiency?: number;
  runtimeNarrativeConsistency?: number;
  runtimeCadenceConsistency?: number;
  runtimeEmotionalConsistency?: number;
  runtimeCrowdAdaptationConsistency?: number;
  runtimeCalibrationConfidence?: number;
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
  executionStabilityScore?: number;
  transportIntegrityScore?: number;
  mutationRecoverabilityScore?: number;
  executionHealthClassification?:
    | "stable"
    | "stabilizing"
    | "degraded"
    | "rollback_sensitive"
    | "verification_risk"
    | "transport_unstable"
    | "critical";
  degradationSeverity?: "none" | "low" | "moderate" | "high" | "critical";
  graceState?: "inactive" | "active" | "expired";
  graceFailure?: boolean;
};

export type RuntimeStabilityScore = {
  value: number;
  reasons: string[];
};

export type RuntimeConfidenceScore = {
  unifiedConfidence: number;
  components: {
    transitionConfidence: number;
    crowdTrust: number;
    audioEngagement: number;
    recommendationHealth: number;
    playbackConsistency: number;
  };
  rawOrchestrationConfidence: number;
  calibratedConfidence: number;
  confidenceAdjustmentDelta: number;
  confidenceReliability: number;
};

export type RuntimeCoordinationDecision = {
  orchestrationPriority:
    | "stabilize_signals"
    | "restore_heartbeat"
    | "stabilize_freshness"
    | "preserve_execution_continuity"
    | "refresh_transport_state"
    | "prepare_queue"
    | "recover_playback_sync"
    | "refresh_playback_state"
    | "restore_device_sync"
    | "hold_execution"
    | "prepare_transition_window"
    | "refresh_recommendations"
    | "maintain_current_state"
    | "prepare_transition";
  activeRiskFactors: string[];
  signalConflicts: string[];
  operatorInterventions: string[];
};

export type RuntimeIntelligenceState = {
  timestamp: string;
  unifiedConfidence: RuntimeConfidenceScore;
  stability: RuntimeStabilityScore;
  autonomyReadiness: number;
  signalSummary: RuntimeSignalSummary;
  decision: RuntimeCoordinationDecision;
  learnedMemoryInfluence: RuntimeBiasAdjustment;
  reliability: RuntimeReliabilityState;
  runtimeTickId: string;
  runtimeTickStartedAt: number;
  runtimeTickCompletedAt: number;
  runtimeTickHeartbeatAt: number;
  runtimeTickState:
    | "idle"
    | "evaluating"
    | "stabilizing"
    | "executing"
    | "verifying"
    | "cooldown"
    | "recovering"
    | "completed"
    | "failed";
  runtimeTickContinuity: number;
  runtimeCooldownRemainingMs: number;
  runtimeRecoveryState: "idle" | "active" | "completed" | "failed";
  runtimeExecutionCadence: number;
  runtimeVerificationWindow: number;
  runtimeStabilizationWindow: number;
  runtimeTickDurationMs: number;
  runtimeReasoning: string[];
  runtimeCooldownReasoning: string[];
  runtimeRecoveryReasoning: string[];
  transportAuthState: "healthy" | "refreshing" | "degraded" | "expired";
  accessTokenExpiresAt: number | null;
  lastSuccessfulRefreshAt: number | null;
  refreshFailureCount: number;
  authRecoveryReasoning: string[];
  runtimeConvergenceScore: number;
  runtimeStabilityTrend: "improving" | "stable" | "degrading";
  runtimeDriftScore: number;
  runtimeRecoveryEffectiveness: number;
  runtimeVerificationSuccessRate: number;
  runtimeMutationSuccessRate: number;
  runtimeDegradationPressure: number;
  runtimeContinuityConfidence: number;
  convergenceHistory: Array<{ timestamp: number; score: number; continuityConfidence: number }>;
  degradationHistory: Array<{ timestamp: number; event: string; pressure: number }>;
  recoveryHistory: Array<{ timestamp: number; state: "idle" | "active" | "completed" | "failed"; effectiveness: number }>;
  mutationOutcomeHistory: Array<{
    timestamp: number;
    outcome: "stabilized" | "failed" | "rollback_pending" | "verification_failed" | "auth_blocked" | "transport_blocked";
    confidence: number;
    safetyState: "safe" | "guarded" | "high_risk";
    verificationState: "verified" | "not_verified";
  }>;
  verificationOutcomeHistory: Array<{
    timestamp: number;
    success: boolean;
    confidence: number;
    verificationTimingDrift: number;
  }>;
  verificationContinuity: number;
  verificationFreshnessConfidence: number;
  verificationTransportLatency: number;
  verificationHeartbeatContinuity: number;
  verificationMutationConsistency: number;
  verificationWindowIntegrity: number;
  verificationSnapshotReliability: number;
  verificationRecoveryConfidence: number;
  verificationStabilizationConfidence: number;
  verificationFailurePressure: number;
  verificationContinuityHistory: Array<{
    timestamp: number;
    continuity: number;
    heartbeatContinuity: number;
    mutationConsistency: number;
  }>;
  verificationLatencyHistory: Array<{
    timestamp: number;
    latency: number;
    transportLatency: number;
    timingGap: number;
  }>;
  verificationFreshnessHistory: Array<{
    timestamp: number;
    freshnessConfidence: number;
    playbackFreshness: number;
    queueFreshness: number;
    graceApplied: boolean;
  }>;
  verificationIntegrityHistory: Array<{
    timestamp: number;
    windowIntegrity: number;
    snapshotReliability: number;
    recoveryConfidence: number;
    failurePressure: number;
  }>;
  verificationStabilizationSummary: string[];
  crowdMomentumHistory: Array<{ timestamp: number; momentum: number; engagement: number; adaptationConfidence: number }>;
  crowdFatigueHistory: Array<{ timestamp: number; pressure: number; state: "rising" | "stable" | "saturated" | "fatigued" | "recovering" | "unstable" }>;
  crowdRecoveryHistory: Array<{ timestamp: number; recoveryConfidence: number; recoveryState: "stable" | "recovering" | "degraded" }>;
  crowdVolatilityHistory: Array<{ timestamp: number; volatility: number; hypeSaturation: number }>;
  crowdAdaptationSummary: string[];
  narrativeMomentumHistory: Array<{ timestamp: number; momentum: number; continuity: number; progression: number }>;
  narrativeTensionHistory: Array<{ timestamp: number; tension: number; state: "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable" }>;
  narrativeRecoveryHistory: Array<{ timestamp: number; recoveryPressure: number; resolutionConfidence: number; state: "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable" }>;
  narrativeEnergyArcHistory: Array<{ timestamp: number; energyArc: number; fatigueRisk: number; journeyAlignment: number }>;
  narrativeReasoning: string[];
  latestNarrativeState: "build" | "rise" | "peak" | "sustain" | "release" | "recovery" | "unstable";
  latestNarrativeRisk: number;
  latestNarrativeMomentum: number;
  runtimeNarrativeSummary: string[];
  cadenceDensityHistory: Array<{ timestamp: number; density: number; state: "restrained" | "balanced" | "escalating" | "aggressive" | "saturated" | "recovering" | "unstable" }>;
  cadenceAggressionHistory: Array<{ timestamp: number; aggression: number; escalationPressure: number }>;
  cadenceRecoveryHistory: Array<{ timestamp: number; recoverySpacing: number; breathingRoom: number }>;
  cadenceStabilityHistory: Array<{ timestamp: number; stability: number; adaptationConfidence: number; fatigueLoad: number }>;
  cadenceSummary: string[];
  orchestrationBalanceHistory: Array<{ timestamp: number; balance: number; confidence: number }>;
  orchestrationConflictHistory: Array<{ timestamp: number; conflictPressure: number; recoveryPriority: number; escalationPriority: number }>;
  orchestrationAlignmentHistory: Array<{ timestamp: number; alignment: number; continuityPriority: number; narrativePriority: number }>;
  orchestrationStabilityHistory: Array<{ timestamp: number; stability: number; fatiguePriority: number; synthesisConfidence: number }>;
  orchestrationSynthesisSummary: string[];
  runtimeCalibrationState: "stabilizing" | "stable" | "drifting" | "fatigued" | "recovering" | "unstable";
  runtimeBehaviorStability: number;
  runtimeAdaptationDrift: number;
  runtimeFatigueAccumulation: number;
  runtimeRecoveryEfficiency: number;
  runtimeNarrativeConsistency: number;
  runtimeCadenceConsistency: number;
  runtimeEmotionalConsistency: number;
  runtimeCrowdAdaptationConsistency: number;
  runtimeCalibrationConfidence: number;
  runtimeBehaviorHistory: Array<{ timestamp: number; behaviorStability: number; adaptationDrift: number; calibrationState: "stabilizing" | "stable" | "drifting" | "fatigued" | "recovering" | "unstable" }>;
  runtimeFatigueHistory: Array<{ timestamp: number; fatigueAccumulation: number; crowdFatiguePressure: number; cadenceFatigueLoad: number }>;
  runtimeRecoveryEfficiencyHistory: Array<{ timestamp: number; recoveryEfficiency: number; recoveryFrequency: number; cooldownFrequency: number; stabilizationSuccessRate: number }>;
  runtimeConsistencyHistory: Array<{ timestamp: number; narrativeConsistency: number; cadenceConsistency: number; emotionalConsistency: number; crowdAdaptationConsistency: number; orchestrationAlignment: number }>;
  runtimeCalibrationSummary: string[];
  confidenceCalibrationSnapshot?: ConfidenceCalibrationSnapshot;
  confidenceCalibrationSummary?: string[];
  calibrationReliabilityScore?: number;
  calibrationPressure?: number;
  boundedConfidenceAdjustment?: number;
  calibrationSeverity?: ConfidenceCalibrationSnapshot["calibration"]["calibrationSeverity"];
  calibrationSeverityLabels?: ConfidenceCalibrationSnapshot["calibration"]["calibrationSeverityLabels"];
  reliabilityTrendDirection?: "improving" | "stable" | "degrading";
  recoverySnapshot?: RuntimeRecoverySnapshot;
  recoveryStrategy?: RecoveryStrategy;
  recoveryConfidence?: number;
  recoveryFeasibility?: number;
  recoveryEscalationPressure?: number;
  recoveryContinuityPreservation?: number;
  recoveryStabilityViability?: number;
  recoveryRiskClassification?: "low" | "moderate" | "high" | "critical";
  recoverySummary?: string[];
  narrativeSnapshot?: RuntimeNarrativeSnapshot;
  narrativeStability?: number;
  narrativeFatiguePressure?: number;
  narrativePacingContinuity?: number;
  narrativeMomentumStability?: number;
  narrativeCooldownPressure?: number;
  narrativeArcPreservation?: number;
  narrativeTransitionArcSafety?: number;
  narrativeRiskClassification?: "low" | "moderate" | "high" | "critical";
  narrativeOrchestrationSummary?: string[];
  sessionAuditId: string;
  sessionStartedAt: number;
  sessionDurationMs: number;
  sessionRuntimeStability: number;
  sessionConvergenceScore: number;
  sessionFatiguePressure: number;
  sessionRecoveryEfficiency: number;
  sessionMutationReliability: number;
  sessionNarrativeConsistency: number;
  sessionCadenceConsistency: number;
  sessionEmotionalConsistency: number;
  sessionCrowdAdaptationConsistency: number;
  sessionTransportReliability: number;
  sessionBehaviorConfidence: number;
  sessionRuntimeHistory: Array<{ timestamp: number; stability: number; convergence: number; behaviorConfidence: number }>;
  sessionMutationHistory: Array<{ timestamp: number; mutationReliability: number; verificationSuccessRate: number; rollbackFrequency: number; authInterruptionFrequency: number; transportDesyncFrequency: number }>;
  sessionRecoveryHistory: Array<{ timestamp: number; recoveryEfficiency: number; recoveryFrequency: number; cooldownFrequency: number; stabilizationSuccess: number }>;
  sessionConvergenceHistory: Array<{ timestamp: number; convergenceStability: number; oscillationFrequency: number; degradationRisk: number; adaptationDriftTrend: number }>;
  sessionFatigueHistory: Array<{ timestamp: number; fatiguePressure: number; fatigueAccumulation: number; pacingRealism: number; recoveryRealism: number }>;
  sessionAuditSummary: string[];
};

type RuntimeTickSession = {
  nextMutationEligibleAt: number;
  verificationSettledUntil: number;
  cadenceMs: number;
  lastTickId: string;
  lastTickCompletedAt: number;
  lastTickState: RuntimeIntelligenceState["runtimeTickState"];
  lastTickHeartbeatAt: number;
  lastRuntimeReasoning: string[];
  lastCooldownReasoning: string[];
  lastRecoveryReasoning: string[];
};

const runtimeTickStore = new Map<string, RuntimeTickSession>();
const runtimeConvergenceStore = new Map<
  string,
  {
    degradationPressure: number;
    convergenceHistory: RuntimeIntelligenceState["convergenceHistory"];
    degradationHistory: RuntimeIntelligenceState["degradationHistory"];
    recoveryHistory: RuntimeIntelligenceState["recoveryHistory"];
    mutationOutcomeHistory: RuntimeIntelligenceState["mutationOutcomeHistory"];
    verificationOutcomeHistory: RuntimeIntelligenceState["verificationOutcomeHistory"];
    previousConvergenceScore: number;
  }
>();

const runtimeCalibrationStore = new Map<
  string,
  {
    runtimeBehaviorHistory: RuntimeIntelligenceState["runtimeBehaviorHistory"];
    runtimeFatigueHistory: RuntimeIntelligenceState["runtimeFatigueHistory"];
    runtimeRecoveryEfficiencyHistory: RuntimeIntelligenceState["runtimeRecoveryEfficiencyHistory"];
    runtimeConsistencyHistory: RuntimeIntelligenceState["runtimeConsistencyHistory"];
    adaptationDrift: number;
    fatigueAccumulation: number;
    lastCalibrationState: RuntimeIntelligenceState["runtimeCalibrationState"];
    lastStateChangedAt: number;
  }
>();

const runtimeSessionAuditStore = new Map<
  string,
  {
    sessionAuditId: string;
    sessionStartedAt: number;
    sessionRuntimeHistory: RuntimeIntelligenceState["sessionRuntimeHistory"];
    sessionMutationHistory: RuntimeIntelligenceState["sessionMutationHistory"];
    sessionRecoveryHistory: RuntimeIntelligenceState["sessionRecoveryHistory"];
    sessionConvergenceHistory: RuntimeIntelligenceState["sessionConvergenceHistory"];
    sessionFatigueHistory: RuntimeIntelligenceState["sessionFatigueHistory"];
  }
>();

function boundedPush<T>(list: T[], next: T, max = 25) {
  const merged = [...list, next];
  return merged.length > max ? merged.slice(merged.length - max) : merged;
}

function evaluateRuntimeConvergence(params: {
  userId: string;
  signalSummary: RuntimeSignalSummary;
  runtimeTick: Awaited<ReturnType<typeof executeSupervisedRuntimeTick>>;
  playbackExecution: ReturnType<typeof getPlaybackExecutionState>;
}) {
  const now = Date.now();
  const previous = runtimeConvergenceStore.get(params.userId) ?? {
    degradationPressure: 22,
    convergenceHistory: [],
    degradationHistory: [],
    recoveryHistory: [],
    mutationOutcomeHistory: [],
    verificationOutcomeHistory: [],
    previousConvergenceScore: 55,
  };
  const cooldownActive = params.runtimeTick.runtimeCooldownRemainingMs > 0;
  const recoveryActive = params.runtimeTick.runtimeRecoveryState === "active" || params.runtimeTick.runtimeRecoveryState === "failed";
  const verificationSuccess = Boolean(params.playbackExecution.queueVerificationPassed);
  const mutationOutcome: RuntimeIntelligenceState["mutationOutcomeHistory"][number]["outcome"] =
    params.playbackExecution.transportAuthState === "degraded"
      ? "auth_blocked"
      : params.signalSummary.transportStability < 50
        ? "transport_blocked"
        : params.playbackExecution.mutationState === "stabilized"
          ? "stabilized"
          : params.playbackExecution.mutationState === "rollback_pending"
            ? "rollback_pending"
            : params.playbackExecution.queueVerificationPassed === false && params.playbackExecution.mutationState === "failed"
              ? "verification_failed"
              : params.playbackExecution.mutationState === "failed"
                ? "failed"
                : "stabilized";
  const mutationHistory = boundedPush(previous.mutationOutcomeHistory, {
    timestamp: now,
    outcome: mutationOutcome,
    confidence: params.playbackExecution.executionConfidence ?? params.runtimeTick.runtimeTickContinuity,
    safetyState: params.playbackExecution.executionSafety ?? "guarded",
    verificationState: (params.playbackExecution.queueVerificationPassed
      ? "verified"
      : "not_verified") as "verified" | "not_verified",
  });
  const verificationTimingDrift = Number(
    clamp(
      Math.abs((params.playbackExecution.verificationPhaseDurationMs ?? 0) - params.runtimeTick.runtimeVerificationWindow) / 80,
      0,
      100,
    ).toFixed(2),
  );
  const verificationHistory = boundedPush(previous.verificationOutcomeHistory, {
    timestamp: now,
    success: verificationSuccess,
    confidence: params.playbackExecution.mutationVerificationConfidence ?? 0,
    verificationTimingDrift,
  });
  const verificationSuccessRate = Number(
    (
      (verificationHistory.filter((entry) => entry.success).length / Math.max(verificationHistory.length, 1)) *
      100
    ).toFixed(2),
  );
  const mutationSuccessRate = Number(
    (
      (mutationHistory.filter((entry) => entry.outcome === "stabilized").length / Math.max(mutationHistory.length, 1)) *
      100
    ).toFixed(2),
  );
  const recoveryHistory = boundedPush(previous.recoveryHistory, {
    timestamp: now,
    state: params.runtimeTick.runtimeRecoveryState,
    effectiveness: Number(
      clamp(
        params.signalSummary.freshnessRecoveryState === "stable"
          ? 82
          : params.signalSummary.freshnessRecoveryState === "recovering"
            ? 66
            : 42,
        0,
        100,
      ).toFixed(2),
    ),
  });
  const recoveryEffectiveness = Number(
    (
      recoveryHistory.reduce((sum, item) => sum + item.effectiveness, 0) / Math.max(recoveryHistory.length, 1)
    ).toFixed(2),
  );
  const normalizedStabilityScore = params.playbackExecution.executionStabilityScore ?? 0;
  const normalizedTransportIntegrity = params.playbackExecution.transportIntegrityScore ?? 0;
  const normalizedRecoverability = params.playbackExecution.mutationRecoverabilityScore ?? 0;
  const degradationSeverityPenalty =
    params.playbackExecution.degradationSeverity === "critical"
      ? 16
      : params.playbackExecution.degradationSeverity === "high"
        ? 11
        : params.playbackExecution.degradationSeverity === "moderate"
          ? 7
          : params.playbackExecution.degradationSeverity === "low"
            ? 3
            : 0;
  const freshnessDrift =
    params.signalSummary.playbackFreshness === "expired"
      ? 80
      : params.signalSummary.playbackFreshness === "stale"
        ? 55
        : 20;
  const cooldownVariance = Number(
    clamp(
      (previous.convergenceHistory.slice(-5).filter((item) => item.score < 60).length / 5) * 100,
      0,
      100,
    ).toFixed(2),
  );
  const stabilizationVariance = Number(
    clamp(
      Math.abs((params.playbackExecution.rollbackIntegrity ?? 0) - params.runtimeTick.runtimeTickContinuity),
      0,
      100,
    ).toFixed(2),
  );
  const runtimeDriftScore = Number(
    clamp(
      params.signalSummary.heartbeatDrift * 0.28 +
        freshnessDrift * 0.18 +
        verificationTimingDrift * 0.2 +
        cooldownVariance * 0.14 +
        stabilizationVariance * 0.1 +
        Math.max(0, params.signalSummary.crowdEnergyVolatility - 55) * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const pressureIncrease =
    (cooldownActive ? 4 : 0) +
    (recoveryActive ? 5 : 0) +
    (!verificationSuccess ? 7 : 0) +
    (params.runtimeTick.transportAuthState === "degraded" || params.runtimeTick.transportAuthState === "expired" ? 9 : 0) +
    ((params.playbackExecution.rollbackIntegrity ?? 0) < 45 ? 6 : 0) +
    (params.signalSummary.transportStability < 55 ? 5 : 0) +
    (params.signalSummary.playbackFreshness !== "fresh" ? 4 : 0) +
    (params.signalSummary.crowdEnergyVolatility >= 78 ? 3 : 0);
  const pressureDecay =
    params.runtimeTick.runtimeTickState === "completed" &&
    params.signalSummary.transportStability >= 65 &&
    params.signalSummary.heartbeatContinuity >= 65
      ? 5
      : 0;
  const volatilityGuardedRelief =
    params.signalSummary.crowdEnergyVolatility >= 70 &&
    params.signalSummary.transportStability >= 66 &&
    params.signalSummary.heartbeatContinuity >= 66 &&
    params.runtimeTick.runtimeTickState !== "failed"
      ? 3
      : 0;
  const runtimeDegradationPressure = Number(
    clamp(previous.degradationPressure + pressureIncrease - pressureDecay - volatilityGuardedRelief, 0, 100).toFixed(2),
  );
  const runtimeConvergenceScore = Number(
    clamp(
      params.signalSummary.heartbeatContinuity * 0.16 +
        params.signalSummary.transportStability * 0.16 +
        (params.runtimeTick.transportAuthState === "healthy" ? 92 : params.runtimeTick.transportAuthState === "refreshing" ? 78 : 38) *
          0.12 +
        (params.playbackExecution.rollbackIntegrity ?? 0) * 0.12 +
        verificationSuccessRate * 0.12 +
        (params.playbackExecution.mutationContinuity ?? params.runtimeTick.runtimeTickContinuity) * 0.12 +
        (params.signalSummary.freshnessRecoveryState === "stable" ? 85 : params.signalSummary.freshnessRecoveryState === "recovering" ? 68 : 40) *
          0.08 +
        Math.max(0, recoveryEffectiveness - 60) * 0.04 +
        (params.runtimeTick.runtimeTickState === "completed" ? 88 : 48) * 0.06 +
        (100 - Math.min(100, runtimeDegradationPressure)) * 0.06 +
        normalizedStabilityScore * 0.08 +
        normalizedTransportIntegrity * 0.06 +
        normalizedRecoverability * 0.04 -
        degradationSeverityPenalty,
      0,
      100,
    ).toFixed(2),
  );
  const runtimeContinuityConfidence = Number(
    clamp(
      runtimeConvergenceScore * 0.56 +
        (100 - runtimeDriftScore) * 0.22 +
        (100 - runtimeDegradationPressure) * 0.22,
      0,
      100,
    ).toFixed(2),
  );
  const trendDelta = runtimeConvergenceScore - previous.previousConvergenceScore;
  const runtimeStabilityTrend: RuntimeIntelligenceState["runtimeStabilityTrend"] =
    trendDelta >= 2 ? "improving" : trendDelta <= -2 ? "degrading" : "stable";
  const convergenceHistory = boundedPush(previous.convergenceHistory, {
    timestamp: now,
    score: runtimeConvergenceScore,
    continuityConfidence: runtimeContinuityConfidence,
  });
  const degradationHistory =
    pressureIncrease > 0
      ? boundedPush(previous.degradationHistory, {
          timestamp: now,
          event:
            !verificationSuccess
              ? "verification_failure_recurrence"
              : params.runtimeTick.transportAuthState !== "healthy"
                ? "auth_degradation_detected"
                : params.signalSummary.transportStability < 55
                  ? "transport_instability_detected"
                  : "cooldown_or_recovery_pressure",
          pressure: runtimeDegradationPressure,
        })
      : previous.degradationHistory;
  const convergenceReasoning: string[] = [];
  if (runtimeStabilityTrend === "improving") convergenceReasoning.push("Convergence improved due to stable completion and continuity gains.");
  if (runtimeStabilityTrend === "degrading") convergenceReasoning.push("Convergence degraded due to pressure accumulation and drift.");
  if (pressureIncrease > 0) convergenceReasoning.push("Degradation pressure increased from recurrent cooldown/recovery or verification instability.");
  if (pressureDecay > 0) convergenceReasoning.push("Stability recovered as pressure decayed under healthy runtime conditions.");
  if (volatilityGuardedRelief > 0) {
    convergenceReasoning.push("Temporary volatility spike was damped by guarded transport and heartbeat stability.");
  }
  if (recoveryEffectiveness >= 70) {
    convergenceReasoning.push("Stabilization recovery contribution strengthened convergence despite transient volatility.");
  }
  if (runtimeContinuityConfidence < 55) convergenceReasoning.push("Runtime considered unstable due to low continuity confidence.");
  if ((params.playbackExecution.graceState ?? "inactive") === "active") {
    convergenceReasoning.push("Freshness grace active; convergence remains guarded under temporary propagation uncertainty.");
  }
  if (params.playbackExecution.graceFailure) {
    convergenceReasoning.push("Freshness grace expired; convergence penalized until verification and transport stabilize.");
  }
  if (params.playbackExecution.executionHealthClassification === "critical") {
    convergenceReasoning.push("Execution health classified critical; convergence constrained by normalized execution observability.");
  }
  runtimeConvergenceStore.set(params.userId, {
    degradationPressure: runtimeDegradationPressure,
    convergenceHistory,
    degradationHistory,
    recoveryHistory,
    mutationOutcomeHistory: mutationHistory,
    verificationOutcomeHistory: verificationHistory,
    previousConvergenceScore: runtimeConvergenceScore,
  });
  return {
    runtimeConvergenceScore,
    runtimeStabilityTrend,
    runtimeDriftScore,
    runtimeRecoveryEffectiveness: recoveryEffectiveness,
    runtimeVerificationSuccessRate: verificationSuccessRate,
    runtimeMutationSuccessRate: mutationSuccessRate,
    runtimeDegradationPressure,
    runtimeContinuityConfidence,
    convergenceHistory,
    degradationHistory,
    recoveryHistory,
    mutationOutcomeHistory: mutationHistory,
    verificationOutcomeHistory: verificationHistory,
    convergenceReasoning,
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function synthesizeCoordinatorRuntimeDrift(params: {
  rawOrchestrationConfidence: number;
  signalSummary: RuntimeSignalSummary;
  playbackExecution: ReturnType<typeof getPlaybackExecutionState>;
}) {
  const predictedExecutionStability =
    params.signalSummary.executionStabilityScore ?? params.signalSummary.executionReadinessScore;
  const actualExecutionStability = params.playbackExecution.executionStabilityScore ?? predictedExecutionStability;
  const predictedRecoveryPressure = Number(
    clamp(
      params.signalSummary.narrativeRecoveryPressure * 0.42 +
        params.signalSummary.cadenceEscalationPressure * 0.28 +
        (100 - (params.signalSummary.executionStabilityScore ?? params.signalSummary.executionReadinessScore)) * 0.3,
      0,
      100,
    ).toFixed(2),
  );
  const actualRecoveryPressure = Number(
    clamp(
      (params.playbackExecution.verificationFailurePressure ?? 0) * 0.45 +
        (100 - (params.playbackExecution.verificationRecoveryConfidence ?? 50)) * 0.35 +
        (params.signalSummary.freshnessRecoveryState === "degraded" ? 72 : params.signalSummary.freshnessRecoveryState === "recovering" ? 48 : 24) *
          0.2,
      0,
      100,
    ).toFixed(2),
  );
  const predictedRollbackRisk =
    params.signalSummary.executionReadiness === "blocked" || params.signalSummary.safetyBlocked
      ? 88
      : params.signalSummary.readinessDegradation === "high"
        ? 68
        : 28;
  const rollbackTriggered =
    (params.playbackExecution.rollbackIntegrity ?? 100) < 42 ||
    params.playbackExecution.executionHealthClassification === "rollback_sensitive" ||
    params.playbackExecution.executionHealthClassification === "critical";
  return analyzeRuntimeDrift({
    prediction: {
      predictedConfidence: params.rawOrchestrationConfidence,
      predictedTransitionQuality: predictedExecutionStability,
      predictedRecoveryPressure,
      predictedExecutionStability,
      predictedRollbackRisk,
      predictedHeartbeatDegradation: Number(clamp(100 - params.signalSummary.heartbeatContinuity, 0, 100).toFixed(2)),
      predictedTransportStability: params.signalSummary.transportStability,
      predictedEnergyFlow: params.signalSummary.narrativeEnergyArc,
    },
    actual: {
      actualConfidence: Number(
        clamp(
          params.rawOrchestrationConfidence -
            Math.max(0, predictedExecutionStability - actualExecutionStability) * 0.22 -
            (params.signalSummary.readinessDegradation === "high" ? 8 : 0),
          0,
          100,
        ).toFixed(2),
      ),
      actualTransitionQuality: actualExecutionStability,
      actualRecoveryPressure,
      actualExecutionStability,
      rollbackTriggered,
      actualHeartbeatDegradation: Number(clamp(params.signalSummary.heartbeatDrift + (100 - params.signalSummary.heartbeatContinuity) * 0.35, 0, 100).toFixed(2)),
      actualTransportStability: Number(
        clamp(
          params.signalSummary.transportStability -
            (params.playbackExecution.executionHealthClassification === "transport_unstable" ? 18 : 0),
          0,
          100,
        ).toFixed(2),
      ),
      actualEnergyFlow: params.signalSummary.narrativeEnergyArc,
    },
  });
}

function toRuntimeRecoverySignalContext(signalSummary: RuntimeSignalSummary): RuntimeRecoverySignalContext {
  return {
    executionReadinessScore: signalSummary.executionReadinessScore,
    executionStabilityScore: signalSummary.executionStabilityScore,
    heartbeatContinuity: signalSummary.heartbeatContinuity,
    transportStability: signalSummary.transportStability,
    deviceSynchronizationConfidence: signalSummary.deviceSynchronizationConfidence,
    narrativeEnergyArc: signalSummary.narrativeEnergyArc,
    narrativeContinuity: signalSummary.narrativeContinuity,
    narrativeFatigueRisk: signalSummary.narrativeFatigueRisk,
    narrativeRecoveryPressure: signalSummary.narrativeRecoveryPressure,
    narrativeTension: signalSummary.narrativeTension,
    narrativeResolutionConfidence: signalSummary.narrativeResolutionConfidence,
    crowdMomentumScore: signalSummary.crowdMomentumScore,
    crowdEngagementConfidence: signalSummary.crowdEngagementConfidence,
    cadenceEscalationPressure: signalSummary.cadenceEscalationPressure,
    cadenceFatigueLoad: signalSummary.cadenceFatigueLoad,
    orchestrationAlignment: signalSummary.orchestrationAlignment,
    orchestrationStability: signalSummary.orchestrationStability,
    orchestrationContinuityPriority: signalSummary.orchestrationContinuityPriority,
    graceState: signalSummary.graceState,
    graceFailure: signalSummary.graceFailure,
    degradationSeverity: signalSummary.degradationSeverity,
    executionHealthClassification: signalSummary.executionHealthClassification,
  };
}

function toRuntimeNarrativeSignalContext(
  signalSummary: RuntimeSignalSummary,
  transitionEnergyFlowScore?: number,
  transitionCompatibilityScore?: number,
): RuntimeNarrativeSignalContext {
  return {
    narrativeFlowState: signalSummary.narrativeFlowState as NarrativeFlowState,
    narrativeMomentum: signalSummary.narrativeMomentum,
    narrativeTension: signalSummary.narrativeTension,
    narrativeRecoveryPressure: signalSummary.narrativeRecoveryPressure,
    narrativeContinuity: signalSummary.narrativeContinuity,
    narrativeEnergyArc: signalSummary.narrativeEnergyArc,
    narrativeFatigueRisk: signalSummary.narrativeFatigueRisk,
    narrativeProgressionConfidence: signalSummary.narrativeProgressionConfidence,
    narrativeJourneyAlignment: signalSummary.narrativeJourneyAlignment,
    narrativeResolutionConfidence: signalSummary.narrativeResolutionConfidence,
    crowdMomentumScore: signalSummary.crowdMomentumScore,
    crowdFatiguePressure: signalSummary.crowdFatiguePressure,
    crowdHypeSaturation: signalSummary.crowdHypeSaturation,
    crowdEnergyVolatility: signalSummary.crowdEnergyVolatility,
    cadenceState: signalSummary.cadenceState,
    cadenceDensity: signalSummary.cadenceDensity,
    cadenceAggression: signalSummary.cadenceAggression,
    cadenceRecoverySpacing: signalSummary.cadenceRecoverySpacing,
    cadenceEscalationPressure: signalSummary.cadenceEscalationPressure,
    cadenceBreathingRoom: signalSummary.cadenceBreathingRoom,
    cadenceStability: signalSummary.cadenceStability,
    cadenceFatigueLoad: signalSummary.cadenceFatigueLoad,
    cadenceNarrativeBalance: signalSummary.cadenceNarrativeBalance,
    orchestrationAlignment: signalSummary.orchestrationAlignment,
    orchestrationStability: signalSummary.orchestrationStability,
    orchestrationConflictPressure: signalSummary.orchestrationConflictPressure,
    transitionEnergyFlowScore,
    transitionCompatibilityScore,
  };
}

function evaluateRuntimeNarrativeOrchestrationLayer(params: {
  signalSummary: RuntimeSignalSummary;
  recoverySnapshot?: RuntimeRecoverySnapshot;
  calibrationSnapshot?: ConfidenceCalibrationSnapshot;
  transitionEnergyFlowScore?: number;
  transitionCompatibilityScore?: number;
  convergenceAudit: ReturnType<typeof evaluateRuntimeConvergence>;
  runtimeConvergenceScore: number;
  runtimeContinuityConfidence: number;
}) {
  const snapshot = buildRuntimeNarrativeSnapshot({
    signals: toRuntimeNarrativeSignalContext(
      params.signalSummary,
      params.transitionEnergyFlowScore,
      params.transitionCompatibilityScore,
    ),
    recoverySnapshot: params.recoverySnapshot,
    calibrationSnapshot: params.calibrationSnapshot,
  });
  const recommendation = snapshot.recommendation;
  const convergenceInfluence = Number(
    clamp(
      recommendation.continuity.transitionArcSafety >= 62
        ? (recommendation.narrativeStability - 55) * 0.04
        : recommendation.risk.narrativeRiskScore >= 58
          ? -(recommendation.risk.narrativeRiskScore - 50) * 0.03
          : 0,
      -2,
      2,
    ).toFixed(2),
  );
  const runtimeConvergenceScore = Number(
    clamp(params.runtimeConvergenceScore + convergenceInfluence, 0, 100).toFixed(2),
  );
  const runtimeContinuityConfidence = Number(
    clamp(
      runtimeConvergenceScore * 0.52 +
        params.runtimeContinuityConfidence * 0.28 +
        recommendation.continuity.arcPreservationScore * 0.12 +
        recommendation.energyWave.pacingContinuity * 0.08,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeReasoning = [
    ...recommendation.orchestrationReasoning,
    `Additive narrative convergence influence: ${convergenceInfluence >= 0 ? "+" : ""}${convergenceInfluence.toFixed(2)}.`,
  ];
  return {
    snapshot,
    runtimeConvergenceScore,
    runtimeContinuityConfidence,
    narrativeReasoning,
    convergenceInfluence,
  };
}

function evaluateRuntimeRecoveryIntelligenceLayer(params: {
  signalSummary: RuntimeSignalSummary;
  playbackExecution: ReturnType<typeof getPlaybackExecutionState>;
  calibrationSnapshot?: ConfidenceCalibrationSnapshot;
  convergenceAudit: ReturnType<typeof evaluateRuntimeConvergence>;
}) {
  const snapshot = buildRuntimeRecoverySnapshot({
    signalSummary: toRuntimeRecoverySignalContext(params.signalSummary),
    playbackExecution: params.playbackExecution,
    calibrationSnapshot: params.calibrationSnapshot,
  });
  const recommendation = snapshot.recommendation;
  const convergenceInfluence = Number(
    clamp(
      recommendation.confidence.recoveryFeasibility >= 62
        ? (recommendation.confidence.recoveryFeasibility - 55) * 0.05
        : recommendation.escalation.rollbackEscalationPressure >= 70
          ? -(recommendation.escalation.rollbackEscalationPressure - 65) * 0.04
          : 0,
      -2,
      2,
    ).toFixed(2),
  );
  const runtimeConvergenceScore = Number(
    clamp(params.convergenceAudit.runtimeConvergenceScore + convergenceInfluence, 0, 100).toFixed(2),
  );
  const runtimeContinuityConfidence = Number(
    clamp(
      runtimeConvergenceScore * 0.56 +
        (100 - params.convergenceAudit.runtimeDriftScore) * 0.22 +
        (100 - params.convergenceAudit.runtimeDegradationPressure) * 0.22 +
        recommendation.continuity.continuityPreservationQuality * 0.04,
      0,
      100,
    ).toFixed(2),
  );
  const recoveryReasoning = [
    ...recommendation.recoveryReasoning,
    `Additive convergence influence from recovery intelligence: ${convergenceInfluence >= 0 ? "+" : ""}${convergenceInfluence.toFixed(2)}.`,
  ];
  return {
    snapshot,
    runtimeConvergenceScore,
    runtimeContinuityConfidence,
    recoveryReasoning,
    convergenceInfluence,
  };
}

function evaluateRuntimeConfidenceCalibrationLayer(params: {
  userId: string;
  rawOrchestrationConfidence: number;
  signalSummary: RuntimeSignalSummary;
  playbackExecution: ReturnType<typeof getPlaybackExecutionState>;
  convergenceAudit: ReturnType<typeof evaluateRuntimeConvergence>;
}) {
  const drift = synthesizeCoordinatorRuntimeDrift({
    rawOrchestrationConfidence: params.rawOrchestrationConfidence,
    signalSummary: params.signalSummary,
    playbackExecution: params.playbackExecution,
  });
  const snapshot = recordCalibrationFromDrift({
    userId: params.userId,
    drift,
    rawOrchestrationConfidence: params.rawOrchestrationConfidence,
  });
  const convergenceInfluence = Number(
    clamp(
      (snapshot.calibration.calibrationReliabilityScore - 50) * 0.04 -
        snapshot.calibration.calibrationPressure * 0.02 +
        snapshot.calibration.boundedConfidenceAdjustment * 0.15,
      -3,
      3,
    ).toFixed(2),
  );
  const runtimeConvergenceScore = Number(
    clamp(params.convergenceAudit.runtimeConvergenceScore + convergenceInfluence, 0, 100).toFixed(2),
  );
  const runtimeContinuityConfidence = Number(
    clamp(
      runtimeConvergenceScore * 0.56 +
        (100 - params.convergenceAudit.runtimeDriftScore) * 0.22 +
        (100 - params.convergenceAudit.runtimeDegradationPressure) * 0.22,
      0,
      100,
    ).toFixed(2),
  );
  const calibrationReasoning = [
    ...snapshot.calibration.calibrationReasoning,
    `Additive convergence influence: ${convergenceInfluence >= 0 ? "+" : ""}${convergenceInfluence.toFixed(2)} from historical confidence calibration.`,
  ];
  return {
    snapshot,
    runtimeConvergenceScore,
    runtimeContinuityConfidence,
    calibrationReasoning,
    convergenceInfluence,
  };
}

function evaluateRuntimeBehaviorCalibration(params: {
  userId: string;
  signalSummary: RuntimeSignalSummary;
  convergenceAudit: ReturnType<typeof evaluateRuntimeConvergence>;
  playbackExecution: ReturnType<typeof getPlaybackExecutionState>;
  runtimeTick: Awaited<ReturnType<typeof executeSupervisedRuntimeTick>>;
}) {
  const now = Date.now();
  const previous = runtimeCalibrationStore.get(params.userId) ?? {
    runtimeBehaviorHistory: [],
    runtimeFatigueHistory: [],
    runtimeRecoveryEfficiencyHistory: [],
    runtimeConsistencyHistory: [],
    adaptationDrift: 34,
    fatigueAccumulation: 30,
    lastCalibrationState: "stabilizing" as const,
    lastStateChangedAt: now,
  };
  const recentRecoveryFrequency = boundedPush(
    previous.runtimeRecoveryEfficiencyHistory.map((entry) => entry.recoveryFrequency),
    params.runtimeTick.runtimeRecoveryState === "active" ? 100 : params.runtimeTick.runtimeRecoveryState === "failed" ? 82 : 24,
    12,
  );
  const recentCooldownFrequency = boundedPush(
    previous.runtimeRecoveryEfficiencyHistory.map((entry) => entry.cooldownFrequency),
    params.runtimeTick.runtimeCooldownRemainingMs > 0 ? 100 : 28,
    12,
  );
  const stabilizationSuccessRate = Number(
    clamp(
      params.convergenceAudit.runtimeMutationSuccessRate * 0.5 +
        params.convergenceAudit.runtimeVerificationSuccessRate * 0.35 +
        (params.playbackExecution.mutationState === "stabilized" ? 84 : 46) * 0.15,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeConsistency = Number(
    clamp(
      params.signalSummary.narrativeContinuity * 0.44 +
        params.signalSummary.narrativeEnergyArc * 0.22 +
        (100 - params.signalSummary.narrativeFatigueRisk) * 0.18 +
        (100 - params.signalSummary.narrativeRecoveryPressure) * 0.16,
      0,
      100,
    ).toFixed(2),
  );
  const cadenceConsistency = Number(
    clamp(
      params.signalSummary.cadenceStability * 0.38 +
        params.signalSummary.cadenceNarrativeBalance * 0.22 +
        params.signalSummary.cadenceAdaptationConfidence * 0.2 +
        (100 - params.signalSummary.cadenceEscalationPressure) * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const emotionalConsistency = Number(
    clamp(
      params.signalSummary.orchestrationContinuityPriority * 0.26 +
        params.signalSummary.orchestrationAlignment * 0.24 +
        (100 - params.signalSummary.orchestrationConflictPressure) * 0.2 +
        (100 - params.signalSummary.heartbeatDrift) * 0.12 +
        params.convergenceAudit.runtimeConvergenceScore * 0.18,
      0,
      100,
    ).toFixed(2),
  );
  const crowdAdaptationConsistency = Number(
    clamp(
      params.signalSummary.crowdAdaptationConfidence * 0.36 +
        params.signalSummary.crowdRecoveryConfidence * 0.2 +
        (100 - params.signalSummary.crowdEnergyVolatility) * 0.2 +
        (100 - params.signalSummary.crowdFatiguePressure) * 0.12 +
        params.signalSummary.crowdMomentumScore * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const prioritySpread = Math.max(
    params.signalSummary.orchestrationRecoveryPriority,
    params.signalSummary.orchestrationEscalationPriority,
    params.signalSummary.orchestrationContinuityPriority,
    params.signalSummary.orchestrationFatiguePriority,
    params.signalSummary.orchestrationNarrativePriority,
  ) -
    Math.min(
      params.signalSummary.orchestrationRecoveryPriority,
      params.signalSummary.orchestrationEscalationPriority,
      params.signalSummary.orchestrationContinuityPriority,
      params.signalSummary.orchestrationFatiguePriority,
      params.signalSummary.orchestrationNarrativePriority,
    );
  const oscillationPressure = Number(
    clamp(
      prioritySpread * 0.45 +
        average(recentRecoveryFrequency) * 0.18 +
        params.signalSummary.cadenceEscalationPressure * 0.14 +
        (100 - cadenceConsistency) * 0.1 +
        (100 - narrativeConsistency) * 0.13,
      0,
      100,
    ).toFixed(2),
  );
  const driftIncrease =
    (oscillationPressure >= 62 ? 6 : 0) +
    (params.signalSummary.cadenceStability < 56 ? 5 : 0) +
    (params.signalSummary.narrativeContinuity < 58 ? 5 : 0) +
    (params.signalSummary.orchestrationConflictPressure >= 64 ? 6 : 0) +
    (params.signalSummary.orchestrationSynthesisConfidence < 56 ? 5 : 0);
  const driftDecay =
    params.convergenceAudit.runtimeConvergenceScore >= 68 &&
    params.signalSummary.cadenceStability >= 66 &&
    params.signalSummary.narrativeContinuity >= 66 &&
    stabilizationSuccessRate >= 68
      ? 7
      : 2;
  const runtimeAdaptationDrift = Number(clamp(previous.adaptationDrift + driftIncrease - driftDecay, 0, 100).toFixed(2));
  const fatigueIncrease =
    (params.signalSummary.cadenceAggression >= 68 ? 7 : 0) +
    (params.signalSummary.cadenceRecoverySpacing < 48 ? 6 : 0) +
    (params.signalSummary.narrativeTension >= 66 ? 6 : 0) +
    (params.signalSummary.crowdHypeSaturation >= 70 ? 7 : 0) +
    (params.convergenceAudit.runtimeDegradationPressure >= 62 ? 5 : 0);
  const fatigueDecay =
    params.signalSummary.cadenceRecoverySpacing >= 64 &&
    params.signalSummary.cadenceBreathingRoom >= 60 &&
    params.signalSummary.narrativeRecoveryPressure <= 56 &&
    params.convergenceAudit.runtimeStabilityTrend !== "degrading"
      ? 6
      : 2;
  const runtimeFatigueAccumulation = Number(clamp(previous.fatigueAccumulation + fatigueIncrease - fatigueDecay, 0, 100).toFixed(2));
  const runtimeRecoveryEfficiency = Number(
    clamp(
      stabilizationSuccessRate * 0.34 +
        params.convergenceAudit.runtimeRecoveryEffectiveness * 0.24 +
        params.signalSummary.cadenceRecoverySpacing * 0.18 +
        params.signalSummary.narrativeRecoveryPressure * 0.12 +
        (100 - average(recentRecoveryFrequency)) * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const runtimeBehaviorStability = Number(
    clamp(
      params.convergenceAudit.runtimeConvergenceScore * 0.22 +
        params.signalSummary.orchestrationStability * 0.18 +
        cadenceConsistency * 0.16 +
        narrativeConsistency * 0.16 +
        emotionalConsistency * 0.14 +
        crowdAdaptationConsistency * 0.14,
      0,
      100,
    ).toFixed(2),
  );
  const runtimeCalibrationConfidence = Number(
    clamp(
      runtimeBehaviorStability * 0.24 +
        (100 - runtimeAdaptationDrift) * 0.18 +
        (100 - runtimeFatigueAccumulation) * 0.16 +
        runtimeRecoveryEfficiency * 0.16 +
        params.signalSummary.orchestrationSynthesisConfidence * 0.12 +
        params.convergenceAudit.runtimeConvergenceScore * 0.14,
      0,
      100,
    ).toFixed(2),
  );
  const candidateState: RuntimeIntelligenceState["runtimeCalibrationState"] =
    runtimeBehaviorStability >= 74 && runtimeAdaptationDrift <= 40 && runtimeFatigueAccumulation <= 48
      ? "stable"
      : runtimeFatigueAccumulation >= 72
        ? "fatigued"
        : runtimeAdaptationDrift >= 70
          ? "drifting"
          : runtimeRecoveryEfficiency >= 66 && runtimeFatigueAccumulation <= 62
            ? "recovering"
            : runtimeCalibrationConfidence < 52
              ? "unstable"
              : "stabilizing";
  const minHoldMs = 16_000;
  const recentlyChanged = now - previous.lastStateChangedAt < minHoldMs;
  const flipBlocked =
    recentlyChanged &&
    ((previous.lastCalibrationState === "fatigued" && (candidateState === "stable" || candidateState === "drifting")) ||
      (previous.lastCalibrationState === "drifting" && (candidateState === "stable" || candidateState === "recovering")) ||
      (previous.lastCalibrationState === "unstable" && candidateState === "stable"));
  const runtimeCalibrationState = flipBlocked ? previous.lastCalibrationState : candidateState;
  const lastStateChangedAt = runtimeCalibrationState === previous.lastCalibrationState ? previous.lastStateChangedAt : now;
  const runtimeBehaviorHistory = boundedPush(
    previous.runtimeBehaviorHistory,
    { timestamp: now, behaviorStability: runtimeBehaviorStability, adaptationDrift: runtimeAdaptationDrift, calibrationState: runtimeCalibrationState },
    96,
  );
  const runtimeFatigueHistory = boundedPush(
    previous.runtimeFatigueHistory,
    {
      timestamp: now,
      fatigueAccumulation: runtimeFatigueAccumulation,
      crowdFatiguePressure: params.signalSummary.crowdFatiguePressure,
      cadenceFatigueLoad: params.signalSummary.cadenceFatigueLoad,
    },
    96,
  );
  const runtimeRecoveryEfficiencyHistory = boundedPush(
    previous.runtimeRecoveryEfficiencyHistory,
    {
      timestamp: now,
      recoveryEfficiency: runtimeRecoveryEfficiency,
      recoveryFrequency: average(recentRecoveryFrequency),
      cooldownFrequency: average(recentCooldownFrequency),
      stabilizationSuccessRate,
    },
    96,
  );
  const runtimeConsistencyHistory = boundedPush(
    previous.runtimeConsistencyHistory,
    {
      timestamp: now,
      narrativeConsistency,
      cadenceConsistency,
      emotionalConsistency,
      crowdAdaptationConsistency,
      orchestrationAlignment: params.signalSummary.orchestrationAlignment,
    },
    96,
  );
  runtimeCalibrationStore.set(params.userId, {
    runtimeBehaviorHistory,
    runtimeFatigueHistory,
    runtimeRecoveryEfficiencyHistory,
    runtimeConsistencyHistory,
    adaptationDrift: runtimeAdaptationDrift,
    fatigueAccumulation: runtimeFatigueAccumulation,
    lastCalibrationState: runtimeCalibrationState,
    lastStateChangedAt,
  });
  const runtimeCalibrationSummary: string[] = [];
  if (runtimeBehaviorStability >= 72) runtimeCalibrationSummary.push("Runtime behavior stabilized under sustained cross-layer consistency.");
  if (runtimeAdaptationDrift >= 64) runtimeCalibrationSummary.push("Adaptation drift increased due to priority oscillation and pacing inconsistency.");
  if (runtimeFatigueAccumulation >= 68) runtimeCalibrationSummary.push("Long-session fatigue accumulation elevated from prolonged high-intensity pacing.");
  if (runtimeRecoveryEfficiency >= 70) runtimeCalibrationSummary.push("Recovery efficiency improved through successful stabilization and spacing.");
  if (average([narrativeConsistency, cadenceConsistency, emotionalConsistency, crowdAdaptationConsistency]) >= 70) {
    runtimeCalibrationSummary.push("Orchestration consistency healthy across narrative, cadence, emotion, and crowd adaptation.");
  }
  if (runtimeCalibrationState === "unstable" || runtimeCalibrationState === "drifting") {
    runtimeCalibrationSummary.push("Long-session stability degraded; maintain supervised calibration watch.");
  }
  return {
    runtimeCalibrationState,
    runtimeBehaviorStability,
    runtimeAdaptationDrift,
    runtimeFatigueAccumulation,
    runtimeRecoveryEfficiency,
    runtimeNarrativeConsistency: narrativeConsistency,
    runtimeCadenceConsistency: cadenceConsistency,
    runtimeEmotionalConsistency: emotionalConsistency,
    runtimeCrowdAdaptationConsistency: crowdAdaptationConsistency,
    runtimeCalibrationConfidence,
    runtimeBehaviorHistory,
    runtimeFatigueHistory,
    runtimeRecoveryEfficiencyHistory,
    runtimeConsistencyHistory,
    runtimeCalibrationSummary,
  };
}

function evaluateRuntimeSessionAudit(params: {
  userId: string;
  signalSummary: RuntimeSignalSummary;
  convergenceAudit: ReturnType<typeof evaluateRuntimeConvergence>;
  calibration: ReturnType<typeof evaluateRuntimeBehaviorCalibration>;
  playbackExecution: ReturnType<typeof getPlaybackExecutionState>;
  runtimeTick: Awaited<ReturnType<typeof executeSupervisedRuntimeTick>>;
}) {
  const now = Date.now();
  const existing = runtimeSessionAuditStore.get(params.userId);
  const sessionAuditId = existing?.sessionAuditId ?? `rsa_${params.userId.slice(0, 8)}_${now.toString(36)}`;
  const sessionStartedAt = existing?.sessionStartedAt ?? now;
  const previous = {
    sessionRuntimeHistory: existing?.sessionRuntimeHistory ?? ([] as RuntimeIntelligenceState["sessionRuntimeHistory"]),
    sessionMutationHistory: existing?.sessionMutationHistory ?? ([] as RuntimeIntelligenceState["sessionMutationHistory"]),
    sessionRecoveryHistory: existing?.sessionRecoveryHistory ?? ([] as RuntimeIntelligenceState["sessionRecoveryHistory"]),
    sessionConvergenceHistory: existing?.sessionConvergenceHistory ?? ([] as RuntimeIntelligenceState["sessionConvergenceHistory"]),
    sessionFatigueHistory: existing?.sessionFatigueHistory ?? ([] as RuntimeIntelligenceState["sessionFatigueHistory"]),
  };
  const sessionDurationMs = Math.max(0, now - sessionStartedAt);
  const recoveryFrequency = params.runtimeTick.runtimeRecoveryState === "active" ? 100 : params.runtimeTick.runtimeRecoveryState === "failed" ? 82 : 24;
  const cooldownFrequency = params.runtimeTick.runtimeCooldownRemainingMs > 0 ? 100 : 28;
  const rollbackFrequency =
    params.playbackExecution.mutationState === "rollback_pending"
      ? 86
      : (params.playbackExecution.rollbackIntegrity ?? 0) < 50
        ? 58
        : 20;
  const authInterruptionFrequency =
    params.playbackExecution.transportAuthState === "degraded" ? 84 : 22;
  const transportDesyncFrequency = Number(clamp((100 - params.signalSummary.transportStability) * 0.9, 0, 100).toFixed(2));
  const mutationReliability = Number(
    clamp(
      params.convergenceAudit.runtimeMutationSuccessRate * 0.3 +
        params.convergenceAudit.runtimeVerificationSuccessRate * 0.24 +
        (100 - rollbackFrequency) * 0.14 +
        (100 - authInterruptionFrequency) * 0.14 +
        (100 - transportDesyncFrequency) * 0.18,
      0,
      100,
    ).toFixed(2),
  );
  const convergenceStability = Number(
    clamp(
      params.convergenceAudit.runtimeConvergenceScore * 0.45 +
        (100 - params.convergenceAudit.runtimeDriftScore) * 0.2 +
        (100 - params.convergenceAudit.runtimeDegradationPressure) * 0.2 +
        params.convergenceAudit.runtimeContinuityConfidence * 0.15,
      0,
      100,
    ).toFixed(2),
  );
  const recentRecoveryStates = boundedPush(
    previous.sessionRecoveryHistory.map((entry) => entry.recoveryFrequency),
    recoveryFrequency,
    16,
  );
  const recentCooldownStates = boundedPush(
    previous.sessionRecoveryHistory.map((entry) => entry.cooldownFrequency),
    cooldownFrequency,
    16,
  );
  const oscillationFrequency = Number(
    clamp(
      Math.abs(params.signalSummary.orchestrationEscalationPriority - params.signalSummary.orchestrationRecoveryPriority) * 0.35 +
        average(recentRecoveryStates) * 0.2 +
        average(recentCooldownStates) * 0.18 +
        params.calibration.runtimeAdaptationDrift * 0.27,
      0,
      100,
    ).toFixed(2),
  );
  const degradationRisk = Number(
    clamp(
      average(recentRecoveryStates) * 0.18 +
        average(recentCooldownStates) * 0.18 +
        (100 - convergenceStability) * 0.2 +
        (100 - params.signalSummary.transportStability) * 0.16 +
        params.signalSummary.orchestrationConflictPressure * 0.16 +
        params.calibration.runtimeAdaptationDrift * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const adaptationDriftTrend = Number(
    clamp(
      params.calibration.runtimeAdaptationDrift * 0.62 +
        oscillationFrequency * 0.2 +
        (100 - params.calibration.runtimeBehaviorStability) * 0.18,
      0,
      100,
    ).toFixed(2),
  );
  const pacingRealism = Number(
    clamp(
      params.signalSummary.cadenceNarrativeBalance * 0.34 +
        params.signalSummary.narrativeEnergyArc * 0.24 +
        (100 - params.signalSummary.cadenceEscalationPressure) * 0.22 +
        (100 - params.signalSummary.cadenceAggression) * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const escalationRealism = Number(
    clamp(
      (100 - Math.abs(params.signalSummary.cadenceEscalationPressure - params.signalSummary.orchestrationEscalationPriority)) * 0.55 +
        (100 - params.signalSummary.crowdHypeSaturation) * 0.2 +
        params.signalSummary.orchestrationAlignment * 0.25,
      0,
      100,
    ).toFixed(2),
  );
  const recoveryRealism = Number(
    clamp(
      params.calibration.runtimeRecoveryEfficiency * 0.4 +
        params.signalSummary.cadenceRecoverySpacing * 0.2 +
        (100 - average(recentRecoveryStates)) * 0.18 +
        (100 - average(recentCooldownStates)) * 0.12 +
        params.signalSummary.narrativeRecoveryPressure * 0.1,
      0,
      100,
    ).toFixed(2),
  );
  const fatigueRealism = Number(
    clamp(
      (100 - Math.abs(params.calibration.runtimeFatigueAccumulation - params.signalSummary.cadenceFatigueLoad)) * 0.42 +
        (100 - Math.abs(params.calibration.runtimeFatigueAccumulation - params.signalSummary.crowdFatiguePressure)) * 0.38 +
        (100 - params.signalSummary.crowdHypeSaturation) * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const narrativeConsistencyRealism = Number(
    clamp(
      params.calibration.runtimeNarrativeConsistency * 0.48 +
        params.signalSummary.narrativeContinuity * 0.24 +
        params.signalSummary.orchestrationAlignment * 0.28,
      0,
      100,
    ).toFixed(2),
  );
  const sessionFatiguePressure = Number(
    clamp(
      params.calibration.runtimeFatigueAccumulation * 0.44 +
        params.signalSummary.cadenceFatigueLoad * 0.22 +
        params.signalSummary.crowdFatiguePressure * 0.2 +
        degradationRisk * 0.14,
      0,
      100,
    ).toFixed(2),
  );
  const sessionRecoveryEfficiency = Number(
    clamp(
      params.calibration.runtimeRecoveryEfficiency * 0.5 +
        params.convergenceAudit.runtimeRecoveryEffectiveness * 0.2 +
        (100 - average(recentRecoveryStates)) * 0.15 +
        (100 - average(recentCooldownStates)) * 0.15,
      0,
      100,
    ).toFixed(2),
  );
  const sessionRuntimeStability = Number(
    clamp(
      params.calibration.runtimeBehaviorStability * 0.34 +
        convergenceStability * 0.26 +
        params.signalSummary.orchestrationStability * 0.2 +
        (100 - sessionFatiguePressure) * 0.2,
      0,
      100,
    ).toFixed(2),
  );
  const sessionBehaviorConfidence = Number(
    clamp(
      sessionRuntimeStability * 0.24 +
        mutationReliability * 0.2 +
        sessionRecoveryEfficiency * 0.18 +
        params.signalSummary.orchestrationSynthesisConfidence * 0.14 +
        params.calibration.runtimeCalibrationConfidence * 0.14 +
        average([pacingRealism, escalationRealism, recoveryRealism, fatigueRealism, narrativeConsistencyRealism]) * 0.1 -
        oscillationFrequency * 0.12,
      0,
      100,
    ).toFixed(2),
  );
  const sessionRuntimeHistory = boundedPush(
    previous.sessionRuntimeHistory,
    { timestamp: now, stability: sessionRuntimeStability, convergence: convergenceStability, behaviorConfidence: sessionBehaviorConfidence },
    128,
  );
  const sessionMutationHistory = boundedPush(
    previous.sessionMutationHistory,
    {
      timestamp: now,
      mutationReliability,
      verificationSuccessRate: params.convergenceAudit.runtimeVerificationSuccessRate,
      rollbackFrequency,
      authInterruptionFrequency,
      transportDesyncFrequency,
    },
    128,
  );
  const sessionRecoveryHistory = boundedPush(
    previous.sessionRecoveryHistory,
    {
      timestamp: now,
      recoveryEfficiency: sessionRecoveryEfficiency,
      recoveryFrequency: average(recentRecoveryStates),
      cooldownFrequency: average(recentCooldownStates),
      stabilizationSuccess: Number(
        clamp(
          params.convergenceAudit.runtimeMutationSuccessRate * 0.5 +
            params.convergenceAudit.runtimeVerificationSuccessRate * 0.5,
          0,
          100,
        ).toFixed(2),
      ),
    },
    128,
  );
  const sessionConvergenceHistory = boundedPush(
    previous.sessionConvergenceHistory,
    {
      timestamp: now,
      convergenceStability,
      oscillationFrequency,
      degradationRisk,
      adaptationDriftTrend,
    },
    128,
  );
  const sessionFatigueHistory = boundedPush(
    previous.sessionFatigueHistory,
    {
      timestamp: now,
      fatiguePressure: sessionFatiguePressure,
      fatigueAccumulation: params.calibration.runtimeFatigueAccumulation,
      pacingRealism,
      recoveryRealism,
    },
    128,
  );
  runtimeSessionAuditStore.set(params.userId, {
    sessionAuditId,
    sessionStartedAt,
    sessionRuntimeHistory,
    sessionMutationHistory,
    sessionRecoveryHistory,
    sessionConvergenceHistory,
    sessionFatigueHistory,
  });
  const sessionAuditSummary: string[] = [];
  if (sessionRuntimeStability >= 72) sessionAuditSummary.push("Session stable with sustained runtime convergence and orchestration alignment.");
  if (convergenceStability <= 56 || degradationRisk >= 64) sessionAuditSummary.push("Session convergence degraded under elevated long-session degradation risk.");
  if (mutationReliability <= 56) sessionAuditSummary.push("Mutation reliability weak due to verification/auth/transport instability.");
  if (average([pacingRealism, escalationRealism, recoveryRealism, fatigueRealism, narrativeConsistencyRealism]) >= 70) {
    sessionAuditSummary.push("Behavioral realism healthy across pacing, escalation, recovery, fatigue, and narrative consistency.");
  }
  if (sessionFatiguePressure >= 66) sessionAuditSummary.push("Fatigue accumulation risk elevated; maintain supervised recovery pacing.");
  if (params.signalSummary.orchestrationStability >= 68 && params.signalSummary.orchestrationAlignment >= 68) {
    sessionAuditSummary.push("Orchestration stabilized successfully with consistent cross-layer alignment.");
  }
  return {
    sessionAuditId,
    sessionStartedAt,
    sessionDurationMs,
    sessionRuntimeStability,
    sessionConvergenceScore: convergenceStability,
    sessionFatiguePressure,
    sessionRecoveryEfficiency,
    sessionMutationReliability: mutationReliability,
    sessionNarrativeConsistency: params.calibration.runtimeNarrativeConsistency,
    sessionCadenceConsistency: params.calibration.runtimeCadenceConsistency,
    sessionEmotionalConsistency: params.calibration.runtimeEmotionalConsistency,
    sessionCrowdAdaptationConsistency: params.calibration.runtimeCrowdAdaptationConsistency,
    sessionTransportReliability: Number(
      clamp(
        params.signalSummary.transportStability * 0.5 +
          (100 - transportDesyncFrequency) * 0.22 +
          (100 - authInterruptionFrequency) * 0.28,
        0,
        100,
      ).toFixed(2),
    ),
    sessionBehaviorConfidence,
    sessionRuntimeHistory,
    sessionMutationHistory,
    sessionRecoveryHistory,
    sessionConvergenceHistory,
    sessionFatigueHistory,
    sessionAuditSummary,
  };
}

function randomRuntimeTickId() {
  return `rtick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function tickTransition(params: {
  tickHeartbeat: { value: number };
  nextState: RuntimeIntelligenceState["runtimeTickState"];
  detail: string;
  runtimeReasoning: string[];
}) {
  params.tickHeartbeat.value = Date.now();
  params.runtimeReasoning.push(`[${params.nextState}] ${params.detail}`);
  return params.nextState;
}

function evaluateRuntimeHardBlockers(params: {
  state: RuntimeIntelligenceState;
  mutationState: ReturnType<typeof getPlaybackExecutionState>["mutationState"];
  transportAuthState: ReturnType<typeof getPlaybackExecutionState>["transportAuthState"];
}) {
  const blockers: string[] = [];
  if (!params.state.signalSummary.playbackSynced || params.state.signalSummary.executionBlockers.includes("no_active_device")) {
    blockers.push("missing_device");
  }
  if (params.transportAuthState === "degraded") {
    blockers.push("expired_auth");
  }
  if (
    params.state.signalSummary.transportStability < 35 ||
    params.state.signalSummary.executionBlockers.includes("transport_stability_low")
  ) {
    blockers.push("transport_disconnect");
  }
  if (
    params.state.signalSummary.synchronizationHealth === "critical" ||
    params.state.signalSummary.deviceSynchronizationConfidence < 45
  ) {
    blockers.push("critical_sync_failure");
  }
  if (params.mutationState === "rollback_pending") {
    blockers.push("rollback_pending");
  }
  return blockers;
}

export async function executeSupervisedRuntimeTick(params: {
  userId: string;
  baseState: Omit<
    RuntimeIntelligenceState,
    | "runtimeTickId"
    | "runtimeTickStartedAt"
    | "runtimeTickCompletedAt"
    | "runtimeTickHeartbeatAt"
    | "runtimeTickState"
    | "runtimeTickContinuity"
    | "runtimeCooldownRemainingMs"
    | "runtimeRecoveryState"
    | "runtimeExecutionCadence"
    | "runtimeVerificationWindow"
    | "runtimeStabilizationWindow"
    | "runtimeTickDurationMs"
    | "runtimeReasoning"
    | "runtimeCooldownReasoning"
    | "runtimeRecoveryReasoning"
    | "transportAuthState"
    | "accessTokenExpiresAt"
    | "lastSuccessfulRefreshAt"
    | "refreshFailureCount"
    | "authRecoveryReasoning"
    | "runtimeConvergenceScore"
    | "runtimeStabilityTrend"
    | "runtimeDriftScore"
    | "runtimeRecoveryEffectiveness"
    | "runtimeVerificationSuccessRate"
    | "runtimeMutationSuccessRate"
    | "runtimeDegradationPressure"
    | "runtimeContinuityConfidence"
    | "convergenceHistory"
    | "degradationHistory"
    | "recoveryHistory"
    | "mutationOutcomeHistory"
    | "verificationOutcomeHistory"
    | "verificationContinuity"
    | "verificationFreshnessConfidence"
    | "verificationTransportLatency"
    | "verificationHeartbeatContinuity"
    | "verificationMutationConsistency"
    | "verificationWindowIntegrity"
    | "verificationSnapshotReliability"
    | "verificationRecoveryConfidence"
    | "verificationStabilizationConfidence"
    | "verificationFailurePressure"
    | "verificationContinuityHistory"
    | "verificationLatencyHistory"
    | "verificationFreshnessHistory"
    | "verificationIntegrityHistory"
    | "verificationStabilizationSummary"
    | "crowdMomentumHistory"
    | "crowdFatigueHistory"
    | "crowdRecoveryHistory"
    | "crowdVolatilityHistory"
    | "crowdAdaptationSummary"
    | "narrativeMomentumHistory"
    | "narrativeTensionHistory"
    | "narrativeRecoveryHistory"
    | "narrativeEnergyArcHistory"
    | "narrativeReasoning"
    | "latestNarrativeState"
    | "latestNarrativeRisk"
    | "latestNarrativeMomentum"
    | "runtimeNarrativeSummary"
    | "cadenceDensityHistory"
    | "cadenceAggressionHistory"
    | "cadenceRecoveryHistory"
    | "cadenceStabilityHistory"
    | "cadenceSummary"
    | "orchestrationBalanceHistory"
    | "orchestrationConflictHistory"
    | "orchestrationAlignmentHistory"
    | "orchestrationStabilityHistory"
    | "orchestrationSynthesisSummary"
    | "runtimeCalibrationState"
    | "runtimeBehaviorStability"
    | "runtimeAdaptationDrift"
    | "runtimeFatigueAccumulation"
    | "runtimeRecoveryEfficiency"
    | "runtimeNarrativeConsistency"
    | "runtimeCadenceConsistency"
    | "runtimeEmotionalConsistency"
    | "runtimeCrowdAdaptationConsistency"
    | "runtimeCalibrationConfidence"
    | "runtimeBehaviorHistory"
    | "runtimeFatigueHistory"
    | "runtimeRecoveryEfficiencyHistory"
    | "runtimeConsistencyHistory"
    | "runtimeCalibrationSummary"
    | "sessionAuditId"
    | "sessionStartedAt"
    | "sessionDurationMs"
    | "sessionRuntimeStability"
    | "sessionConvergenceScore"
    | "sessionFatiguePressure"
    | "sessionRecoveryEfficiency"
    | "sessionMutationReliability"
    | "sessionNarrativeConsistency"
    | "sessionCadenceConsistency"
    | "sessionEmotionalConsistency"
    | "sessionCrowdAdaptationConsistency"
    | "sessionTransportReliability"
    | "sessionBehaviorConfidence"
    | "sessionRuntimeHistory"
    | "sessionMutationHistory"
    | "sessionRecoveryHistory"
    | "sessionConvergenceHistory"
    | "sessionFatigueHistory"
    | "sessionAuditSummary"
  >;
  operatorInterrupt?: boolean;
}) {
  const authContinuity = await ensureSpotifyTransportAuth({
    userId: params.userId,
    minValidityMs: 90_000,
    runtimeTickActive: true,
    supervisedExecutionActive: true,
    deviceHealthy: params.baseState.signalSummary.synchronizationHealth !== "critical",
    reason: "runtime_tick_precheck",
  });
  const now = Date.now();
  const existing = runtimeTickStore.get(params.userId);
  const cadenceMs = clamp(
    Number((9000 + (100 - params.baseState.stability.value) * 60).toFixed(0)),
    8000,
    15000,
  );
  const cooldownWindowMs = clamp(
    Number((5000 + Math.max(0, params.baseState.signalSummary.executionReadinessScore < 65 ? 5000 : 2500)).toFixed(0)),
    5000,
    15000,
  );
  const verificationWindowMs = clamp(
    Number((2000 + Math.max(0, (100 - params.baseState.signalSummary.transportStability) * 60)).toFixed(0)),
    2000,
    8000,
  );
  const stabilizationWindowMs = clamp(
    Number((3000 + Math.max(0, (100 - params.baseState.signalSummary.heartbeatContinuity) * 65)).toFixed(0)),
    3000,
    8000,
  );
  const tickId = randomRuntimeTickId();
  const tickStartedAt = now;
  const tickHeartbeat = { value: now };
  let runtimeTickState: RuntimeIntelligenceState["runtimeTickState"] = "idle";
  let runtimeRecoveryState: RuntimeIntelligenceState["runtimeRecoveryState"] = "idle";
  const runtimeReasoning: string[] = [];
  const runtimeCooldownReasoning: string[] = [];
  const runtimeRecoveryReasoning: string[] = [];

  const playbackExecution = getPlaybackExecutionState(params.userId);
  const hardBlockers = evaluateRuntimeHardBlockers({
    state: params.baseState as RuntimeIntelligenceState,
    mutationState: playbackExecution.mutationState,
    transportAuthState: authContinuity.state.transportAuthState === "healthy" ? "healthy" : "degraded",
  });
  if (!authContinuity.ok) {
    hardBlockers.push("expired_auth");
  }

  runtimeTickState = tickTransition({
    tickHeartbeat,
    nextState: "evaluating",
    detail: "Runtime tick evaluated deterministic supervised inputs.",
    runtimeReasoning,
  });

  if (params.operatorInterrupt) {
    runtimeTickState = tickTransition({
      tickHeartbeat,
      nextState: "failed",
      detail: "Runtime tick interrupted by operator request.",
      runtimeReasoning,
    });
    runtimeRecoveryState = "failed";
  } else if (hardBlockers.length > 0) {
    runtimeTickState = tickTransition({
      tickHeartbeat,
      nextState: "failed",
      detail: `Stabilization blocked due to hard safety gate: ${hardBlockers.join(", ")}.`,
      runtimeReasoning,
    });
    runtimeRecoveryState = "failed";
  } else {
    runtimeTickState = tickTransition({
      tickHeartbeat,
      nextState: "stabilizing",
      detail: "Runtime stabilization pass verified transport, freshness, and rollback safety.",
      runtimeReasoning,
    });

    const stabilizationIssues: string[] = [];
    if (params.baseState.signalSummary.transportStability < 55) stabilizationIssues.push("transport_stability_degraded");
    if (params.baseState.signalSummary.heartbeatContinuity < 60) stabilizationIssues.push("heartbeat_continuity_degraded");
    if (params.baseState.signalSummary.playbackFreshness === "expired") stabilizationIssues.push("playback_freshness_expired");
    if (
      params.baseState.signalSummary.recommendationFreshness === "expired" ||
      params.baseState.signalSummary.recommendationFreshness === "stale"
    ) {
      stabilizationIssues.push("recommendation_freshness_degraded");
    }
    if ((playbackExecution.rollbackIntegrity ?? 0) < 45) stabilizationIssues.push("rollback_integrity_low");

    if (stabilizationIssues.length > 0) {
      runtimeTickState = tickTransition({
        tickHeartbeat,
        nextState: "recovering",
        detail: `Recovery triggered by stabilization issues: ${stabilizationIssues.join(", ")}.`,
        runtimeReasoning,
      });
      runtimeRecoveryState = "active";
      refreshPlaybackHeartbeat(params.userId);
      refreshDeviceHeartbeat(params.userId);
      refreshQueueHeartbeat(params.userId);
      const recommendationRecovery = await refreshRecommendationFreshnessTimestamps({
        userId: params.userId,
        activeDeviceHealthy: params.baseState.signalSummary.synchronizationHealth !== "critical",
      });
      runtimeRecoveryReasoning.push(
        recommendationRecovery.state === "refreshed"
          ? "Recommendation freshness refreshed during bounded runtime recovery pass."
          : recommendationRecovery.state === "noop"
            ? "Recommendation freshness recovery pass completed without required updates."
            : "Recommendation freshness recovery failed or skipped due to safety conditions.",
      );
      runtimeRecoveryReasoning.push("Telemetry heartbeat refreshed once during bounded recovery.");
      runtimeRecoveryState =
        recommendationRecovery.state === "failed" ? "failed" : ("completed" as RuntimeIntelligenceState["runtimeRecoveryState"]);
    }

    const cooldownActive = now < (existing?.nextMutationEligibleAt ?? 0);
    const verificationSettling = now < (existing?.verificationSettledUntil ?? 0);
    const mutationSessionActive =
      playbackExecution.mutationState === "preparing" ||
      playbackExecution.mutationState === "validating" ||
      playbackExecution.mutationState === "mutating" ||
      playbackExecution.mutationState === "verifying";
    const authHealthy = playbackExecution.transportAuthState !== "degraded";
    const transportStabilized = params.baseState.signalSummary.transportStability >= 58;
    const rollbackAcceptable = (playbackExecution.rollbackIntegrity ?? 0) >= 45;
    const executionAllowed =
      !cooldownActive &&
      !verificationSettling &&
      !mutationSessionActive &&
      authHealthy &&
      transportStabilized &&
      rollbackAcceptable;
    if (!executionAllowed) {
      runtimeReasoning.push("Runtime execution blocked by deterministic execution gate conditions.");
      if (cooldownActive) runtimeCooldownReasoning.push("Mutation cooldown active; suppressing repeated mutation attempts.");
      if (verificationSettling) runtimeCooldownReasoning.push("Verification settle window active; awaiting transport settling.");
      if (mutationSessionActive) runtimeCooldownReasoning.push("Mutation session already active; avoiding overlap.");
      if (!authHealthy) runtimeCooldownReasoning.push("Transport auth degraded; execution blocked.");
      if (!transportStabilized) runtimeCooldownReasoning.push("Transport stabilization below execution threshold.");
      if (!rollbackAcceptable) runtimeCooldownReasoning.push("Rollback integrity below supervised threshold.");
    } else {
      runtimeTickState = tickTransition({
        tickHeartbeat,
        nextState: "executing",
        detail: "Runtime tick executed under supervised deterministic gating.",
        runtimeReasoning,
      });
      runtimeTickState = tickTransition({
        tickHeartbeat,
        nextState: "verifying",
        detail: "Runtime tick entered bounded verification settle window.",
        runtimeReasoning,
      });
    }

    runtimeTickState = tickTransition({
      tickHeartbeat,
      nextState: "cooldown",
      detail: "Runtime cooldown activated to preserve transport continuity.",
      runtimeReasoning,
    });
    runtimeCooldownReasoning.push("Cooldown window applied to prevent queue mutation spam and allow transport settling.");
    runtimeTickState = tickTransition({
      tickHeartbeat,
      nextState: "completed",
      detail: "Runtime tick completed cleanly.",
      runtimeReasoning,
    });
  }

  const tickCompletedAt = Date.now();
  const nextMutationEligibleAt = tickCompletedAt + cooldownWindowMs;
  const verificationSettledUntil = tickCompletedAt + verificationWindowMs;
  const runtimeCooldownRemainingMs = Math.max(0, nextMutationEligibleAt - Date.now());
  const runtimeTickContinuity = Number(
    clamp(
      params.baseState.stability.value * 0.45 +
        params.baseState.signalSummary.heartbeatContinuity * 0.25 +
        params.baseState.signalSummary.transportStability * 0.2 +
        (runtimeTickState === "completed" ? 10 : -18),
      0,
      100,
    ).toFixed(2),
  );
  runtimeTickStore.set(params.userId, {
    nextMutationEligibleAt,
    verificationSettledUntil,
    cadenceMs,
    lastTickId: tickId,
    lastTickCompletedAt: tickCompletedAt,
    lastTickState: runtimeTickState,
    lastTickHeartbeatAt: tickHeartbeat.value,
    lastRuntimeReasoning: runtimeReasoning.slice(-8),
    lastCooldownReasoning: runtimeCooldownReasoning.slice(-6),
    lastRecoveryReasoning: runtimeRecoveryReasoning.slice(-6),
  });

  return {
    runtimeTickId: tickId,
    runtimeTickStartedAt: tickStartedAt,
    runtimeTickCompletedAt: tickCompletedAt,
    runtimeTickHeartbeatAt: tickHeartbeat.value,
    runtimeTickState,
    runtimeTickContinuity,
    runtimeCooldownRemainingMs,
    runtimeRecoveryState,
    runtimeExecutionCadence: cadenceMs,
    runtimeVerificationWindow: verificationWindowMs,
    runtimeStabilizationWindow: stabilizationWindowMs,
    runtimeTickDurationMs: tickCompletedAt - tickStartedAt,
    runtimeReasoning: runtimeReasoning.slice(-8),
    runtimeCooldownReasoning: runtimeCooldownReasoning.slice(-6),
    runtimeRecoveryReasoning: runtimeRecoveryReasoning.slice(-6),
    transportAuthState: authContinuity.state.transportAuthState,
    accessTokenExpiresAt: authContinuity.state.accessTokenExpiresAt,
    lastSuccessfulRefreshAt: authContinuity.state.lastSuccessfulRefreshAt,
    refreshFailureCount: authContinuity.state.refreshFailureCount,
    authRecoveryReasoning: authContinuity.state.authRecoveryReasoning.slice(-6),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function loadQueueRecommendationsForUser(
  userId: string,
): Promise<QueueRecommendationWithMeta[]> {
  const supabase = await createSupabaseServerClient();
  const { data: plansData, error: plansError } = await supabase
    .from("event_plans")
    .select(
      "id,event_id,user_id,timeline,energy_progression,recommended_genres,starter_playlist,created_at,events!inner(event_name,event_type,event_date,start_time,end_time,crowd_size)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (plansError) throw new Error(plansError.message);

  const plans =
    plansData?.map((row) => {
      const relatedEvent = normalizeRelation(row.events);

      return {
        id: row.id,
        eventId: row.event_id,
        eventName: relatedEvent?.event_name ?? "",
        eventType: relatedEvent?.event_type ?? "",
        eventDate: relatedEvent?.event_date ?? "",
        startTime: relatedEvent?.start_time ?? "",
        endTime: relatedEvent?.end_time ?? "",
        crowdSize: relatedEvent?.crowd_size ?? 0,
        timeline: row.timeline,
        energyProgression: row.energy_progression,
        recommendedGenres: row.recommended_genres,
        starterPlaylist: row.starter_playlist,
        createdAt: row.created_at,
      };
    }) ?? [];

  const { data: snapshotsData } = await supabase
    .from("queue_snapshots")
    .select("id,event_plan_id,created_at,queue_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const snapshotsByPlan = new Map<
    string,
    { latestSnapshotId: string; latestGeneratedAt: string; queueData: QueueRecommendationWithMeta; count: number }
  >();
  for (const snapshot of snapshotsData ?? []) {
    const existing = snapshotsByPlan.get(snapshot.event_plan_id);
    if (existing) {
      snapshotsByPlan.set(snapshot.event_plan_id, { ...existing, count: existing.count + 1 });
      continue;
    }
    snapshotsByPlan.set(snapshot.event_plan_id, {
      latestSnapshotId: snapshot.id,
      latestGeneratedAt: snapshot.created_at,
      queueData: snapshot.queue_data as QueueRecommendationWithMeta,
      count: 1,
    });
  }

  const provider = createQueueEngineProvider();
  const recommendations: QueueRecommendationWithMeta[] = [];
  for (const plan of plans) {
    const snapshotMeta = snapshotsByPlan.get(plan.id);
    const generated = await provider.generateFromPlan(plan);
    recommendations.push({
      ...(snapshotMeta?.queueData ?? generated),
      latestSnapshotId: snapshotMeta?.latestSnapshotId ?? null,
      latestGeneratedAt: snapshotMeta?.latestGeneratedAt ?? null,
      queueVersionCount: snapshotMeta?.count ?? 0,
      spotifyEnhancedRecommendations: (snapshotMeta?.queueData as QueueRecommendationWithMeta | undefined)
        ?.spotifyEnhancedRecommendations,
    });
  }
  return recommendations;
}

export async function evaluateRuntimeIntelligence(params: {
  userId: string;
  assistedAutonomousEnabled?: boolean;
  operatorInterrupt?: boolean;
}) {
  touchRuntimeHeartbeat(params.userId, { source: "runtime_coordinator_start" });
  const queueRecommendations = await loadQueueRecommendationsForUser(params.userId);
  const [
    autonomousState,
    transitionEvaluation,
    crowdSummary,
    audioState,
    playbackState,
    recommendationDiagnostics,
    spotifyServingState,
    runtimeMemoryPatterns,
  ] = await Promise.all([
    Promise.resolve(getAutonomousLoopState(params.userId)),
    evaluateTransitionEngine({
      userId: params.userId,
      queueRecommendations,
      assistedAutonomousEnabled: params.assistedAutonomousEnabled ?? false,
    }),
    getCrowdFeedbackSummary({ userId: params.userId, limit: 80 }),
    getAudioEnvironmentState({ userId: params.userId, limit: 40 }),
    getPlaybackOrchestrationState(params.userId),
    serveRecommendationDiagnostics(params.userId),
    serveAiSpotifyRecommendations({
      userId: params.userId,
      forceRefresh: false,
    }),
    getRuntimeMemoryPatterns({ userId: params.userId, limit: 40 }),
  ]);
  const memoryBias = computeLearnedOrchestrationBias(runtimeMemoryPatterns);
  const playbackActive = Boolean(playbackState.playbackState?.isPlaying);
  if (playbackActive) refreshPlaybackHeartbeat(params.userId);
  if (playbackState.activeDevice) refreshDeviceHeartbeat(params.userId);
  refreshQueueHeartbeat(params.userId);
  const telemetryHeartbeat = evaluateTelemetryFreshness(params.userId);

  const recommendationFreshness =
    recommendationDiagnostics.items[0]?.freshness ?? ("unknown" as const);
  const recommendationHealth =
    recommendationFreshness === "fresh"
      ? 90
      : recommendationFreshness === "stale"
        ? 65
        : recommendationFreshness === "expired"
          ? 30
          : 45;
  const playbackConsistency = playbackState.activeDevice && playbackState.playbackState ? 88 : 35;
  const transitionConfidence = transitionEvaluation.confidence.score;
  const crowdTrust = crowdSummary.transitionTrustScore;
  const audioEngagement = audioState.engagement.engagementScore;

  const unifiedConfidenceValue = clamp(
    Number(
      (
        transitionConfidence * 0.3 +
        crowdTrust * 0.22 +
        audioEngagement * 0.2 +
        recommendationHealth * 0.14 +
        playbackConsistency * 0.14 +
        memoryBias.confidenceBias * 0.1
      ).toFixed(2),
    ),
    0,
    100,
  );
  const unifiedConfidence: RuntimeConfidenceScore = {
    unifiedConfidence: unifiedConfidenceValue,
    components: {
      transitionConfidence,
      crowdTrust,
      audioEngagement,
      recommendationHealth,
      playbackConsistency,
    },
    rawOrchestrationConfidence: unifiedConfidenceValue,
    calibratedConfidence: unifiedConfidenceValue,
    confidenceAdjustmentDelta: 0,
    confidenceReliability: 50,
  };

  const activeRiskFactors: string[] = [];
  if (transitionEvaluation.riskLevel === "high") activeRiskFactors.push("High transition risk");
  if (audioState.drift.silenceDetected) activeRiskFactors.push("Audio silence/drop detected");
  if (audioState.drift.spikeDetected) activeRiskFactors.push("Audio spike instability");
  if (crowdSummary.operatorInterventionRate > 65) activeRiskFactors.push("Frequent manual interventions");
  if (recommendationFreshness !== "fresh") activeRiskFactors.push("Recommendation freshness degraded");
  if (!playbackState.activeDevice) activeRiskFactors.push("Playback device desync");
  if (transitionEvaluation.executionReadiness === "blocked")
    activeRiskFactors.push("Execution readiness blocked");
  if (transitionEvaluation.executionWindowState === "expired_window")
    activeRiskFactors.push("Execution window expired");
  if (transitionEvaluation.rollbackReadiness < 42)
    activeRiskFactors.push("Rollback safety insufficient");
  if (autonomousState.safetyStatus?.safeToExecute === false) activeRiskFactors.push("Autonomous safety blocked");

  const signalConflicts: string[] = [];
  if (transitionEvaluation.decision.rampEnergy && audioState.drift.spikeDetected) {
    signalConflicts.push("Transition wants ramp while audio detects spike");
  }
  if (transitionEvaluation.decision.cooldownEnergy && crowdSummary.energyAdaptationTrend > 0.6) {
    signalConflicts.push("Cooldown recommendation conflicts with rising crowd energy trend");
  }
  if (transitionEvaluation.decision.shouldTransition && recommendationFreshness === "expired") {
    signalConflicts.push("Transition suggested with stale recommendation intelligence");
  }
  if (transitionEvaluation.executionBlockers.includes("stale_telemetry")) {
    signalConflicts.push("Execution blocked due to stale playback telemetry");
  }
  if (telemetryHeartbeat.playbackFreshness === "stale" || telemetryHeartbeat.deviceFreshness === "stale") {
    signalConflicts.push("Heartbeat freshness degrading; recovery required.");
  }
  if (telemetryHeartbeat.playbackFreshness === "expired" || telemetryHeartbeat.deviceFreshness === "expired") {
    signalConflicts.push("Heartbeat freshness expired; continuity risk elevated.");
  }
  if (transitionEvaluation.deviceSynchronizationConfidence < 50) {
    signalConflicts.push("Device synchronization unstable");
  }

  const stabilityReasons: string[] = [];
  let stability = 84;
  stability -= activeRiskFactors.length * 8;
  stability -= signalConflicts.length * 7;
  if (autonomousState.status === "running" && autonomousState.safetyStatus?.safeToExecute) stability += 4;
  if (spotifyServingState.served.some((item) => item.source === "live")) stability += 2;
  stability += memoryBias.transitionBias * 0.35;
  stability = clamp(stability, 0, 100);
  if (activeRiskFactors.length === 0) stabilityReasons.push("No major risk factors detected.");
  else stabilityReasons.push(...activeRiskFactors);

  const autonomyReadiness = clamp(
    Number(
      (
        unifiedConfidenceValue * 0.55 +
        stability * 0.35 +
        (autonomousState.safetyStatus?.safeToExecute ? 10 : 0) +
        memoryBias.transitionBias * 0.2
      ).toFixed(2),
    ),
    0,
    100,
  );

  const orchestrationPriority: RuntimeCoordinationDecision["orchestrationPriority"] =
    telemetryHeartbeat.playbackFreshness === "expired" || telemetryHeartbeat.deviceFreshness === "expired"
      ? "restore_heartbeat"
      : telemetryHeartbeat.playbackFreshness === "stale" || telemetryHeartbeat.deviceFreshness === "stale"
        ? "stabilize_freshness"
        : transitionEvaluation.graceStabilizationActive
          ? "preserve_execution_continuity"
    : transitionEvaluation.executionReadiness === "blocked"
      ? "hold_execution"
      : transitionEvaluation.executionWindowState === "expired_window"
        ? "refresh_transport_state"
        : transitionEvaluation.executionWindowState === "unstable_window"
          ? "recover_playback_sync"
          : transitionEvaluation.executionWindowState === "narrow_window" &&
              transitionEvaluation.executionPlan.targetTrackId
            ? "prepare_queue"
      : transitionEvaluation.executionReadiness === "guarded"
        ? "stabilize_signals"
        : !playbackState.playbackState
          ? "refresh_playback_state"
          : !playbackState.activeDevice
            ? "restore_device_sync"
            : transitionEvaluation.executionReadiness === "prepare"
              ? "prepare_transition_window"
              : signalConflicts.length > 0
      ? "stabilize_signals"
      : recommendationFreshness !== "fresh"
        ? "refresh_recommendations"
        : transitionEvaluation.decision.shouldTransition && autonomyReadiness >= 70
          ? "prepare_transition"
          : "maintain_current_state";

  const operatorInterventions: string[] = [];
  if (orchestrationPriority === "stabilize_signals")
    operatorInterventions.push("Review conflicting signals before next autonomous action.");
  if (orchestrationPriority === "refresh_recommendations")
    operatorInterventions.push("Refresh recommendation telemetry and queue intelligence.");
  if (orchestrationPriority === "restore_heartbeat")
    operatorInterventions.push("Restore telemetry heartbeat continuity with bounded refresh.");
  if (orchestrationPriority === "stabilize_freshness")
    operatorInterventions.push("Stabilize playback/device freshness before hard execution degradation.");
  if (orchestrationPriority === "preserve_execution_continuity")
    operatorInterventions.push("Preserve execution continuity under active playback grace stabilization.");
  if (orchestrationPriority === "refresh_transport_state")
    operatorInterventions.push("Refresh transport telemetry prior to queue mutation.");
  if (orchestrationPriority === "prepare_queue")
    operatorInterventions.push("Prepare queue mutation under supervised readiness checks.");
  if (orchestrationPriority === "recover_playback_sync")
    operatorInterventions.push("Recover playback synchronization before transition preparation.");
  if (orchestrationPriority === "refresh_playback_state")
    operatorInterventions.push("Refresh playback telemetry before transition preparation.");
  if (orchestrationPriority === "restore_device_sync")
    operatorInterventions.push("Restore active playback device synchronization.");
  if (orchestrationPriority === "hold_execution")
    operatorInterventions.push("Hold execution until readiness blockers clear.");
  if (orchestrationPriority === "prepare_transition_window")
    operatorInterventions.push("Prepare transition window cues before execution.");
  if (!playbackState.activeDevice)
    operatorInterventions.push("Sync Spotify playback device before executing transitions.");
  if (crowdSummary.operatorInterventionRate > 65)
    operatorInterventions.push("Keep manual override active due to high intervention rate.");

  const playbackFreshness: RuntimeSignalSummary["playbackFreshness"] = !playbackState.playbackState
    ? "expired"
    : recommendationFreshness === "expired"
      ? "stale"
      : recommendationFreshness === "fresh"
        ? "fresh"
        : "stale";
  const synchronizationHealth: RuntimeSignalSummary["synchronizationHealth"] =
    transitionEvaluation.deviceSynchronizationConfidence >= 72
      ? "healthy"
      : transitionEvaluation.deviceSynchronizationConfidence >= 50
        ? "degraded"
        : "critical";
  const readinessDegradation: RuntimeSignalSummary["readinessDegradation"] =
    transitionEvaluation.executionReadiness === "ready"
      ? "none"
      : transitionEvaluation.executionReadiness === "prepare"
        ? "watch"
        : "high";
  const crowdEnergyState = transitionEvaluation.crowdEnergyState;
  const crowdMomentumScore = transitionEvaluation.crowdMomentumScore;
  const crowdFatiguePressure = transitionEvaluation.crowdFatiguePressure;
  const crowdRecoveryState = transitionEvaluation.crowdRecoveryState;
  const crowdEngagementConfidence = transitionEvaluation.crowdEngagementConfidence;
  const crowdEnergyVolatility = transitionEvaluation.crowdEnergyVolatility;
  const crowdHypeSaturation = transitionEvaluation.crowdHypeSaturation;
  const crowdRecoveryConfidence = transitionEvaluation.crowdRecoveryConfidence;
  const crowdAdaptationConfidence = transitionEvaluation.crowdAdaptationConfidence;
  const narrativeFlowState = transitionEvaluation.narrativeFlowState;
  const narrativeMomentum = transitionEvaluation.narrativeMomentum;
  const narrativeTension = transitionEvaluation.narrativeTension;
  const narrativeRecoveryPressure = transitionEvaluation.narrativeRecoveryPressure;
  const narrativeContinuity = transitionEvaluation.narrativeContinuity;
  const narrativeEnergyArc = transitionEvaluation.narrativeEnergyArc;
  const narrativeFatigueRisk = transitionEvaluation.narrativeFatigueRisk;
  const narrativeProgressionConfidence = transitionEvaluation.narrativeProgressionConfidence;
  const narrativeJourneyAlignment = transitionEvaluation.narrativeJourneyAlignment;
  const narrativeResolutionConfidence = transitionEvaluation.narrativeResolutionConfidence;
  const cadenceState = transitionEvaluation.cadenceState;
  const cadenceDensity = transitionEvaluation.cadenceDensity;
  const cadenceAggression = transitionEvaluation.cadenceAggression;
  const cadenceRecoverySpacing = transitionEvaluation.cadenceRecoverySpacing;
  const cadenceEscalationPressure = transitionEvaluation.cadenceEscalationPressure;
  const cadenceBreathingRoom = transitionEvaluation.cadenceBreathingRoom;
  const cadenceStability = transitionEvaluation.cadenceStability;
  const cadenceAdaptationConfidence = transitionEvaluation.cadenceAdaptationConfidence;
  const cadenceFatigueLoad = transitionEvaluation.cadenceFatigueLoad;
  const cadenceNarrativeBalance = transitionEvaluation.cadenceNarrativeBalance;
  const orchestrationBalanceScore = transitionEvaluation.orchestrationBalanceScore;
  const orchestrationConflictPressure = transitionEvaluation.orchestrationConflictPressure;
  const orchestrationStability = transitionEvaluation.orchestrationStability;
  const orchestrationAlignment = transitionEvaluation.orchestrationAlignment;
  const orchestrationRecoveryPriority = transitionEvaluation.orchestrationRecoveryPriority;
  const orchestrationEscalationPriority = transitionEvaluation.orchestrationEscalationPriority;
  const orchestrationContinuityPriority = transitionEvaluation.orchestrationContinuityPriority;
  const orchestrationFatiguePriority = transitionEvaluation.orchestrationFatiguePriority;
  const orchestrationNarrativePriority = transitionEvaluation.orchestrationNarrativePriority;
  const orchestrationSynthesisConfidence = transitionEvaluation.orchestrationSynthesisConfidence;
  const initialPlaybackExecution = getPlaybackExecutionState(params.userId);
  const signalSummary: RuntimeSignalSummary = {
    autonomousLoopStatus: autonomousState.status,
    transitionRiskLevel: transitionEvaluation.riskLevel,
    crowdSentiment: crowdSummary.crowdSentiment,
    audioEngagement: audioEngagement,
    playbackSynced: Boolean(playbackState.activeDevice && playbackState.playbackState),
    recommendationFreshness,
    playbackFreshness,
    synchronizationHealth,
    executionReadiness: transitionEvaluation.executionReadiness,
    executionReadinessScore: Number(transitionEvaluation.executionReadinessScore.toFixed(2)),
    executionWindowState: transitionEvaluation.executionWindowState,
    transportStability: Number(transitionEvaluation.transportStability.toFixed(2)),
    deviceSynchronizationConfidence: Number(transitionEvaluation.deviceSynchronizationConfidence.toFixed(2)),
    executionBlockers: transitionEvaluation.executionBlockers,
    readinessDegradation,
    playbackFreshnessAgeMs: transitionEvaluation.playbackFreshnessAgeMs,
    heartbeatContinuity: transitionEvaluation.heartbeatContinuity,
    heartbeatDrift: transitionEvaluation.heartbeatDrift,
    freshnessRecoveryState: transitionEvaluation.freshnessRecoveryState,
    graceStabilizationActive: transitionEvaluation.graceStabilizationActive,
    safetyBlocked: autonomousState.safetyStatus?.safeToExecute === false,
    crowdEnergyState,
    crowdMomentumScore,
    crowdFatiguePressure,
    crowdRecoveryState,
    crowdEngagementConfidence,
    crowdEnergyVolatility,
    crowdHypeSaturation,
    crowdRecoveryConfidence,
    crowdAdaptationConfidence,
    narrativeFlowState,
    narrativeMomentum,
    narrativeTension,
    narrativeRecoveryPressure,
    narrativeContinuity,
    narrativeEnergyArc,
    narrativeFatigueRisk,
    narrativeProgressionConfidence,
    narrativeJourneyAlignment,
    narrativeResolutionConfidence,
    cadenceState,
    cadenceDensity,
    cadenceAggression,
    cadenceRecoverySpacing,
    cadenceEscalationPressure,
    cadenceBreathingRoom,
    cadenceStability,
    cadenceAdaptationConfidence,
    cadenceFatigueLoad,
    cadenceNarrativeBalance,
    orchestrationBalanceScore,
    orchestrationConflictPressure,
    orchestrationStability,
    orchestrationAlignment,
    orchestrationRecoveryPriority,
    orchestrationEscalationPriority,
    orchestrationContinuityPriority,
    orchestrationFatiguePriority,
    orchestrationNarrativePriority,
    orchestrationSynthesisConfidence,
    executionStabilityScore: initialPlaybackExecution.executionStabilityScore ?? 0,
    transportIntegrityScore: initialPlaybackExecution.transportIntegrityScore ?? 0,
    mutationRecoverabilityScore: initialPlaybackExecution.mutationRecoverabilityScore ?? 0,
    executionHealthClassification: initialPlaybackExecution.executionHealthClassification ?? "stabilizing",
    degradationSeverity: initialPlaybackExecution.degradationSeverity ?? "none",
    graceState: initialPlaybackExecution.graceState ?? "inactive",
    graceFailure: initialPlaybackExecution.graceFailure ?? false,
  };

  const decision: RuntimeCoordinationDecision = {
    orchestrationPriority,
    activeRiskFactors,
    signalConflicts,
    operatorInterventions,
  };

  if (recommendationFreshness !== "fresh") {
    markStaleState(params.userId, "Runtime coordinator detected recommendation freshness degradation.", {
      recommendationFreshness,
    });
  }
  const reliability = getRuntimeReliabilityState({
    userId: params.userId,
    playbackSynced: Boolean(playbackState.activeDevice && playbackState.playbackState),
    staleSignal: recommendationFreshness !== "fresh",
  });

  void storeRuntimeMemoryPattern({
    userId: params.userId,
    patternType: "engagement_pattern",
    patternContext: signalSummary.recommendationFreshness,
    successScore: unifiedConfidenceValue,
    confidenceScore: stability,
    learnedSignals: [
      {
        source: "runtime_coordinator",
        signal: "orchestration_stability",
        value: stability / 100,
        weight: 0.9,
        polarity: stability >= 70 ? "positive" : "negative",
      },
      {
        source: "runtime_coordinator",
        signal: "autonomy_readiness",
        value: autonomyReadiness / 100,
        weight: 0.8,
        polarity: autonomyReadiness >= 65 ? "positive" : "neutral",
      },
      {
        source: "runtime_coordinator",
        signal: "execution_readiness",
        value: transitionEvaluation.executionReadinessScore / 100,
        weight: 0.86,
        polarity: transitionEvaluation.executionReadiness === "ready" ? "positive" : "neutral",
      },
      {
        source: "runtime_coordinator",
        signal: "device_sync_stability",
        value: transitionEvaluation.deviceSynchronizationConfidence / 100,
        weight: 0.72,
        polarity: transitionEvaluation.deviceSynchronizationConfidence >= 60 ? "positive" : "negative",
      },
      {
        source: "crowd_feedback",
        signal: "crowd_sentiment",
        value: crowdSummary.crowdSentiment / 100,
        weight: 0.7,
        polarity: crowdSummary.crowdSentiment >= 55 ? "positive" : "negative",
      },
    ],
    reinforce: unifiedConfidenceValue >= 70 && stability >= 68,
  }).catch(() => {});

  const baseState = {
    timestamp: new Date().toISOString(),
    unifiedConfidence,
    stability: {
      value: Number(stability.toFixed(2)),
      reasons: stabilityReasons,
    },
    autonomyReadiness,
    signalSummary,
    decision,
    learnedMemoryInfluence: memoryBias,
    reliability,
  };
  const runtimeTick = await executeSupervisedRuntimeTick({
    userId: params.userId,
    baseState,
    operatorInterrupt: params.operatorInterrupt ?? false,
  });
  const playbackExecution = getPlaybackExecutionState(params.userId);
  const convergenceAudit = evaluateRuntimeConvergence({
    userId: params.userId,
    signalSummary,
    runtimeTick,
    playbackExecution,
  });
  const calibration = evaluateRuntimeBehaviorCalibration({
    userId: params.userId,
    signalSummary,
    convergenceAudit,
    playbackExecution,
    runtimeTick,
  });
  const sessionAudit = evaluateRuntimeSessionAudit({
    userId: params.userId,
    signalSummary,
    convergenceAudit,
    calibration,
    playbackExecution,
    runtimeTick,
  });
  const confidenceCalibrationLayer = evaluateRuntimeConfidenceCalibrationLayer({
    userId: params.userId,
    rawOrchestrationConfidence: unifiedConfidenceValue,
    signalSummary,
    playbackExecution,
    convergenceAudit,
  });
  const recoveryIntelligenceLayer = evaluateRuntimeRecoveryIntelligenceLayer({
    signalSummary,
    playbackExecution,
    calibrationSnapshot: confidenceCalibrationLayer.snapshot,
    convergenceAudit: {
      ...convergenceAudit,
      runtimeConvergenceScore: confidenceCalibrationLayer.runtimeConvergenceScore,
      runtimeContinuityConfidence: confidenceCalibrationLayer.runtimeContinuityConfidence,
    },
  });
  const narrativeOrchestrationLayer = evaluateRuntimeNarrativeOrchestrationLayer({
    signalSummary,
    recoverySnapshot: recoveryIntelligenceLayer.snapshot,
    calibrationSnapshot: confidenceCalibrationLayer.snapshot,
    transitionEnergyFlowScore: transitionEvaluation.transitionDiagnostics.compatibilityEnergyFlowScore,
    transitionCompatibilityScore: transitionEvaluation.transitionDiagnostics.compatibilityScore,
    convergenceAudit,
    runtimeConvergenceScore: recoveryIntelligenceLayer.runtimeConvergenceScore,
    runtimeContinuityConfidence: recoveryIntelligenceLayer.runtimeContinuityConfidence,
  });
  const calibratedUnifiedConfidence: RuntimeConfidenceScore = {
    ...baseState.unifiedConfidence,
    rawOrchestrationConfidence: confidenceCalibrationLayer.snapshot.rawOrchestrationConfidence,
    calibratedConfidence: confidenceCalibrationLayer.snapshot.calibratedConfidence,
    confidenceAdjustmentDelta: confidenceCalibrationLayer.snapshot.confidenceAdjustmentDelta,
    confidenceReliability: confidenceCalibrationLayer.snapshot.confidenceReliability,
  };
  return {
    ...baseState,
    ...runtimeTick,
    transportAuthState: runtimeTick.transportAuthState,
    accessTokenExpiresAt: runtimeTick.accessTokenExpiresAt,
    lastSuccessfulRefreshAt: runtimeTick.lastSuccessfulRefreshAt,
    refreshFailureCount: runtimeTick.refreshFailureCount,
    authRecoveryReasoning: runtimeTick.authRecoveryReasoning,
    unifiedConfidence: calibratedUnifiedConfidence,
    runtimeConvergenceScore: narrativeOrchestrationLayer.runtimeConvergenceScore,
    runtimeStabilityTrend: convergenceAudit.runtimeStabilityTrend,
    runtimeDriftScore: convergenceAudit.runtimeDriftScore,
    runtimeRecoveryEffectiveness: convergenceAudit.runtimeRecoveryEffectiveness,
    runtimeVerificationSuccessRate: convergenceAudit.runtimeVerificationSuccessRate,
    runtimeMutationSuccessRate: convergenceAudit.runtimeMutationSuccessRate,
    runtimeDegradationPressure: convergenceAudit.runtimeDegradationPressure,
    runtimeContinuityConfidence: narrativeOrchestrationLayer.runtimeContinuityConfidence,
    convergenceHistory: convergenceAudit.convergenceHistory,
    degradationHistory: convergenceAudit.degradationHistory,
    recoveryHistory: convergenceAudit.recoveryHistory,
    mutationOutcomeHistory: convergenceAudit.mutationOutcomeHistory,
    verificationOutcomeHistory: convergenceAudit.verificationOutcomeHistory,
    verificationContinuity: playbackExecution.verificationContinuity ?? 0,
    verificationFreshnessConfidence: playbackExecution.verificationFreshnessConfidence ?? 0,
    verificationTransportLatency: playbackExecution.verificationTransportLatency ?? 0,
    verificationHeartbeatContinuity: playbackExecution.verificationHeartbeatContinuity ?? 0,
    verificationMutationConsistency: playbackExecution.verificationMutationConsistency ?? 0,
    verificationWindowIntegrity: playbackExecution.verificationWindowIntegrity ?? 0,
    verificationSnapshotReliability: playbackExecution.verificationSnapshotReliability ?? 0,
    verificationRecoveryConfidence: playbackExecution.verificationRecoveryConfidence ?? 0,
    verificationStabilizationConfidence: playbackExecution.verificationStabilizationConfidence ?? 0,
    verificationFailurePressure: playbackExecution.verificationFailurePressure ?? 0,
    verificationContinuityHistory: playbackExecution.verificationContinuityHistory ?? [],
    verificationLatencyHistory: playbackExecution.verificationLatencyHistory ?? [],
    verificationFreshnessHistory: playbackExecution.verificationFreshnessHistory ?? [],
    verificationIntegrityHistory: playbackExecution.verificationIntegrityHistory ?? [],
    verificationStabilizationSummary: playbackExecution.verificationStabilizationSummary ?? [],
    runtimeReasoning: [
      ...runtimeTick.runtimeReasoning,
      ...convergenceAudit.convergenceReasoning,
      ...confidenceCalibrationLayer.calibrationReasoning,
      ...recoveryIntelligenceLayer.recoveryReasoning,
      ...narrativeOrchestrationLayer.narrativeReasoning,
    ].slice(-16),
    crowdMomentumHistory: transitionEvaluation.crowdMomentumHistory,
    crowdFatigueHistory: transitionEvaluation.crowdFatigueHistory,
    crowdRecoveryHistory: transitionEvaluation.crowdRecoveryHistory,
    crowdVolatilityHistory: transitionEvaluation.crowdVolatilityHistory,
    crowdAdaptationSummary: transitionEvaluation.crowdAdaptationReasoning.slice(-6),
    narrativeMomentumHistory: transitionEvaluation.narrativeMomentumHistory,
    narrativeTensionHistory: transitionEvaluation.narrativeTensionHistory,
    narrativeRecoveryHistory: transitionEvaluation.narrativeRecoveryHistory,
    narrativeEnergyArcHistory: transitionEvaluation.narrativeEnergyArcHistory,
    narrativeReasoning: transitionEvaluation.narrativeReasoning.slice(-8),
    latestNarrativeState: transitionEvaluation.narrativeFlowState,
    latestNarrativeRisk: Number(
      clamp(
        transitionEvaluation.narrativeFatigueRisk * 0.55 +
          transitionEvaluation.narrativeRecoveryPressure * 0.45,
        0,
        100,
      ).toFixed(2),
    ),
    latestNarrativeMomentum: transitionEvaluation.narrativeMomentum,
    runtimeNarrativeSummary: transitionEvaluation.narrativeReasoning.slice(-6),
    cadenceDensityHistory: transitionEvaluation.cadenceDensityHistory,
    cadenceAggressionHistory: transitionEvaluation.cadenceAggressionHistory,
    cadenceRecoveryHistory: transitionEvaluation.cadenceRecoveryHistory,
    cadenceStabilityHistory: transitionEvaluation.cadenceStabilityHistory,
    cadenceSummary: transitionEvaluation.cadenceReasoning.slice(-6),
    orchestrationBalanceHistory: transitionEvaluation.orchestrationBalanceHistory,
    orchestrationConflictHistory: transitionEvaluation.orchestrationConflictHistory,
    orchestrationAlignmentHistory: transitionEvaluation.orchestrationAlignmentHistory,
    orchestrationStabilityHistory: transitionEvaluation.orchestrationStabilityHistory,
    orchestrationSynthesisSummary: transitionEvaluation.orchestrationSynthesisReasoning.slice(-6),
    runtimeCalibrationState: calibration.runtimeCalibrationState,
    runtimeBehaviorStability: calibration.runtimeBehaviorStability,
    runtimeAdaptationDrift: calibration.runtimeAdaptationDrift,
    runtimeFatigueAccumulation: calibration.runtimeFatigueAccumulation,
    runtimeRecoveryEfficiency: calibration.runtimeRecoveryEfficiency,
    runtimeNarrativeConsistency: calibration.runtimeNarrativeConsistency,
    runtimeCadenceConsistency: calibration.runtimeCadenceConsistency,
    runtimeEmotionalConsistency: calibration.runtimeEmotionalConsistency,
    runtimeCrowdAdaptationConsistency: calibration.runtimeCrowdAdaptationConsistency,
    runtimeCalibrationConfidence: calibration.runtimeCalibrationConfidence,
    runtimeBehaviorHistory: calibration.runtimeBehaviorHistory,
    runtimeFatigueHistory: calibration.runtimeFatigueHistory,
    runtimeRecoveryEfficiencyHistory: calibration.runtimeRecoveryEfficiencyHistory,
    runtimeConsistencyHistory: calibration.runtimeConsistencyHistory,
    runtimeCalibrationSummary: calibration.runtimeCalibrationSummary.slice(-6),
    confidenceCalibrationSnapshot: confidenceCalibrationLayer.snapshot,
    confidenceCalibrationSummary: confidenceCalibrationLayer.snapshot.calibration.calibrationReasoning.slice(-6),
    calibrationReliabilityScore: confidenceCalibrationLayer.snapshot.calibration.calibrationReliabilityScore,
    calibrationPressure: confidenceCalibrationLayer.snapshot.calibration.calibrationPressure,
    boundedConfidenceAdjustment: confidenceCalibrationLayer.snapshot.calibration.boundedConfidenceAdjustment,
    calibrationSeverity: confidenceCalibrationLayer.snapshot.calibration.calibrationSeverity,
    calibrationSeverityLabels: confidenceCalibrationLayer.snapshot.calibration.calibrationSeverityLabels,
    reliabilityTrendDirection: confidenceCalibrationLayer.snapshot.calibration.reliabilityTrendDirection,
    recoverySnapshot: recoveryIntelligenceLayer.snapshot,
    recoveryStrategy: recoveryIntelligenceLayer.snapshot.recommendation.plan.primaryStrategy,
    recoveryConfidence: recoveryIntelligenceLayer.snapshot.recommendation.confidence.recoveryConfidence,
    recoveryFeasibility: recoveryIntelligenceLayer.snapshot.recommendation.confidence.recoveryFeasibility,
    recoveryEscalationPressure: recoveryIntelligenceLayer.snapshot.recommendation.escalation.rollbackEscalationPressure,
    recoveryContinuityPreservation:
      recoveryIntelligenceLayer.snapshot.recommendation.continuity.continuityPreservationQuality,
    recoveryStabilityViability: recoveryIntelligenceLayer.snapshot.recommendation.confidence.stabilizationViability,
    recoveryRiskClassification: recoveryIntelligenceLayer.snapshot.recommendation.risk.riskClassification,
    recoverySummary: recoveryIntelligenceLayer.snapshot.recommendation.recoveryReasoning.slice(-6),
    narrativeSnapshot: narrativeOrchestrationLayer.snapshot,
    narrativeStability: narrativeOrchestrationLayer.snapshot.recommendation.narrativeStability,
    narrativeFatiguePressure: narrativeOrchestrationLayer.snapshot.recommendation.fatigue.fatiguePressure,
    narrativePacingContinuity: narrativeOrchestrationLayer.snapshot.recommendation.energyWave.pacingContinuity,
    narrativeMomentumStability: narrativeOrchestrationLayer.snapshot.recommendation.momentum.momentumStability,
    narrativeCooldownPressure: narrativeOrchestrationLayer.snapshot.recommendation.cooldownPressure,
    narrativeArcPreservation: narrativeOrchestrationLayer.snapshot.recommendation.continuity.arcPreservationScore,
    narrativeTransitionArcSafety: narrativeOrchestrationLayer.snapshot.recommendation.continuity.transitionArcSafety,
    narrativeRiskClassification: narrativeOrchestrationLayer.snapshot.recommendation.risk.riskClassification,
    narrativeOrchestrationSummary: narrativeOrchestrationLayer.snapshot.recommendation.orchestrationReasoning.slice(-6),
    sessionAuditId: sessionAudit.sessionAuditId,
    sessionStartedAt: sessionAudit.sessionStartedAt,
    sessionDurationMs: sessionAudit.sessionDurationMs,
    sessionRuntimeStability: sessionAudit.sessionRuntimeStability,
    sessionConvergenceScore: sessionAudit.sessionConvergenceScore,
    sessionFatiguePressure: sessionAudit.sessionFatiguePressure,
    sessionRecoveryEfficiency: sessionAudit.sessionRecoveryEfficiency,
    sessionMutationReliability: sessionAudit.sessionMutationReliability,
    sessionNarrativeConsistency: sessionAudit.sessionNarrativeConsistency,
    sessionCadenceConsistency: sessionAudit.sessionCadenceConsistency,
    sessionEmotionalConsistency: sessionAudit.sessionEmotionalConsistency,
    sessionCrowdAdaptationConsistency: sessionAudit.sessionCrowdAdaptationConsistency,
    sessionTransportReliability: sessionAudit.sessionTransportReliability,
    sessionBehaviorConfidence: sessionAudit.sessionBehaviorConfidence,
    sessionRuntimeHistory: sessionAudit.sessionRuntimeHistory,
    sessionMutationHistory: sessionAudit.sessionMutationHistory,
    sessionRecoveryHistory: sessionAudit.sessionRecoveryHistory,
    sessionConvergenceHistory: sessionAudit.sessionConvergenceHistory,
    sessionFatigueHistory: sessionAudit.sessionFatigueHistory,
    sessionAuditSummary: sessionAudit.sessionAuditSummary.slice(-6),
  } satisfies RuntimeIntelligenceState;
}

