import "server-only";

/**
 * Deterministic adaptive orchestration learning.
 *
 * Philosophy:
 * - Reinforce stable, musically coherent outcomes.
 * - Penalize unstable/risky outcomes and frequent operator correction.
 * - Keep every trust score bounded and explainable.
 *
 * Safety:
 * - This layer only produces advisory bias adjustments.
 * - It never bypasses execution guardrails, rollback blockers, or transport safety.
 * - All outputs are clamped to deterministic ranges.
 */

export type TransitionLearningProfile = {
  transitionTrustScore: number;
  harmonicTrust: number;
  phraseTimingTrust: number;
  crowdRecoveryTrust: number;
  operatorInterventionPenalty: number;
  executionRecoveryBias: number;
  emotionalContinuityTrust: number;
  updatedAt: number;
  sampleCount: number;
};

export type TransitionLearningSnapshot = {
  timestamp: number;
  profile: TransitionLearningProfile;
  reasons: string[];
};

export type TransitionLearningAdjustment = {
  nextProfile: TransitionLearningProfile;
  confidenceBias: number;
  riskBias: number;
  escalationClamp: number;
  stabilizationPriority: number;
  reasons: string[];
};

export type TransitionLearningObservation = {
  timestamp?: number;
  transitionSucceeded: boolean;
  harmonicStability: number;
  phraseAlignment: number;
  crowdRecovery: number;
  operatorInterventions: number;
  executionStability: number;
  emotionalContinuity: number;
  transportIntegrity: number;
  rollbackTriggered: boolean;
};

const MIN_SCORE = 0;
const MAX_SCORE = 100;
const DEFAULT_SCORE = 55;
const DECAY_HALF_LIFE_MS = 45 * 60 * 1000;
const MIN_ESCALATION_CLAMP = 0.18;
const MAX_ESCALATION_CLAMP = 0.78;

function clamp(value: number, min = MIN_SCORE, max = MAX_SCORE) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function normalized01(value: number) {
  return clamp(value, MIN_SCORE, MAX_SCORE) / 100;
}

function computeDecayWeight(elapsedMs: number) {
  if (elapsedMs <= 0) return 1;
  return Math.exp((-Math.log(2) * elapsedMs) / DECAY_HALF_LIFE_MS);
}

export function createDefaultTransitionLearningProfile(now = Date.now()): TransitionLearningProfile {
  return {
    transitionTrustScore: DEFAULT_SCORE,
    harmonicTrust: DEFAULT_SCORE,
    phraseTimingTrust: DEFAULT_SCORE,
    crowdRecoveryTrust: DEFAULT_SCORE,
    operatorInterventionPenalty: 0,
    executionRecoveryBias: DEFAULT_SCORE,
    emotionalContinuityTrust: DEFAULT_SCORE,
    updatedAt: now,
    sampleCount: 0,
  };
}

function applyScoreUpdate(params: {
  current: number;
  targetSignal: number;
  successFactor: number;
  failureFactor: number;
  decayWeight: number;
}) {
  const drifted = params.current * params.decayWeight + DEFAULT_SCORE * (1 - params.decayWeight);
  const delta = params.targetSignal >= 60 ? params.successFactor : -params.failureFactor;
  const proportional = (params.targetSignal - 50) * 0.14;
  return round(clamp(drifted + delta + proportional));
}

/**
 * Reinforces general transition trust while penalizing unstable outcomes.
 */
export function computeTransitionLearningBias(profile: TransitionLearningProfile): {
  confidenceBias: number;
  riskBias: number;
  reasons: string[];
} {
  const trustComposite =
    profile.transitionTrustScore * 0.26 +
    profile.harmonicTrust * 0.16 +
    profile.phraseTimingTrust * 0.14 +
    profile.executionRecoveryBias * 0.2 +
    profile.emotionalContinuityTrust * 0.14 +
    profile.crowdRecoveryTrust * 0.1;
  const operatorPenaltyPressure = profile.operatorInterventionPenalty * 0.42;
  const confidenceBias = round(clamp((trustComposite - 55) * 0.3 - operatorPenaltyPressure * 0.18, -18, 18));
  const riskBias = round(clamp((55 - trustComposite) * 0.22 + operatorPenaltyPressure * 0.24, -14, 24));
  const reasons: string[] = [];
  reasons.push(
    confidenceBias >= 0
      ? "Transition trust supports confidence reinforcement."
      : "Transition trust degraded; confidence bias reduced.",
  );
  reasons.push(
    operatorPenaltyPressure >= 30
      ? "Frequent operator corrections increased conservative risk bias."
      : "Operator correction pressure remains within supervised tolerance.",
  );
  return { confidenceBias, riskBias, reasons };
}

