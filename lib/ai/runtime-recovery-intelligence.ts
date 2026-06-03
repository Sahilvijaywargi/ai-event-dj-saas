import type { ConfidenceCalibrationSnapshot } from "@/lib/ai/runtime-confidence-calibration";

export type RuntimeRecoveryExecutionContext = {
  readonly executionStabilityScore?: number;
  readonly mutationVerification?: { readonly verificationScore?: number };
  readonly verificationConfidence?: number;
  readonly mutationVerificationConfidence?: number;
  readonly verificationHeartbeatContinuity?: number;
  readonly mutationRecoverabilityScore?: number;
  readonly rollbackIntegrity?: number;
  readonly rollbackConfidence?: number;
  readonly transportIntegrityScore?: number;
  readonly graceState?: "inactive" | "active" | "expired";
  readonly graceFailure?: boolean;
  readonly retriableVerificationFailure?: boolean;
  readonly degradationSeverity?: "none" | "low" | "moderate" | "high" | "critical";
  readonly executionHealthClassification?:
    | "stable"
    | "stabilizing"
    | "degraded"
    | "rollback_sensitive"
    | "verification_risk"
    | "transport_unstable"
    | "critical";
  readonly queueVerificationPassed?: boolean;
  readonly rollbackAllowed?: boolean;
  readonly mutationState?:
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
};

export type RuntimeRecoverySignalContext = {
  readonly executionReadinessScore: number;
  readonly executionStabilityScore?: number;
  readonly heartbeatContinuity: number;
  readonly transportStability: number;
  readonly deviceSynchronizationConfidence: number;
  readonly narrativeEnergyArc: number;
  readonly narrativeContinuity: number;
  readonly narrativeFatigueRisk: number;
  readonly narrativeRecoveryPressure: number;
  readonly narrativeTension: number;
  readonly narrativeResolutionConfidence: number;
  readonly crowdMomentumScore: number;
  readonly crowdEngagementConfidence: number;
  readonly cadenceEscalationPressure: number;
  readonly cadenceFatigueLoad: number;
  readonly orchestrationAlignment: number;
  readonly orchestrationStability: number;
  readonly orchestrationContinuityPriority: number;
  readonly graceState?: "inactive" | "active" | "expired";
  readonly graceFailure?: boolean;
  readonly degradationSeverity?: "none" | "low" | "moderate" | "high" | "critical";
  readonly executionHealthClassification?:
    | "stable"
    | "stabilizing"
    | "degraded"
    | "rollback_sensitive"
    | "verification_risk"
    | "transport_unstable"
    | "critical";
};

export type RecoveryStrategy =
  | "soft_reverification"
  | "delayed_transport_resync"
  | "queue_repair"
  | "safe_requeue"
  | "fallback_transition"
  | "stabilization_cooldown"
  | "energy_preserving_recovery"
  | "rollback_deferment"
  | "transport_reacquisition";

export type RecoveryClassification =
  | "recoverable"
  | "stabilization_viable"
  | "transport_fragile"
  | "rollback_sensitive"
  | "recovery_unstable"
  | "continuity_preserved"
  | "energy_sensitive"
  | "escalation_risk"
  | "critical_recovery_state";

export type RecoveryEscalationState = {
  readonly rollbackEscalationPressure: number;
  readonly rollbackRequired: boolean;
  readonly defermentViable: boolean;
  readonly escalationReasoning: readonly string[];
};

export type RecoveryExecutionWindow = {
  readonly windowState: "open" | "narrow" | "closing" | "closed";
  readonly safeRetryEligible: boolean;
  readonly remainingWindowMs: number;
  readonly windowReasoning: readonly string[];
};

export type RecoveryContinuityAnalysis = {
  readonly energyPreservationQuality: number;
  readonly transitionContinuityPreservation: number;
  readonly crowdMomentumPreservation: number;
  readonly emotionalContinuityPreservation: number;
  readonly fallbackTransitionCompatibility: number;
  readonly safeCooldownOpportunity: number;
  readonly continuityPreservationQuality: number;
  readonly continuityReasoning: readonly string[];
};

export type RecoveryRiskAssessment = {
  readonly furtherDegradationRisk: number;
  readonly rollbackEscalationLikelihood: number;
  readonly transportInstabilityRisk: number;
  readonly queueCorruptionRisk: number;
  readonly energyContinuityRisk: number;
  readonly synchronizationRecoveryLikelihood: number;
  readonly recoveryRiskScore: number;
  readonly riskClassification: "low" | "moderate" | "high" | "critical";
  readonly riskReasoning: readonly string[];
};

