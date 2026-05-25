import "server-only";

import { getAutonomousLoopState } from "@/lib/ai/autonomous-loop";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { evaluateTransitionEngine, TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import {
  evaluateRuntimeIntelligence,
  RuntimeIntelligenceState,
} from "@/lib/ai/runtime-intelligence-coordinator";
import { getRuntimeMemoryInsights, getRuntimeMemoryPatterns } from "@/lib/ai/runtime-memory";

export type RiskExplanation = {
  level: "low" | "medium" | "high" | "n/a";
  rationale: string[];
};

export type ConfidenceExplanation = {
  score: number;
  rationale: string[];
  influencingSignals: Array<{ signal: string; value: number; effect: "positive" | "negative" | "neutral" }>;
};

export type InterventionRecommendationExplanation = {
  recommendations: string[];
  suppressionRationale: string[];
};

export type RuntimeDecisionExplanation = {
  decisionReason: string;
  influencingSignals: string[];
  conflictingSignals: string[];
  recommendedOperatorActions: string[];
  suppressionRationale: string[];
  learnedMemorySignals?: string[];
};

export type ExplainabilitySummary = {
  generatedAt: string;
  runtime: RuntimeDecisionExplanation & {
    confidence: ConfidenceExplanation;
    risk: RiskExplanation;
  };
  transition: RuntimeDecisionExplanation & {
    confidence: ConfidenceExplanation;
    risk: RiskExplanation;
  };
  autonomousLoop: RuntimeDecisionExplanation & {
    confidence: ConfidenceExplanation;
    risk: RiskExplanation;
    intervention: InterventionRecommendationExplanation;
  };
};

function summarizeRuntime(runtime: RuntimeIntelligenceState) {
  const influencingSignals = [
    `Transition confidence ${runtime.unifiedConfidence.components.transitionConfidence.toFixed(2)}`,
    `Crowd trust ${runtime.unifiedConfidence.components.crowdTrust.toFixed(2)}`,
    `Audio engagement ${runtime.unifiedConfidence.components.audioEngagement.toFixed(2)}`,
    `Recommendation health ${runtime.unifiedConfidence.components.recommendationHealth.toFixed(2)}`,
    `Playback consistency ${runtime.unifiedConfidence.components.playbackConsistency.toFixed(2)}`,
  ];
  const confidence: ConfidenceExplanation = {
    score: runtime.unifiedConfidence.unifiedConfidence,
    rationale: [
      `Unified confidence combines transition/crowd/audio/recommendation/playback components.`,
      `Current orchestration priority is ${runtime.decision.orchestrationPriority}.`,
    ],
    influencingSignals: [
      {
        signal: "transitionConfidence",
        value: runtime.unifiedConfidence.components.transitionConfidence,
        effect: runtime.unifiedConfidence.components.transitionConfidence >= 70 ? "positive" : "negative",
      },
      {
        signal: "crowdTrust",
        value: runtime.unifiedConfidence.components.crowdTrust,
        effect: runtime.unifiedConfidence.components.crowdTrust >= 55 ? "positive" : "negative",
      },
      {
        signal: "audioEngagement",
        value: runtime.unifiedConfidence.components.audioEngagement,
        effect: runtime.unifiedConfidence.components.audioEngagement >= 55 ? "positive" : "negative",
      },
      {
        signal: "recommendationHealth",
        value: runtime.unifiedConfidence.components.recommendationHealth,
        effect:
          runtime.unifiedConfidence.components.recommendationHealth >= 65 ? "positive" : "negative",
      },
      {
        signal: "playbackConsistency",
        value: runtime.unifiedConfidence.components.playbackConsistency,
        effect: runtime.unifiedConfidence.components.playbackConsistency >= 65 ? "positive" : "negative",
      },
    ],
  };
  const risk: RiskExplanation = {
    level:
      runtime.decision.activeRiskFactors.length >= 3
        ? "high"
        : runtime.decision.activeRiskFactors.length >= 1
          ? "medium"
          : "low",
    rationale: runtime.decision.activeRiskFactors.length
      ? runtime.decision.activeRiskFactors
      : ["No active risk factors were reported by runtime coordination."],
  };
  return {
    decisionReason: `Priority ${runtime.decision.orchestrationPriority} selected from unified confidence ${runtime.unifiedConfidence.unifiedConfidence.toFixed(
      2,
    )}, stability ${runtime.stability.value.toFixed(2)}, and autonomy readiness ${runtime.autonomyReadiness.toFixed(
      2,
    )}.`,
    influencingSignals,
    conflictingSignals: runtime.decision.signalConflicts,
    recommendedOperatorActions: runtime.decision.operatorInterventions,
    suppressionRationale:
      runtime.decision.orchestrationPriority === "stabilize_signals"
        ? ["Conflicting signals are currently suppressing transition-forward actions."]
        : runtime.decision.orchestrationPriority === "refresh_recommendations"
          ? ["Recommendation freshness degraded; transition execution should wait for refresh."]
          : [],
    learnedMemorySignals: [
      `Transition bias ${runtime.learnedMemoryInfluence.transitionBias.toFixed(2)}`,
      `Energy bias ${runtime.learnedMemoryInfluence.energyBias.toFixed(2)}`,
      `Operator bias ${runtime.learnedMemoryInfluence.operatorBias.toFixed(2)}`,
      `Crowd bias ${runtime.learnedMemoryInfluence.crowdBias.toFixed(2)}`,
      `Confidence bias ${runtime.learnedMemoryInfluence.confidenceBias.toFixed(2)}`,
    ],
    confidence,
    risk,
  };
}

function summarizeTransition(transition: TransitionEvaluationResult) {
  const influencingSignals = [
    `Autonomous readiness ${transition.autonomousReadiness}`,
    `Room energy ${transition.audioEnergyInfluence.roomEnergy.toFixed(2)}`,
    `Crowd sentiment ${transition.crowdFeedbackInfluence.crowdSentiment.toFixed(2)}`,
    `Transition trust ${transition.crowdFeedbackInfluence.transitionTrustScore.toFixed(2)}`,
    `Telemetry freshness ${transition.telemetry?.freshness ?? "unknown"}`,
  ];
  const confidence: ConfidenceExplanation = {
    score: transition.confidence.score,
    rationale: transition.confidence.reasons,
    influencingSignals: [
      {
        signal: "crowdTrust",
        value: transition.crowdFeedbackInfluence.transitionTrustScore,
        effect: transition.crowdFeedbackInfluence.transitionTrustScore >= 55 ? "positive" : "negative",
      },
      {
        signal: "audioEngagement",
        value: transition.audioEnergyInfluence.engagementScore,
        effect: transition.audioEnergyInfluence.engagementScore >= 55 ? "positive" : "negative",
      },
      {
        signal: "operatorInterventionRate",
        value: transition.crowdFeedbackInfluence.operatorInterventionRate,
        effect:
          transition.crowdFeedbackInfluence.operatorInterventionRate > 60 ? "negative" : "neutral",
      },
    ],
  };
  const risk: RiskExplanation = {
    level: transition.riskLevel,
    rationale:
      transition.riskLevel === "high"
        ? ["High risk level due to degraded confidence and/or invalidated telemetry."]
        : transition.riskLevel === "medium"
          ? ["Moderate risk detected; supervised review is recommended."]
          : ["Risk remains low under current transition conditions."],
  };
  return {
    decisionReason: transition.decision.reason,
    influencingSignals,
    conflictingSignals:
      transition.executionPlan.nextAction === "reject_unsafe_transition"
        ? ["Unsafe transition was rejected by guardrail checks."]
        : [],
    recommendedOperatorActions: transition.decision.shouldTransition
      ? ["Review target track and execute in supervised mode if acceptable."]
      : ["Maintain current state and re-evaluate on next cycle."],
    suppressionRationale:
      transition.executionPlan.nextAction === "hold_state"
        ? ["Transition execution is currently held by readiness/safety gates."]
        : transition.executionPlan.nextAction === "reject_unsafe_transition"
          ? ["Unsafe transition rejection is active."]
          : [],
    learnedMemorySignals: transition.learnedMemoryInfluence.rationale,
    confidence,
    risk,
  };
}

function summarizeAutonomous(
  loopState: ReturnType<typeof getAutonomousLoopState>,
  memoryContext: { reinforcementStrength: number; operatorAdaptationTrend: number } | null,
) {
  const latestTick = loopState.tickHistory[0] ?? null;
  const confidence: ConfidenceExplanation = {
    score: latestTick?.confidence ?? 0,
    rationale: latestTick
      ? [`Latest loop tick decision: ${latestTick.decision}.`, latestTick.message]
      : ["No autonomous loop ticks available yet."],
    influencingSignals: [
      {
        signal: "safeToExecute",
        value: loopState.safetyStatus.safeToExecute ? 1 : 0,
        effect: loopState.safetyStatus.safeToExecute ? "positive" : "negative",
      },
      {
        signal: "loopStatus",
        value: loopState.status === "running" ? 1 : 0,
        effect: loopState.status === "running" ? "positive" : "neutral",
      },
    ],
  };
  const risk: RiskExplanation = {
    level: loopState.safetyStatus.safeToExecute ? "low" : "high",
    rationale: loopState.safetyStatus.reasons.length
      ? loopState.safetyStatus.reasons
      : ["No autonomous safety blockers detected."],
  };
  const intervention: InterventionRecommendationExplanation = {
    recommendations: loopState.safetyStatus.safeToExecute
      ? ["Keep assisted-autonomous mode enabled with periodic supervision."]
      : ["Switch to manual override and resolve safety blockers before execution."],
    suppressionRationale: loopState.safetyStatus.reasons,
  };
  return {
    decisionReason: latestTick?.message ?? "Autonomous runtime has not produced a tick yet.",
    influencingSignals: [
      `Loop status ${loopState.status}`,
      `Supervision mode ${loopState.supervisionMode}`,
      `Safety status ${loopState.safetyStatus.safeToExecute ? "safe" : "blocked"}`,
    ],
    conflictingSignals: loopState.safetyStatus.reasons,
    recommendedOperatorActions: intervention.recommendations,
    suppressionRationale: intervention.suppressionRationale,
    learnedMemorySignals: memoryContext
      ? [
          `Reinforcement strength ${memoryContext.reinforcementStrength.toFixed(2)}`,
          `Operator adaptation trend ${memoryContext.operatorAdaptationTrend.toFixed(2)}`,
        ]
      : ["Runtime memory context unavailable."],
    confidence,
    risk,
    intervention,
  };
}

export async function getExplainabilityRuntime(params: {
  userId: string;
  assistedAutonomousEnabled?: boolean;
}) {
  const runtime = await evaluateRuntimeIntelligence({
    userId: params.userId,
    assistedAutonomousEnabled: params.assistedAutonomousEnabled ?? true,
  });
  const insights = await getRuntimeMemoryInsights({ userId: params.userId, limit: 60 });
  const runtimeSummary = summarizeRuntime(runtime);
  return {
    ...runtimeSummary,
    learnedMemorySignals: [
      ...(runtimeSummary.learnedMemorySignals ?? []),
      `Frozen patterns ${insights.frozenPatternCount}`,
      `Reinforcement strength ${insights.reinforcementStrength.toFixed(2)}`,
      `Reversal-eligible actions ${insights.reversalEligibleCount}`,
      "Supervised operator actions are required for reinforcement/penalty.",
      "Reversals are bounded to latest unreversed action and linked by audit.",
    ],
  };
}

export async function getExplainabilityTransition(params: {
  userId: string;
  queueRecommendations: QueueRecommendationWithMeta[];
  assistedAutonomousEnabled: boolean;
}) {
  const transition = await evaluateTransitionEngine({
    userId: params.userId,
    queueRecommendations: params.queueRecommendations,
    assistedAutonomousEnabled: params.assistedAutonomousEnabled,
  });
  const patterns = await getRuntimeMemoryPatterns({ userId: params.userId, limit: 40 });
  const frozenCount = patterns.filter((pattern) => pattern.learning_frozen).length;
  const transitionSummary = summarizeTransition(transition);
  return {
    ...transitionSummary,
    learnedMemorySignals: [
      ...(transitionSummary.learnedMemorySignals ?? []),
      `Frozen-pattern suppressions ${frozenCount}`,
      "Transition memory influence uses bounded supervised adjustments.",
      "Restored states from reversals are deterministic and audit-linked.",
    ],
  };
}

export async function getExplainabilityAutonomous(params: { userId: string }) {
  const loopState = getAutonomousLoopState(params.userId);
  const insights = await getRuntimeMemoryInsights({ userId: params.userId, limit: 40 });
  const summary = summarizeAutonomous(loopState, {
    reinforcementStrength: insights.reinforcementStrength,
    operatorAdaptationTrend: insights.operatorAdaptationTrend,
  });
  return {
    ...summary,
    learnedMemorySignals: [
      ...(summary.learnedMemorySignals ?? []),
      `Frozen patterns ${insights.frozenPatternCount}`,
      "Autonomous loop cannot self-reinforce; operator API action required.",
      "Reversal safety blocks unrestricted rollback chains.",
    ],
  };
}

export async function getExplainabilitySummary(params: {
  userId: string;
  queueRecommendations: QueueRecommendationWithMeta[];
  assistedAutonomousEnabled: boolean;
}) {
  const [runtime, transition, autonomousLoop] = await Promise.all([
    getExplainabilityRuntime({
      userId: params.userId,
      assistedAutonomousEnabled: params.assistedAutonomousEnabled,
    }),
    getExplainabilityTransition({
      userId: params.userId,
      queueRecommendations: params.queueRecommendations,
      assistedAutonomousEnabled: params.assistedAutonomousEnabled,
    }),
    getExplainabilityAutonomous({ userId: params.userId }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    runtime,
    transition,
    autonomousLoop,
  } satisfies ExplainabilitySummary;
}