/**
 * Shapes recovery preference from execution and crowd recovery history.
 */
export function computeRecoveryLearningBias(profile: TransitionLearningProfile): {
  recoveryBias: number;
  stabilizationPriority: number;
  reasons: string[];
} {
  const recoveryBias = round(clamp((profile.executionRecoveryBias - 50) * 0.34, -20, 20));
  const stabilizationPriority = round(
    clamp(
      profile.executionRecoveryBias * 0.45 +
        profile.crowdRecoveryTrust * 0.25 +
        (100 - profile.operatorInterventionPenalty) * 0.2 +
        profile.transitionTrustScore * 0.1,
      0,
      100,
    ),
  );
  const reasons: string[] = [];
  reasons.push(
    recoveryBias >= 0
      ? "Execution recovery history supports guarded continuation."
      : "Execution recovery reliability reduced; recovery bias constrained.",
  );
  reasons.push(
    stabilizationPriority >= 65
      ? "Stabilization priority elevated by consistent recovery outcomes."
      : "Stabilization priority remains moderate due to mixed recovery outcomes.",
  );
  return { recoveryBias, stabilizationPriority, reasons };
}

/**
 * Biases crowd adaptation from recovery stability and operator pressure.
 */
export function computeCrowdAdaptationBias(profile: TransitionLearningProfile): {
  crowdBias: number;
  reasons: string[];
} {
  const crowdComposite = profile.crowdRecoveryTrust * 0.55 + profile.emotionalContinuityTrust * 0.25 + profile.transitionTrustScore * 0.2;
  const crowdBias = round(
    clamp((crowdComposite - 50) * 0.28 - profile.operatorInterventionPenalty * 0.08, -16, 16),
  );
  const reasons: string[] = [];
  reasons.push(
    crowdBias >= 0
      ? "Crowd recovery consistency increased adaptive crowd confidence."
      : "Crowd recovery inconsistency reduced adaptive crowd confidence.",
  );
  return { crowdBias, reasons };
}

/**
 * Constrains escalation when stability learning weakens.
 */
export function computeExecutionStabilityBias(profile: TransitionLearningProfile): {
  escalationClamp: number;
  stabilityBias: number;
  reasons: string[];
} {
  const stabilityComposite =
    profile.executionRecoveryBias * 0.4 +
    profile.transitionTrustScore * 0.2 +
    profile.phraseTimingTrust * 0.16 +
    profile.harmonicTrust * 0.12 +
    profile.emotionalContinuityTrust * 0.12;
  const stabilityBias = round(clamp((stabilityComposite - 50) * 0.3, -18, 18));
  const escalationClamp = round(
    clamp(
      MIN_ESCALATION_CLAMP +
        normalized01(stabilityComposite) * 0.46 -
        normalized01(profile.operatorInterventionPenalty) * 0.24,
      MIN_ESCALATION_CLAMP,
      MAX_ESCALATION_CLAMP,
    ),
  );
  const reasons: string[] = [];
  reasons.push(
    escalationClamp <= 0.38
      ? "Escalation clamp tightened due to unstable execution learning."
      : "Escalation clamp relaxed under stable execution learning.",
  );
  return { escalationClamp, stabilityBias, reasons };
}