export type RecoveryConfidenceProfile = {
  readonly recoveryConfidence: number;
  readonly recoveryFeasibility: number;
  readonly stabilizationViability: number;
  readonly supervisionRequired: boolean;
};

export type RecoveryStrategyEvaluation = {
  readonly strategy: RecoveryStrategy;
  readonly strategyScore: number;
  readonly strategyReasoning: readonly string[];
  readonly eligible: boolean;
  readonly blockers: readonly string[];
};

export type RecoveryStabilizationResult = {
  readonly stabilizationViable: boolean;
  readonly stabilizationScore: number;
  readonly stabilizationReasoning: readonly string[];
};

export type RuntimeRecoveryPlan = {
  readonly timestamp: number;
  readonly primaryStrategy: RecoveryStrategy;
  readonly fallbackStrategies: readonly RecoveryStrategy[];
  readonly executionWindow: RecoveryExecutionWindow;
  readonly stabilization: RecoveryStabilizationResult;
  readonly strategyEvaluations: readonly RecoveryStrategyEvaluation[];
};

export type RecoveryRecommendation = {
  readonly plan: RuntimeRecoveryPlan;
  readonly confidence: RecoveryConfidenceProfile;
  readonly risk: RecoveryRiskAssessment;
  readonly continuity: RecoveryContinuityAnalysis;
  readonly escalation: RecoveryEscalationState;
  readonly classifications: readonly RecoveryClassification[];
  readonly recoveryReasoning: readonly string[];
};

export type RuntimeRecoverySnapshot = {
  readonly timestamp: number;
  readonly recommendation: RecoveryRecommendation;
};

