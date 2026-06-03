"use client";

import { useEffect, useRef, useState } from "react";

type RuntimeState = {
  timestamp: string;
  unifiedConfidence: {
    unifiedConfidence: number;
    components: {
      transitionConfidence: number;
      crowdTrust: number;
      audioEngagement: number;
      recommendationHealth: number;
      playbackConsistency: number;
    };
    rawOrchestrationConfidence?: number;
    calibratedConfidence?: number;
    confidenceAdjustmentDelta?: number;
    confidenceReliability?: number;
  };
  stability: {
    value: number;
    reasons: string[];
  };
  autonomyReadiness: number;
  signalSummary: {
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
  };
  decision: {
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
  confidenceCalibrationSummary?: string[];
  calibrationReliabilityScore?: number;
  calibrationPressure?: number;
  boundedConfidenceAdjustment?: number;
  calibrationSeverity?: "low" | "moderate" | "high" | "critical";
  calibrationSeverityLabels?: string[];
  reliabilityTrendDirection?: "improving" | "stable" | "degrading";
  recoveryStrategy?: string;
  recoveryConfidence?: number;
  recoveryFeasibility?: number;
  recoveryEscalationPressure?: number;
  recoveryContinuityPreservation?: number;
  recoveryStabilityViability?: number;
  recoveryRiskClassification?: "low" | "moderate" | "high" | "critical";
  recoverySummary?: string[];
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

const PRIORITY_LABELS: Record<RuntimeState["decision"]["orchestrationPriority"], string> = {
  stabilize_signals: "Stabilize signals",
  restore_heartbeat: "Restore heartbeat",
  stabilize_freshness: "Stabilize freshness",
  preserve_execution_continuity: "Preserve execution continuity",
  refresh_transport_state: "Refresh transport state",
  prepare_queue: "Prepare queue",
  recover_playback_sync: "Recover playback sync",
  refresh_playback_state: "Refresh playback state",
  restore_device_sync: "Restore device sync",
  hold_execution: "Hold execution",
  prepare_transition_window: "Prepare transition window",
  refresh_recommendations: "Refresh recommendations",
  maintain_current_state: "Maintain current state",
  prepare_transition: "Prepare transition",
};

export function RuntimeIntelligenceCoordinatorPanel() {
  const [state, setState] = useState<RuntimeState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);

  async function refreshState() {
    if (isRefreshingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isRefreshingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/runtime-intelligence/state");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to load runtime intelligence.");
      if (isMountedRef.current) {
        setState(data.state ?? null);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load runtime intelligence.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }

  async function evaluateNow() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/runtime-intelligence/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistedAutonomousEnabled: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to evaluate runtime intelligence.");
      setState(data.state ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to evaluate runtime intelligence.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void refreshState();
    }, 0);
    const interval = setInterval(() => {
      void refreshState();
    }, 25000);
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const freshnessColor = (freshness: "fresh" | "stale" | "expired" | "unknown") =>
    freshness === "fresh"
      ? "text-emerald-200"
      : freshness === "stale"
        ? "text-orange-200"
        : freshness === "expired"
          ? "text-red-200"
          : "text-amber-200";

  return (
    <article
      id="runtime-intelligence-coordinator"
      className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Runtime Intelligence Coordinator</h2>
          <p className="mt-1 text-sm text-white/65">
            Unified runtime signal coordination for stable supervised orchestration decisions.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshState}
            disabled={isLoading}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Sync"}
          </button>
          <button
            onClick={evaluateNow}
            disabled={isLoading}
            className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
          >
            Evaluate
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
          <p className="text-xs uppercase tracking-widest text-white/60">Unified Confidence</p>
          <p className="mt-1 font-semibold">{state?.unifiedConfidence.unifiedConfidence ?? 0}</p>
          <p className="text-xs text-white/70">
            Raw {state?.unifiedConfidence.rawOrchestrationConfidence ?? state?.unifiedConfidence.unifiedConfidence ?? 0} | Calibrated{" "}
            {state?.unifiedConfidence.calibratedConfidence ?? state?.unifiedConfidence.unifiedConfidence ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Stability Score</p>
          <p className="mt-1 font-semibold">{state?.stability.value ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Autonomy Readiness</p>
          <p className="mt-1 font-semibold">{state?.autonomyReadiness ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Loop Status</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.autonomousLoopStatus ?? "stopped"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">Priority</p>
          <p className="mt-1 font-semibold">
            {state ? PRIORITY_LABELS[state.decision.orchestrationPriority] : "n/a"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Playback Freshness</p>
          <p className={`mt-1 font-semibold ${freshnessColor(state?.signalSummary.recommendationFreshness ?? "unknown")}`}>
            {state?.signalSummary.playbackFreshness ?? "n/a"}
          </p>
          <p className="text-xs text-white/70">
            Recommendation: {state?.signalSummary.recommendationFreshness ?? "n/a"} | Age:{" "}
            {Math.round((state?.signalSummary.playbackFreshnessAgeMs ?? 0) / 1000)}s
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Synchronization Health</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.synchronizationHealth ?? "n/a"}</p>
          <p className="text-xs text-white/70">
            Transport / Device: {state?.signalSummary.transportStability ?? 0} /{" "}
            {state?.signalSummary.deviceSynchronizationConfidence ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Execution Readiness</p>
          <p className="mt-1 font-semibold">
            {state?.signalSummary.executionReadiness ?? "n/a"} ({state?.signalSummary.executionReadinessScore ?? 0})
          </p>
          <p className="text-xs text-white/70">
            Window: {state?.signalSummary.executionWindowState ?? "n/a"} | Degradation:{" "}
            {state?.signalSummary.readinessDegradation ?? "none"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Runtime Tick State</p>
          <p className="mt-1 font-semibold">{state?.runtimeTickState ?? "idle"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Tick Continuity</p>
          <p className="mt-1 font-semibold">{state?.runtimeTickContinuity ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Cooldown Remaining</p>
          <p className="mt-1 font-semibold">
            {Math.max(0, Math.round((state?.runtimeCooldownRemainingMs ?? 0) / 1000))}s
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery State</p>
          <p className="mt-1 font-semibold">{state?.runtimeRecoveryState ?? "idle"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Cadence State</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.cadenceState ?? "balanced"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Cadence Density</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.cadenceDensity ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Cadence Aggression</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.cadenceAggression ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery Spacing</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.cadenceRecoverySpacing ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Breathing Room</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.cadenceBreathingRoom ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Runtime Stability</p>
          <p className="mt-1 font-semibold">{state?.sessionRuntimeStability ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Convergence</p>
          <p className="mt-1 font-semibold">{state?.sessionConvergenceScore ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Fatigue Pressure</p>
          <p className="mt-1 font-semibold">{state?.sessionFatiguePressure ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Recovery Efficiency</p>
          <p className="mt-1 font-semibold">{state?.sessionRecoveryEfficiency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Mutation Reliability</p>
          <p className="mt-1 font-semibold">{state?.sessionMutationReliability ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Narrative Consistency</p>
          <p className="mt-1">{state?.sessionNarrativeConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Cadence Consistency</p>
          <p className="mt-1">{state?.sessionCadenceConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Emotional Consistency</p>
          <p className="mt-1">{state?.sessionEmotionalConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Crowd Consistency</p>
          <p className="mt-1">{state?.sessionCrowdAdaptationConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Transport Reliability</p>
          <p className="mt-1">{state?.sessionTransportReliability ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Behavior Confidence</p>
          <p className="mt-1 font-semibold">{state?.sessionBehaviorConfidence ?? 0}</p>
          <p className="text-xs text-white/70">
            Audit ID: {state?.sessionAuditId ?? "n/a"} | Age: {Math.max(0, Math.round((state?.sessionDurationMs ?? 0) / 1000))}s
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Recovery Trends</p>
          <ul className="mt-2 space-y-1">
            {(state?.sessionRecoveryHistory ?? []).slice(-5).reverse().map((entry) => (
              <li key={`${entry.timestamp}-${entry.stabilizationSuccess}`}>
                - E:{entry.recoveryEfficiency.toFixed(1)} R:{entry.recoveryFrequency.toFixed(1)} C:{entry.cooldownFrequency.toFixed(1)}
              </li>
            ))}
            {(state?.sessionRecoveryHistory ?? []).length === 0 ? (
              <li className="text-white/60">No session recovery trends recorded.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Session Audit Summary</p>
          <ul className="mt-2 space-y-1">
            {(state?.sessionAuditSummary ?? []).slice(-6).map((reason, index) => (
              <li key={`${reason}-${index}`}>- {reason}</li>
            ))}
            {(state?.sessionAuditSummary ?? []).length === 0 ? (
              <li className="text-white/60">No session audit summary available yet.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Calibration State</p>
          <p className="mt-1 font-semibold">{state?.runtimeCalibrationState ?? "stabilizing"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Behavior Stability</p>
          <p className="mt-1 font-semibold">{state?.runtimeBehaviorStability ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Adaptation Drift</p>
          <p className="mt-1 font-semibold">{state?.runtimeAdaptationDrift ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Fatigue Accumulation</p>
          <p className="mt-1 font-semibold">{state?.runtimeFatigueAccumulation ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery Efficiency</p>
          <p className="mt-1 font-semibold">{state?.runtimeRecoveryEfficiency ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Consistency</p>
          <p className="mt-1">{state?.runtimeNarrativeConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Cadence Consistency</p>
          <p className="mt-1">{state?.runtimeCadenceConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Emotional Consistency</p>
          <p className="mt-1">{state?.runtimeEmotionalConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Adaptation Consistency</p>
          <p className="mt-1">{state?.runtimeCrowdAdaptationConsistency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Calibration Confidence</p>
          <p className="mt-1">{state?.runtimeCalibrationConfidence ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Balance</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.orchestrationBalanceScore ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Conflict Pressure</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.orchestrationConflictPressure ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Alignment</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.orchestrationAlignment ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Stability</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.orchestrationStability ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Synthesis Confidence</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.orchestrationSynthesisConfidence ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery Priority</p>
          <p className="mt-1">{state?.signalSummary.orchestrationRecoveryPriority ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Escalation Priority</p>
          <p className="mt-1">{state?.signalSummary.orchestrationEscalationPriority ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Continuity Priority</p>
          <p className="mt-1">{state?.signalSummary.orchestrationContinuityPriority ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Fatigue Priority</p>
          <p className="mt-1">{state?.signalSummary.orchestrationFatiguePriority ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Priority</p>
          <p className="mt-1">{state?.signalSummary.orchestrationNarrativePriority ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Cadence Stability</p>
          <p className="mt-1">{state?.signalSummary.cadenceStability ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Escalation Pressure</p>
          <p className="mt-1">{state?.signalSummary.cadenceEscalationPressure ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Fatigue Load</p>
          <p className="mt-1">{state?.signalSummary.cadenceFatigueLoad ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Balance</p>
          <p className="mt-1">{state?.signalSummary.cadenceNarrativeBalance ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Adaptation Confidence</p>
          <p className="mt-1">{state?.signalSummary.cadenceAdaptationConfidence ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Flow State</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.narrativeFlowState ?? "build"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Momentum</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.narrativeMomentum ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Tension</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.narrativeTension ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery Pressure</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.narrativeRecoveryPressure ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Continuity</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.narrativeContinuity ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Energy Arc</p>
          <p className="mt-1">{state?.signalSummary.narrativeEnergyArc ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Narrative Fatigue Risk</p>
          <p className="mt-1">{state?.signalSummary.narrativeFatigueRisk ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Progression Confidence</p>
          <p className="mt-1">{state?.signalSummary.narrativeProgressionConfidence ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Journey Alignment</p>
          <p className="mt-1">{state?.signalSummary.narrativeJourneyAlignment ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Resolution Confidence</p>
          <p className="mt-1">{state?.signalSummary.narrativeResolutionConfidence ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Energy State</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.crowdEnergyState ?? "stable"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Momentum</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.crowdMomentumScore ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Fatigue Pressure</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.crowdFatiguePressure ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Recovery Confidence</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.crowdRecoveryConfidence ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Engagement Confidence</p>
          <p className="mt-1">{state?.signalSummary.crowdEngagementConfidence ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Crowd Volatility</p>
          <p className="mt-1">{state?.signalSummary.crowdEnergyVolatility ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Hype Saturation</p>
          <p className="mt-1">{state?.signalSummary.crowdHypeSaturation ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Adaptation Confidence</p>
          <p className="mt-1">{state?.signalSummary.crowdAdaptationConfidence ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Convergence Score</p>
          <p className="mt-1 font-semibold">{state?.runtimeConvergenceScore ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Stability Trend</p>
          <p className="mt-1 font-semibold">{state?.runtimeStabilityTrend ?? "stable"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Degradation Pressure</p>
          <p className="mt-1 font-semibold">{state?.runtimeDegradationPressure ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Convergence Confidence</p>
          <p className="mt-1 font-semibold">{state?.runtimeContinuityConfidence ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Success Rate</p>
          <p className="mt-1">{state?.runtimeVerificationSuccessRate ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation Success Rate</p>
          <p className="mt-1">{state?.runtimeMutationSuccessRate ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery Effectiveness</p>
          <p className="mt-1">{state?.runtimeRecoveryEffectiveness ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Drift Score</p>
          <p className="mt-1">{state?.runtimeDriftScore ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Transport Auth State</p>
          <p className="mt-1 font-semibold">{state?.transportAuthState ?? "healthy"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Token Expiry Remaining</p>
          <p className="mt-1">
            {state?.accessTokenExpiresAt
              ? `${Math.max(0, Math.round((state.accessTokenExpiresAt - Date.now()) / 1000))}s`
              : "n/a"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Last Successful Refresh</p>
          <p className="mt-1">
            {state?.lastSuccessfulRefreshAt
              ? `${Math.max(0, Math.round((Date.now() - state.lastSuccessfulRefreshAt) / 1000))}s ago`
              : "n/a"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Refresh Failure Count</p>
          <p className="mt-1">{state?.refreshFailureCount ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Tick Cadence</p>
          <p className="mt-1">{Math.round((state?.runtimeExecutionCadence ?? 0) / 1000)}s</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Window</p>
          <p className="mt-1">{Math.round((state?.runtimeVerificationWindow ?? 0) / 1000)}s</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Stabilization Window</p>
          <p className="mt-1">{Math.round((state?.runtimeStabilizationWindow ?? 0) / 1000)}s</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Tick Duration</p>
          <p className="mt-1">{Math.max(0, Math.round((state?.runtimeTickDurationMs ?? 0) / 1000))}s</p>
          <p className="text-xs text-white/70">
            Heartbeat age:{" "}
            {state?.runtimeTickHeartbeatAt ? Math.max(0, Math.round((Date.now() - state.runtimeTickHeartbeatAt) / 1000)) : 0}s
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Heartbeat Continuity</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.heartbeatContinuity ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Heartbeat Drift</p>
          <p className="mt-1 font-semibold">{state?.signalSummary.heartbeatDrift ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Freshness Recovery</p>
          <p className="mt-1 font-semibold">
            {state?.signalSummary.freshnessRecoveryState ?? "stable"} | Grace:{" "}
            {state?.signalSummary.graceStabilizationActive ? "active" : "off"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Verification Continuity</p>
          <p className="mt-1 font-semibold">{state?.verificationContinuity ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Freshness Confidence</p>
          <p className="mt-1">{state?.verificationFreshnessConfidence ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Transport Latency</p>
          <p className="mt-1">{state?.verificationTransportLatency ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Heartbeat Continuity</p>
          <p className="mt-1">{state?.verificationHeartbeatContinuity ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Mutation Consistency</p>
          <p className="mt-1">{state?.verificationMutationConsistency ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Window Integrity</p>
          <p className="mt-1">{state?.verificationWindowIntegrity ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Snapshot Reliability</p>
          <p className="mt-1">{state?.verificationSnapshotReliability ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Recovery Confidence</p>
          <p className="mt-1">{state?.verificationRecoveryConfidence ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Stabilization Confidence</p>
          <p className="mt-1 font-semibold">{state?.verificationStabilizationConfidence ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Failure Pressure</p>
          <p className="mt-1 font-semibold">{state?.verificationFailurePressure ?? 0}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
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

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Active Risk Factors</p>
          <ul className="mt-2 space-y-1">
            {(state?.decision.activeRiskFactors ?? []).slice(0, 6).map((factor) => (
              <li key={factor}>- {factor}</li>
            ))}
            {(state?.decision.activeRiskFactors ?? []).length === 0 ? (
              <li className="text-white/60">No active risk factors.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Signal Conflicts</p>
          <ul className="mt-2 space-y-1">
            {(state?.decision.signalConflicts ?? []).slice(0, 6).map((conflict) => (
              <li key={conflict}>- {conflict}</li>
            ))}
            {(state?.decision.signalConflicts ?? []).length === 0 ? (
              <li className="text-white/60">No signal conflicts detected.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="text-xs uppercase tracking-widest text-amber-200/80">Execution Blockers</p>
          <ul className="mt-2 space-y-1">
            {(state?.signalSummary.executionBlockers ?? []).slice(0, 6).map((blocker) => (
              <li key={blocker}>- {blocker.replace(/_/g, " ")}</li>
            ))}
            {(state?.signalSummary.executionBlockers ?? []).length === 0 ? (
              <li className="text-amber-100/70">No active execution blockers.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-orange-400/25 bg-orange-500/10 p-3 text-sm text-orange-100">
          <p className="text-xs uppercase tracking-widest text-orange-200/80">Readiness Degradation</p>
          <p className="mt-1">
            {state?.signalSummary.readinessDegradation === "high"
              ? "High degradation: hold execution and restore synchronization."
              : state?.signalSummary.readinessDegradation === "watch"
                ? "Watch degradation: prepare transition window before execution."
                : "No readiness degradation detected."}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Operator Interventions</p>
        <ul className="mt-2 space-y-1">
          {(state?.decision.operatorInterventions ?? []).slice(0, 6).map((item) => (
            <li key={item}>- {item}</li>
          ))}
          {(state?.decision.operatorInterventions ?? []).length === 0 ? (
            <li className="text-white/60">No operator interventions suggested.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Runtime Reasoning</p>
          <ul className="mt-2 space-y-1">
            {(state?.runtimeReasoning ?? []).slice(-6).map((reason, index) => (
              <li key={`${reason}-${index}`}>- {reason}</li>
            ))}
            {(state?.runtimeReasoning ?? []).length === 0 ? (
              <li className="text-white/60">No runtime reasoning available yet.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Cooldown Reasoning</p>
          <ul className="mt-2 space-y-1">
            {(state?.runtimeCooldownReasoning ?? []).slice(-6).map((reason, index) => (
              <li key={`${reason}-${index}`}>- {reason}</li>
            ))}
            {(state?.runtimeCooldownReasoning ?? []).length === 0 ? (
              <li className="text-white/60">No cooldown reasoning available yet.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Recovery Reasoning</p>
          <ul className="mt-2 space-y-1">
            {(state?.runtimeRecoveryReasoning ?? []).slice(-6).map((reason, index) => (
              <li key={`${reason}-${index}`}>- {reason}</li>
            ))}
            {(state?.runtimeRecoveryReasoning ?? []).length === 0 ? (
              <li className="text-white/60">No recovery reasoning available yet.</li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
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

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Crowd Adaptation Summary</p>
        <ul className="mt-2 space-y-1">
          {(state?.crowdAdaptationSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.crowdAdaptationSummary ?? []).length === 0 ? (
            <li className="text-white/60">No crowd adaptation summary available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Runtime Narrative Snapshot</p>
        <p className="mt-1 text-xs text-white/70">
          State: {state?.latestNarrativeState ?? "build"} | Risk: {state?.latestNarrativeRisk ?? 0} | Momentum:{" "}
          {state?.latestNarrativeMomentum ?? 0}
        </p>
        <ul className="mt-2 space-y-1">
          {(state?.runtimeNarrativeSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.runtimeNarrativeSummary ?? []).length === 0 ? (
            <li className="text-white/60">No runtime narrative summary available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Adaptive Cadence Summary</p>
        <ul className="mt-2 space-y-1">
          {(state?.cadenceSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.cadenceSummary ?? []).length === 0 ? (
            <li className="text-white/60">No adaptive cadence summary available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Orchestration Synthesis Summary</p>
        <ul className="mt-2 space-y-1">
          {(state?.orchestrationSynthesisSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.orchestrationSynthesisSummary ?? []).length === 0 ? (
            <li className="text-white/60">No orchestration synthesis summary available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Runtime Calibration Summary</p>
        <ul className="mt-2 space-y-1">
          {(state?.runtimeCalibrationSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.runtimeCalibrationSummary ?? []).length === 0 ? (
            <li className="text-white/60">No runtime calibration summary available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Supervised Recovery Intelligence</p>
        <div className="mt-2 grid gap-2 text-xs text-white/70 md:grid-cols-4">
          <p>Strategy: {(state?.recoveryStrategy ?? "n/a").replace(/_/g, " ")}</p>
          <p>Feasibility: {state?.recoveryFeasibility?.toFixed(2) ?? "0.00"}</p>
          <p>Confidence: {state?.recoveryConfidence?.toFixed(2) ?? "0.00"}</p>
          <p>Escalation: {state?.recoveryEscalationPressure?.toFixed(2) ?? "0.00"}</p>
        </div>
        <p className="mt-1 text-xs text-white/65">
          Continuity preservation: {state?.recoveryContinuityPreservation?.toFixed(2) ?? "0.00"} | Stabilization viability:{" "}
          {state?.recoveryStabilityViability?.toFixed(2) ?? "0.00"} | Risk: {state?.recoveryRiskClassification ?? "n/a"}
        </p>
        <ul className="mt-2 space-y-1">
          {(state?.recoverySummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.recoverySummary ?? []).length === 0 ? (
            <li className="text-white/60">No supervised recovery reasoning available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Narrative Arc Orchestration</p>
        <div className="mt-2 grid gap-2 text-xs text-white/70 md:grid-cols-4">
          <p>Stability: {state?.narrativeStability?.toFixed(2) ?? "0.00"}</p>
          <p>Fatigue: {state?.narrativeFatiguePressure?.toFixed(2) ?? "0.00"}</p>
          <p>Pacing: {state?.narrativePacingContinuity?.toFixed(2) ?? "0.00"}</p>
          <p>Momentum: {state?.narrativeMomentumStability?.toFixed(2) ?? "0.00"}</p>
        </div>
        <p className="mt-1 text-xs text-white/65">
          Arc preservation: {state?.narrativeArcPreservation?.toFixed(2) ?? "0.00"} | Transition arc safety:{" "}
          {state?.narrativeTransitionArcSafety?.toFixed(2) ?? "0.00"} | Cooldown pressure:{" "}
          {state?.narrativeCooldownPressure?.toFixed(2) ?? "0.00"} | Risk: {state?.narrativeRiskClassification ?? "n/a"}
        </p>
        <ul className="mt-2 space-y-1">
          {(state?.narrativeOrchestrationSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.narrativeOrchestrationSummary ?? []).length === 0 ? (
            <li className="text-white/60">No narrative orchestration reasoning available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
        <p className="text-xs uppercase tracking-widest text-white/60">Confidence Calibration</p>
        <div className="mt-2 grid gap-2 text-xs text-white/70 md:grid-cols-4">
          <p>Reliability: {state?.calibrationReliabilityScore?.toFixed(2) ?? "0.00"}</p>
          <p>Pressure: {state?.calibrationPressure?.toFixed(2) ?? "0.00"}</p>
          <p>Adjustment: {state?.boundedConfidenceAdjustment?.toFixed(2) ?? "0.00"}</p>
          <p>Trend: {state?.reliabilityTrendDirection ?? "n/a"}</p>
        </div>
        <p className="mt-1 text-xs text-white/65">
          Severity: {state?.calibrationSeverity ?? "n/a"} | Delta: {state?.unifiedConfidence.confidenceAdjustmentDelta?.toFixed(2) ?? "0.00"} | Trustworthiness:{" "}
          {state?.unifiedConfidence.confidenceReliability?.toFixed(2) ?? "0.00"}
        </p>
        <ul className="mt-2 space-y-1">
          {(state?.confidenceCalibrationSummary ?? []).slice(-6).map((reason, index) => (
            <li key={`${reason}-${index}`}>- {reason}</li>
          ))}
          {(state?.confidenceCalibrationSummary ?? []).length === 0 ? (
            <li className="text-white/60">No confidence calibration reasoning available yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Degradation Events</p>
          <ul className="mt-2 space-y-1">
            {(state?.degradationHistory ?? []).slice(-5).reverse().map((entry) => (
              <li key={`${entry.timestamp}-${entry.event}`}>- {entry.event.replace(/_/g, " ")} (P:{entry.pressure})</li>
            ))}
            {(state?.degradationHistory ?? []).length === 0 ? (
              <li className="text-white/60">No degradation events recorded.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Recovery Events</p>
          <ul className="mt-2 space-y-1">
            {(state?.recoveryHistory ?? []).slice(-5).reverse().map((entry) => (
              <li key={`${entry.timestamp}-${entry.state}`}>- {entry.state} (E:{entry.effectiveness})</li>
            ))}
            {(state?.recoveryHistory ?? []).length === 0 ? (
              <li className="text-white/60">No recovery events recorded.</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/85">
          <p className="text-xs uppercase tracking-widest text-white/60">Latest Stabilized Sessions</p>
          <ul className="mt-2 space-y-1">
            {(state?.mutationOutcomeHistory ?? [])
              .filter((entry) => entry.outcome === "stabilized")
              .slice(-5)
              .reverse()
              .map((entry) => (
                <li key={`${entry.timestamp}-${entry.outcome}`}>- stabilized ({entry.confidence.toFixed(1)})</li>
              ))}
            {(state?.mutationOutcomeHistory ?? []).filter((entry) => entry.outcome === "stabilized").length === 0 ? (
              <li className="text-white/60">No stabilized sessions recorded.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </article>
  );
}