export function applyTransitionLearningObservation(params: {
  profile: TransitionLearningProfile;
  observation: TransitionLearningObservation;
}): TransitionLearningAdjustment {
  const now = params.observation.timestamp ?? Date.now();
  const elapsedMs = Math.max(0, now - params.profile.updatedAt);
  const decayWeight = computeDecayWeight(elapsedMs);

  const interventionPenaltyTarget = clamp(
    params.observation.operatorInterventions * 18 + (params.observation.rollbackTriggered ? 16 : 0),
  );
  const decayedInterventionPenalty = round(
    params.profile.operatorInterventionPenalty * decayWeight + interventionPenaltyTarget * (1 - decayWeight),
  );

  const transitionSignal = params.observation.transitionSucceeded ? params.observation.executionStability : 22;
  const harmonicSignal = params.observation.harmonicStability;
  const phraseSignal = params.observation.phraseAlignment;
  const crowdSignal = params.observation.crowdRecovery;
  const executionSignal = params.observation.executionStability;
  const emotionalSignal = params.observation.emotionalContinuity;
  const transportGuardPenalty = params.observation.transportIntegrity < 50 ? 8 : 0;

  const nextProfile: TransitionLearningProfile = {
    transitionTrustScore: applyScoreUpdate({
      current: params.profile.transitionTrustScore,
      targetSignal: transitionSignal,
      successFactor: params.observation.transitionSucceeded ? 2.6 : 0.8,
      failureFactor: params.observation.transitionSucceeded ? 0.8 : 4.2,
      decayWeight,
    }),
    harmonicTrust: applyScoreUpdate({
      current: params.profile.harmonicTrust,
      targetSignal: harmonicSignal,
      successFactor: 2.3,
      failureFactor: 2.8,
      decayWeight,
    }),
    phraseTimingTrust: applyScoreUpdate({
      current: params.profile.phraseTimingTrust,
      targetSignal: phraseSignal,
      successFactor: 2.1,
      failureFactor: 2.9,
      decayWeight,
    }),
    crowdRecoveryTrust: applyScoreUpdate({
      current: params.profile.crowdRecoveryTrust,
      targetSignal: crowdSignal,
      successFactor: 2.0,
      failureFactor: 2.6,
      decayWeight,
    }),
    operatorInterventionPenalty: round(clamp(decayedInterventionPenalty + transportGuardPenalty, 0, 100)),
    executionRecoveryBias: applyScoreUpdate({
      current: params.profile.executionRecoveryBias,
      targetSignal: executionSignal,
      successFactor: 2.4,
      failureFactor: 3.1,
      decayWeight,
    }),
    emotionalContinuityTrust: applyScoreUpdate({
      current: params.profile.emotionalContinuityTrust,
      targetSignal: emotionalSignal,
      successFactor: 2.2,
      failureFactor: 2.7,
      decayWeight,
    }),
    updatedAt: now,
    sampleCount: params.profile.sampleCount + 1,
  };

  const transitionBias = computeTransitionLearningBias(nextProfile);
  const recoveryBias = computeRecoveryLearningBias(nextProfile);
  const crowdBias = computeCrowdAdaptationBias(nextProfile);
  const stabilityBias = computeExecutionStabilityBias(nextProfile);

  const reasons: string[] = [
    `Learning decay weight applied at ${round(decayWeight * 100)}%.`,
    params.observation.transitionSucceeded
      ? "Successful transition reinforced trust profile."
      : "Unstable transition penalized trust profile.",
    params.observation.operatorInterventions > 0
      ? "Operator intervention frequency increased conservative penalty."
      : "No operator interventions detected; penalty decay maintained.",
    ...transitionBias.reasons,
    ...recoveryBias.reasons,
    ...crowdBias.reasons,
    ...stabilityBias.reasons,
  ];

  return {
    nextProfile,
    confidenceBias: transitionBias.confidenceBias,
    riskBias: transitionBias.riskBias,
    escalationClamp: stabilityBias.escalationClamp,
    stabilizationPriority: recoveryBias.stabilizationPriority,
    reasons,
  };
}

export function createTransitionLearningSnapshot(
  profile: TransitionLearningProfile,
  reasons: string[],
  timestamp = Date.now(),
): TransitionLearningSnapshot {
  return {
    timestamp,
    profile,
    reasons: [...reasons],
  };
}