const STRATEGY_ORDER: readonly RecoveryStrategy[] = [
  "soft_reverification",
  "delayed_transport_resync",
  "transport_reacquisition",
  "queue_repair",
  "safe_requeue",
  "stabilization_cooldown",
  "energy_preserving_recovery",
  "fallback_transition",
  "rollback_deferment",
];

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function evaluateStrategy(
  strategy: RecoveryStrategy,
  input: {
    executionStability: number;
    verificationScore: number;
    heartbeatContinuity: number;
    rollbackRecoverability: number;
    transportStability: number;
    graceActive: boolean;
    graceFailure: boolean;
    retriableVerification: boolean;
    mutationState: RuntimeRecoveryExecutionContext["mutationState"];
    degradationSeverity: RuntimeRecoveryExecutionContext["degradationSeverity"];
    healthClassification: RuntimeRecoveryExecutionContext["executionHealthClassification"];
    queueVerified: boolean;
    rollbackAllowed: boolean;
    energyPreservation: number;
    syncRecoveryLikelihood: number;
    compositeRisk: number;
  },
): RecoveryStrategyEvaluation {
  const blockers: string[] = [];
  let score = 0;
  const reasoning: string[] = [];

  if (strategy === "soft_reverification") {
    if (!input.retriableVerification) blockers.push("verification_not_retriable");
    if (input.verificationScore < 38) blockers.push("verification_score_too_low");
    score =
      (input.retriableVerification ? 42 : 0) +
      input.verificationScore * 0.28 +
      input.heartbeatContinuity * 0.2 +
      input.transportStability * 0.1;
    reasoning.push("Soft reverification re-checks queue integrity before rollback escalation.");
  }

  if (strategy === "delayed_transport_resync") {
    if (input.transportStability >= 72) blockers.push("transport_already_stable");
    if (input.heartbeatContinuity < 45) blockers.push("heartbeat_too_unstable_for_delayed_resync");
    score =
      (100 - input.transportStability) * 0.35 +
      input.syncRecoveryLikelihood * 0.3 +
      input.heartbeatContinuity * 0.2 +
      (input.graceActive ? 8 : 0);
    reasoning.push("Delayed transport resync waits for bounded propagation before rollback.");
  }

  if (strategy === "transport_reacquisition") {
    if (input.transportStability >= 60 && input.healthClassification !== "transport_unstable") {
      blockers.push("transport_reacquisition_unnecessary");
    }
    score =
      (100 - input.transportStability) * 0.4 +
      input.syncRecoveryLikelihood * 0.25 +
      input.rollbackRecoverability * 0.15 +
      input.heartbeatContinuity * 0.2;
    reasoning.push("Transport reacquisition restores device/transport ownership under supervision.");
  }

  if (strategy === "queue_repair") {
    if (input.queueVerified) blockers.push("queue_already_verified");
    if (input.verificationScore >= 72) blockers.push("verification_sufficient_for_queue");
    score =
      (100 - input.verificationScore) * 0.32 +
      input.executionStability * 0.22 +
      input.heartbeatContinuity * 0.18 +
      (input.mutationState === "degraded" || input.mutationState === "verifying" ? 18 : 8);
    reasoning.push("Queue repair attempts deterministic queue integrity restoration.");
  }

  if (strategy === "safe_requeue") {
    if (input.degradationSeverity === "critical") blockers.push("critical_state_blocks_requeue");
    if (!input.rollbackAllowed) blockers.push("rollback_not_allowed_for_safe_requeue");
    score =
      input.rollbackRecoverability * 0.28 +
      input.executionStability * 0.24 +
      input.verificationScore * 0.18 +
      input.transportStability * 0.2;
    reasoning.push("Safe requeue preserves supervised queue continuity with rollback snapshot intact.");
  }

  if (strategy === "stabilization_cooldown") {
    if (input.executionStability < 40) blockers.push("execution_too_unstable_for_cooldown");
    score =
      input.executionStability * 0.34 +
      (100 - input.compositeRisk) * 0.1 +
      input.heartbeatContinuity * 0.22 +
      (input.mutationState === "degraded" || input.mutationState === "verifying" ? 16 : 10);
    reasoning.push("Stabilization cooldown defers mutation pressure while continuity is preserved.");
  }

  if (strategy === "energy_preserving_recovery") {
    if (input.energyPreservation < 45) blockers.push("energy_continuity_too_fragile");
    score =
      input.energyPreservation * 0.42 +
      input.executionStability * 0.2 +
      input.heartbeatContinuity * 0.18 +
      (input.graceActive ? 10 : 0);
    reasoning.push("Energy-preserving recovery minimizes narrative/crowd disruption during stabilization.");
  }

  if (strategy === "fallback_transition") {
    if (input.executionStability < 50) blockers.push("execution_stability_insufficient_for_fallback");
    score =
      input.energyPreservation * 0.3 +
      input.executionStability * 0.28 +
      input.rollbackRecoverability * 0.22 +
      input.transportStability * 0.2;
    reasoning.push("Fallback transition offers lower-risk continuity when primary mutation path is fragile.");
  }

  if (strategy === "rollback_deferment") {
    if (!input.rollbackAllowed) blockers.push("rollback_gate_blocks_deferment");
    if (input.graceFailure) blockers.push("grace_expired_blocks_deferment");
    score =
      input.rollbackRecoverability * 0.3 +
      input.executionStability * 0.25 +
      input.verificationScore * 0.2 +
      (input.retriableVerification ? 14 : 0) +
      (input.healthClassification === "rollback_sensitive" ? 6 : 12);
    reasoning.push("Rollback deferment buys supervised recovery time while rollback remains final authority.");
  }

  const eligible = blockers.length === 0 && score >= 48;
  return {
    strategy,
    strategyScore: round(clamp(score)),
    strategyReasoning: Object.freeze(reasoning),
    eligible,
    blockers: Object.freeze(blockers),
  };
}

