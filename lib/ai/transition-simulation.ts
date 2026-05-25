import "server-only";

import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { TransitionEvaluationResult, TransitionRiskLevel } from "@/lib/ai/transition-engine";
import { RecommendationTelemetryItem } from "@/lib/spotify/telemetry-types";

export type TransitionSimulationStep = {
  index: 1 | 2 | 3;
  predictedAction: "hold_state" | "ramp_transition" | "cooldown_transition";
  predictedTrackLabel: string | null;
  projectedEnergy: number;
  projectedBpm: number;
  projectedMomentum: "low" | "steady" | "rising" | "surging";
  projectedPhase: string;
  confidence: number;
  riskLevel: TransitionRiskLevel;
  interventionHint: string | null;
};

export type TransitionSimulationTimeline = {
  steps: TransitionSimulationStep[];
  projectedEnergyCurve: number[];
  projectedBpmFlow: number[];
  projectedMomentumFlow: Array<TransitionSimulationStep["projectedMomentum"]>;
};

export type SimulationRiskForecast = {
  currentRisk: TransitionRiskLevel;
  nextRisk: TransitionRiskLevel;
  escalationProbability: number;
  riskReasons: string[];
};

export type SimulationConfidenceForecast = {
  currentConfidence: number;
  projectedConfidenceSeries: number[];
  confidenceDrift: number;
};

export type TransitionSimulationResult = {
  timeline: TransitionSimulationTimeline;
  riskForecast: SimulationRiskForecast;
  confidenceForecast: SimulationConfidenceForecast;
  holdRampCooldownPrediction: {
    holdCount: number;
    rampCount: number;
    cooldownCount: number;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function momentumFromEnergy(energy: number): TransitionSimulationStep["projectedMomentum"] {
  if (energy >= 8.8) return "surging";
  if (energy >= 6.8) return "rising";
  if (energy <= 3.8) return "low";
  return "steady";
}

function nextRiskLevelFromConfidence(confidence: number, invalidated: boolean): TransitionRiskLevel {
  if (invalidated || confidence < 55) return "high";
  if (confidence < 75) return "medium";
  return "low";
}

export function simulateTransitionTimeline(params: {
  queueRecommendations: QueueRecommendationWithMeta[];
  telemetry: RecommendationTelemetryItem | null;
  evaluation: TransitionEvaluationResult;
}) {
  const recommended = params.queueRecommendations
    .flatMap((item) => item.spotifyEnhancedRecommendations ?? [])
    .sort((a, b) => b.aiConfidence - a.aiConfidence)
    .slice(0, 3);

  const baseEnergy = params.evaluation.currentState.energy ?? 5;
  const baseBpm = params.evaluation.currentState.bpm ?? 110;
  const invalidated = params.telemetry?.invalidationStatus === "invalidated";
  const trustBias = params.evaluation.crowdFeedbackInfluence.transitionTrustScore;
  const interventionBias = params.evaluation.crowdFeedbackInfluence.operatorInterventionRate;
  const audioBias = params.evaluation.audioEnergyInfluence.engagementScore;
  const audioDrift = params.evaluation.audioEnergyInfluence.driftScore;
  const steps: TransitionSimulationStep[] = [];
  const projectedConfidenceSeries: number[] = [];
  let energy = baseEnergy;
  let bpm = baseBpm;
  let confidence = params.evaluation.confidence.score;

  for (let i = 0; i < 3; i += 1) {
    const track = recommended[i] ?? recommended[0] ?? null;
    const action =
      energy >= 8.8
        ? "cooldown_transition"
        : energy <= 6.2
          ? "ramp_transition"
          : "hold_state";
    const targetEnergy = track?.energy ?? energy;
    const targetBpm = track?.bpm ?? bpm;

    energy =
      action === "ramp_transition"
        ? clamp((energy + targetEnergy) / 2 + 0.35, 1, 10)
        : action === "cooldown_transition"
          ? clamp((energy + targetEnergy) / 2 - 0.45, 1, 10)
          : clamp((energy + targetEnergy) / 2, 1, 10);
    bpm = clamp(Math.round((bpm + targetBpm) / 2), 70, 180);

    confidence = clamp(
      confidence -
        (invalidated ? 7 : 2) -
        (action === "hold_state" ? 3 : 0) +
        (track ? 1 : -4) +
        (trustBias - 50) * 0.08 -
        Math.max(0, interventionBias - 45) * 0.12 +
        (audioBias - 50) * 0.06 -
        Math.abs(audioDrift) * 0.2,
      0,
      100,
    );
    projectedConfidenceSeries.push(confidence);
    const risk = nextRiskLevelFromConfidence(confidence, invalidated);

    steps.push({
      index: (i + 1) as 1 | 2 | 3,
      predictedAction: action,
      predictedTrackLabel: track ? `${track.name} - ${track.artistName}` : null,
      projectedEnergy: Number(energy.toFixed(2)),
      projectedBpm: bpm,
      projectedMomentum: momentumFromEnergy(energy),
      projectedPhase: energy >= 8.6 ? "peak" : energy <= 4 ? "cooldown" : "build",
      confidence,
      riskLevel: risk,
      interventionHint:
        risk === "high"
          ? "Operator should review before execution."
          : action === "cooldown_transition"
            ? "Consider energy hold if crowd still rising."
            : null,
    });
  }

  const riskReasons: string[] = [];
  if (invalidated) riskReasons.push("Recommendation telemetry is invalidated.");
  if (steps.some((step) => step.riskLevel === "high")) riskReasons.push("Projected confidence trend degrades.");
  if (steps.some((step) => step.predictedAction === "cooldown_transition"))
    riskReasons.push("Cooldown transitions detected in forecast.");

  const timeline: TransitionSimulationTimeline = {
    steps,
    projectedEnergyCurve: steps.map((step) => step.projectedEnergy),
    projectedBpmFlow: steps.map((step) => step.projectedBpm),
    projectedMomentumFlow: steps.map((step) => step.projectedMomentum),
  };
  const riskForecast: SimulationRiskForecast = {
    currentRisk: params.evaluation.riskLevel,
    nextRisk: steps[0]?.riskLevel ?? params.evaluation.riskLevel,
    escalationProbability: Number(
      (
        (steps.filter((step) => step.riskLevel === "high").length / Math.max(steps.length, 1)) *
        100
      ).toFixed(2),
    ),
    riskReasons,
  };
  const confidenceForecast: SimulationConfidenceForecast = {
    currentConfidence: params.evaluation.confidence.score,
    projectedConfidenceSeries,
    confidenceDrift: Number(
      (
        (projectedConfidenceSeries[projectedConfidenceSeries.length - 1] ?? params.evaluation.confidence.score) -
        params.evaluation.confidence.score
      ).toFixed(2),
    ),
  };

  return {
    timeline,
    riskForecast,
    confidenceForecast,
    holdRampCooldownPrediction: {
      holdCount: steps.filter((step) => step.predictedAction === "hold_state").length,
      rampCount: steps.filter((step) => step.predictedAction === "ramp_transition").length,
      cooldownCount: steps.filter((step) => step.predictedAction === "cooldown_transition").length,
    },
  } satisfies TransitionSimulationResult;
}