export function evaluateRuntimeRecovery(input: {
  signalSummary: RuntimeRecoverySignalContext;
  playbackExecution: RuntimeRecoveryExecutionContext;
  calibrationSnapshot?: ConfidenceCalibrationSnapshot;
  timestamp?: number;
}): RecoveryRecommendation {
  const timestamp = input.timestamp ?? Date.now();
  const executionStability =
    input.playbackExecution.executionStabilityScore ??
    input.signalSummary.executionStabilityScore ??
    input.signalSummary.executionReadinessScore;
  const verificationScore = round(
    clamp(
      input.playbackExecution.mutationVerification?.verificationScore ??
        input.playbackExecution.verificationConfidence ??
        input.playbackExecution.mutationVerificationConfidence ??
        0,
    ),
  );
  const heartbeatContinuity = round(
    clamp(
      input.playbackExecution.verificationHeartbeatContinuity ??
        input.signalSummary.heartbeatContinuity,
    ),
  );
  const rollbackRecoverability = round(
    clamp(
      input.playbackExecution.mutationRecoverabilityScore ??
        input.playbackExecution.rollbackIntegrity ??
        input.playbackExecution.rollbackConfidence ??
        0,
    ),
  );
  const transportStability = round(
    clamp(
      input.playbackExecution.transportIntegrityScore ?? input.signalSummary.transportStability,
    ),
  );
  const graceActive = (input.playbackExecution.graceState ?? input.signalSummary.graceState) === "active";
  const graceFailure = input.playbackExecution.graceFailure ?? input.signalSummary.graceFailure ?? false;
  const retriableVerification = input.playbackExecution.retriableVerificationFailure ?? false;
  const degradationSeverity = input.playbackExecution.degradationSeverity ?? input.signalSummary.degradationSeverity ?? "none";
  const healthClassification =
    input.playbackExecution.executionHealthClassification ?? input.signalSummary.executionHealthClassification ?? "stabilizing";
  const queueVerified = input.playbackExecution.queueVerificationPassed ?? false;
  const rollbackAllowed = input.playbackExecution.rollbackAllowed ?? true;
  const calibrationReliability = input.calibrationSnapshot?.confidenceReliability ?? 50;

  const energyPreservation = round(
    clamp(
      input.signalSummary.narrativeEnergyArc * 0.28 +
        input.signalSummary.crowdMomentumScore * 0.22 +
        (100 - input.signalSummary.narrativeFatigueRisk) * 0.2 +
        (100 - input.signalSummary.cadenceFatigueLoad) * 0.15 +
        input.signalSummary.narrativeContinuity * 0.15,
    ),
  );
  const syncRecoveryLikelihood = round(
    clamp(
      input.signalSummary.deviceSynchronizationConfidence * 0.4 +
        transportStability * 0.35 +
        heartbeatContinuity * 0.25,
    ),
  );

  const compositeRisk = round(clamp((100 - verificationScore) * 0.5 + (100 - transportStability) * 0.5));

  const strategyContext = {
    executionStability,
    verificationScore,
    heartbeatContinuity,
    rollbackRecoverability,
    transportStability,
    graceActive,
    graceFailure,
    retriableVerification,
    mutationState: input.playbackExecution.mutationState,
    degradationSeverity,
    healthClassification,
    queueVerified,
    rollbackAllowed,
    energyPreservation,
    syncRecoveryLikelihood,
    compositeRisk,
  };

  const strategyEvaluations = STRATEGY_ORDER.map((strategy) => evaluateStrategy(strategy, strategyContext));

  const eligibleStrategies = strategyEvaluations
    .filter((evaluation) => evaluation.eligible)
    .sort((left, right) => right.strategyScore - left.strategyScore);
  const primaryStrategy = eligibleStrategies[0]?.strategy ?? "stabilization_cooldown";
  const fallbackStrategies = eligibleStrategies.slice(1, 4).map((evaluation) => evaluation.strategy);

  const safeRetryEligible =
    retriableVerification &&
    !graceFailure &&
    degradationSeverity !== "critical" &&
    healthClassification !== "critical" &&
    heartbeatContinuity >= 52;
  const executionWindow: RecoveryExecutionWindow = {
    windowState:
      safeRetryEligible && executionStability >= 55
        ? "open"
        : executionStability >= 42
          ? "narrow"
          : graceFailure || degradationSeverity === "critical"
            ? "closed"
            : "closing",
    safeRetryEligible,
    remainingWindowMs:
      safeRetryEligible ? 8_000 : executionStability >= 42 ? 4_000 : graceFailure ? 0 : 2_000,
    windowReasoning: Object.freeze([
      safeRetryEligible
        ? "Safe retry window open under supervised reverification constraints."
        : "Retry window narrowed; recovery must remain operator-supervised.",
    ]),
  };

  const stabilizationScore = round(
    clamp(
      executionStability * 0.34 +
        verificationScore * 0.22 +
        heartbeatContinuity * 0.18 +
        rollbackRecoverability * 0.16 +
        calibrationReliability * 0.1,
    ),
  );
  const stabilization: RecoveryStabilizationResult = {
    stabilizationViable: stabilizationScore >= 52 && degradationSeverity !== "critical" && !graceFailure,
    stabilizationScore,
    stabilizationReasoning: Object.freeze([
      stabilizationScore >= 52
        ? "Stabilization remains viable before rollback escalation."
        : "Stabilization viability reduced; rollback authority should remain prioritized.",
    ]),
  };

  const risk: RecoveryRiskAssessment = {
    furtherDegradationRisk: round(
      clamp(
        (100 - executionStability) * 0.35 +
          (100 - verificationScore) * 0.25 +
          (degradationSeverity === "critical" ? 28 : degradationSeverity === "high" ? 18 : 0) +
          (graceFailure ? 14 : 0),
      ),
    ),
    rollbackEscalationLikelihood: round(
      clamp(
        (healthClassification === "rollback_sensitive" || healthClassification === "critical" ? 36 : 12) +
          (graceFailure ? 22 : 0) +
          (100 - rollbackRecoverability) * 0.28 +
          (input.playbackExecution.mutationState === "rollback_ready" ? 24 : 0),
      ),
    ),
    transportInstabilityRisk: round(clamp(100 - transportStability + (healthClassification === "transport_unstable" ? 12 : 0))),
    queueCorruptionRisk: round(clamp((100 - verificationScore) * 0.55 + (queueVerified ? 0 : 22))),
    energyContinuityRisk: round(clamp(100 - energyPreservation + input.signalSummary.cadenceEscalationPressure * 0.15)),
    synchronizationRecoveryLikelihood: syncRecoveryLikelihood,
    recoveryRiskScore: 0,
    riskClassification: "low",
    riskReasoning: [],
  };
  const recoveryRiskScore = round(
    clamp(
      risk.furtherDegradationRisk * 0.28 +
        risk.rollbackEscalationLikelihood * 0.24 +
        risk.transportInstabilityRisk * 0.18 +
        risk.queueCorruptionRisk * 0.16 +
        risk.energyContinuityRisk * 0.14,
    ),
  );
  const riskClassification: RecoveryRiskAssessment["riskClassification"] =
    recoveryRiskScore >= 72 ? "critical" : recoveryRiskScore >= 52 ? "high" : recoveryRiskScore >= 32 ? "moderate" : "low";
  const riskWithScore: RecoveryRiskAssessment = {
    ...risk,
    recoveryRiskScore,
    riskClassification,
    riskReasoning: Object.freeze([
      `Composite recovery risk score ${recoveryRiskScore.toFixed(2)} (${riskClassification}).`,
      risk.rollbackEscalationLikelihood >= 60
        ? "Rollback escalation likelihood elevated; deferment only viable under strict supervision."
        : "Rollback escalation likelihood remains manageable for supervised recovery.",
    ]),
  };

  const continuity: RecoveryContinuityAnalysis = {
    energyPreservationQuality: energyPreservation,
    transitionContinuityPreservation: round(
      clamp(input.signalSummary.narrativeContinuity * 0.45 + executionStability * 0.35 + input.signalSummary.orchestrationAlignment * 0.2),
    ),
    crowdMomentumPreservation: round(clamp(input.signalSummary.crowdMomentumScore * 0.55 + input.signalSummary.crowdEngagementConfidence * 0.45)),
    emotionalContinuityPreservation: round(
      clamp(input.signalSummary.narrativeResolutionConfidence * 0.4 + input.signalSummary.orchestrationContinuityPriority * 0.35 + (100 - input.signalSummary.narrativeTension) * 0.25),
    ),
    fallbackTransitionCompatibility: round(
      clamp(
        input.signalSummary.orchestrationStability * 0.35 +
          input.signalSummary.orchestrationAlignment * 0.3 +
          energyPreservation * 0.35,
      ),
    ),
    safeCooldownOpportunity: round(
      clamp(executionStability * 0.4 + (100 - input.signalSummary.cadenceEscalationPressure) * 0.3 + heartbeatContinuity * 0.3),
    ),
    continuityPreservationQuality: 0,
    continuityReasoning: [],
  };
  const continuityPreservationQuality = round(
    clamp(
      continuity.energyPreservationQuality * 0.22 +
        continuity.transitionContinuityPreservation * 0.22 +
        continuity.crowdMomentumPreservation * 0.18 +
        continuity.emotionalContinuityPreservation * 0.18 +
        continuity.fallbackTransitionCompatibility * 0.1 +
        continuity.safeCooldownOpportunity * 0.1,
    ),
  );
  const continuityWithQuality: RecoveryContinuityAnalysis = {
    ...continuity,
    continuityPreservationQuality,
    continuityReasoning: Object.freeze([
      `Continuity preservation quality ${continuityPreservationQuality.toFixed(2)} across energy, transition, and crowd signals.`,
      continuity.energyPreservationQuality >= 60
        ? "Energy-preserving recovery path remains compatible with current narrative arc."
        : "Energy continuity fragile; favor stabilization cooldown or supervised fallback.",
    ]),
  };

  const recoveryConfidence = round(
    clamp(
      stabilizationScore * 0.32 +
        rollbackRecoverability * 0.22 +
        continuityPreservationQuality * 0.2 +
        calibrationReliability * 0.14 +
        (100 - recoveryRiskScore) * 0.12,
    ),
  );
  const recoveryFeasibility = round(
    clamp(
      recoveryConfidence * 0.45 +
        (eligibleStrategies.length > 0 ? 28 : 0) +
        (safeRetryEligible ? 12 : 0) +
        (stabilization.stabilizationViable ? 15 : 0),
    ),
  );
  const stabilizationViability = stabilization.stabilizationScore;
  const confidence: RecoveryConfidenceProfile = {
    recoveryConfidence,
    recoveryFeasibility,
    stabilizationViability,
    supervisionRequired: true,
  };

  const rollbackEscalationPressure = round(
    clamp(
      riskWithScore.rollbackEscalationLikelihood * 0.55 +
        (graceFailure ? 18 : 0) +
        (healthClassification === "critical" ? 22 : healthClassification === "rollback_sensitive" ? 14 : 0) +
        (input.playbackExecution.mutationState === "rollback_ready" ? 20 : 0),
    ),
  );
  const defermentViable =
    primaryStrategy === "rollback_deferment" ||
    (rollbackAllowed &&
      !graceFailure &&
      recoveryFeasibility >= 55 &&
      rollbackEscalationPressure < 78 &&
      eligibleStrategies.some((evaluation) => evaluation.strategy === "rollback_deferment" && evaluation.eligible));
  const escalation: RecoveryEscalationState = {
    rollbackEscalationPressure,
    rollbackRequired: rollbackEscalationPressure >= 82 || graceFailure || healthClassification === "critical",
    defermentViable,
    escalationReasoning: Object.freeze([
      defermentViable
        ? "Rollback deferment viable under supervised recovery window; rollback remains final authority."
        : "Rollback escalation pressure high; operator rollback path should remain prioritized.",
      rollbackEscalationPressure >= 82
        ? "Escalation pressure critical; recovery strategies are advisory only."
        : "Escalation pressure within supervised recovery bounds.",
    ]),
  };

  const classifications: RecoveryClassification[] = [];
  if (recoveryFeasibility >= 62) classifications.push("recoverable");
  if (stabilization.stabilizationViable) classifications.push("stabilization_viable");
  if (transportStability < 55 || healthClassification === "transport_unstable") classifications.push("transport_fragile");
  if (healthClassification === "rollback_sensitive" || !rollbackAllowed) classifications.push("rollback_sensitive");
  if (recoveryRiskScore >= 58 || degradationSeverity === "high") classifications.push("recovery_unstable");
  if (continuityPreservationQuality >= 60) classifications.push("continuity_preserved");
  if (energyPreservation < 55 || input.signalSummary.cadenceEscalationPressure >= 65) classifications.push("energy_sensitive");
  if (rollbackEscalationPressure >= 65) classifications.push("escalation_risk");
  if (healthClassification === "critical" || graceFailure) classifications.push("critical_recovery_state");

  const recoveryReasoning: string[] = [
    `Primary supervised recovery strategy: ${primaryStrategy.replace(/_/g, " ")}.`,
    `Recovery confidence ${recoveryConfidence.toFixed(2)} | feasibility ${recoveryFeasibility.toFixed(2)} | risk ${recoveryRiskScore.toFixed(2)}.`,
    ...escalation.escalationReasoning,
    ...continuityWithQuality.continuityReasoning,
  ];
  if (eligibleStrategies.length === 0) {
    recoveryReasoning.push("No eligible pre-rollback strategy passed deterministic gates; rollback authority unchanged.");
  }

  const plan: RuntimeRecoveryPlan = {
    timestamp,
    primaryStrategy,
    fallbackStrategies: Object.freeze(fallbackStrategies),
    executionWindow,
    stabilization,
    strategyEvaluations: Object.freeze(strategyEvaluations),
  };

  return {
    plan,
    confidence,
    risk: riskWithScore,
    continuity: continuityWithQuality,
    escalation,
    classifications: Object.freeze([...new Set(classifications)]),
    recoveryReasoning: Object.freeze(recoveryReasoning),
  };
}

export function buildRuntimeRecoverySnapshot(input: {
  signalSummary: RuntimeRecoverySignalContext;
  playbackExecution: RuntimeRecoveryExecutionContext;
  calibrationSnapshot?: ConfidenceCalibrationSnapshot;
  timestamp?: number;
}): RuntimeRecoverySnapshot {
  return {
    timestamp: input.timestamp ?? Date.now(),
    recommendation: evaluateRuntimeRecovery(input),
  };
}
