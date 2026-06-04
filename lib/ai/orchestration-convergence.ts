import type { AdaptiveOrchestrationCandidate } from "@/lib/ai/adaptive-orchestration";
import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";
import type { FreshnessCoordinationResult } from "@/lib/spotify/telemetry-freshness-coordinator";
import type { TransportRuntimeState } from "@/lib/transition-orchestration/layer-state";
import type { FreshnessInheritanceChain } from "@/lib/spotify/freshness-inheritance-chain";
import type { PhraseRecoveryDirective } from "@/lib/ai/phrase-recovery-engine";
import type { AudioIntelligenceResult } from "@/lib/ai/audio-intelligence-engine";

export interface OrchestrationConvergenceMetrics {
  convergenceScore: number;
  narrativeContinuity: number;
  cadenceStability: number;
  synthesisConfidence: number;
  phraseTimingSurvivability: number;
  emotionalContinuity: number;
  telemetryIntegrity: number;
  spectralContinuity: number;
  vocalSurvivability: number;
  grooveStability: number;
  dropContinuity: number;
  audioConfidence: number;
  converged: boolean;
  convergenceFailures: string[];
  convergenceSeverity: "stable" | "degraded" | "divergent";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeAverage(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateOrchestrationConvergence(params: {
  candidate: AdaptiveOrchestrationCandidate;
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  transportRuntime?: TransportRuntimeState | null;
  freshnessCoordination?: FreshnessCoordinationResult | null;
  freshnessInheritance?: FreshnessInheritanceChain | null;
  phraseRecovery?: PhraseRecoveryDirective | null;
  audioIntelligence?: AudioIntelligenceResult | null;
  audioMixRecovered?: boolean;
}): OrchestrationConvergenceMetrics {
  console.log("[CONVERGENCE] evaluation started", { candidateId: params.candidate.id });

  const phraseTimingRisk = params.evaluation.phraseTimingRisk;
  const phraseRecoveryBoost = params.phraseRecovery?.timingRiskReduction ?? 0;
  const phraseTimingSurvivability = clamp(
    100 - phraseTimingRisk + phraseRecoveryBoost + (params.candidate.strategy === "hold_state" ? 8 : 0),
    0,
    100,
  );

  const narrativeContinuity = clamp(
    params.evaluation.narrativeContinuity +
      (params.phraseRecovery?.recoveryGain ?? 0) * 0.35 +
      (params.candidate.strategy === "recovery_blend" ? 6 : 0),
    0,
    100,
  );

  const cadenceStability = clamp(
    params.evaluation.cadenceStability +
      (params.phraseRecovery?.cadenceRecovery ?? 0) +
      params.candidate.continuityWeight * 0.12,
    0,
    100,
  );

  const structuralBoost =
    (params.evaluation.structuralCompatibility?.structuralCompatibility ??
      params.evaluation.transitionDiagnostics.structuralCompatibility ??
      0) * 0.06;

  const synthesisConfidence = clamp(
    params.evaluation.orchestrationSynthesisConfidence +
      params.evaluation.orchestrationStability * 0.12 +
      (params.phraseRecovery?.recoveryGain ?? 0) * 0.28 +
      (params.phraseRecovery?.cadenceRecovery ?? 0) * 0.12 +
      structuralBoost -
      (params.candidate.predictedRisk > 70 ? 8 : 0),
    0,
    100,
  );

  const emotionalContinuity = clamp(params.evaluation.emotionalContinuity, 0, 100);

  const simStability = computeAverage(params.simulation.timeline.projectedExecutionStability);
  const orchestrationStabilitySignal = clamp(
    params.evaluation.orchestrationStability * 0.5 + simStability * 0.3 + params.candidate.executionStability * 0.2,
    0,
    100,
  );

  const transportFreshness = params.transportRuntime?.transportFreshness ?? "healthy";
  const coordinationFresh = params.freshnessCoordination?.freshness ?? "healthy";
  const inheritanceContinuity = params.freshnessInheritance?.continuityConfidence ?? 0;

  let telemetryIntegrity = clamp(
    (params.transportRuntime?.transportStability ?? params.evaluation.transportStability) * 0.35 +
      params.evaluation.heartbeatContinuity * 0.25 +
      inheritanceContinuity * 0.2 +
      (coordinationFresh === "healthy" ? 18 : coordinationFresh === "grace_window" ? 12 : 0),
    0,
    100,
  );
  if (params.freshnessInheritance?.continuityConfidence) {
    telemetryIntegrity = clamp(telemetryIntegrity + params.freshnessInheritance.continuityConfidence * 0.08, 0, 100);
  }

  const convergenceFailures: string[] = [];

  if (phraseTimingRisk >= 85 && phraseRecoveryBoost < 20) {
    convergenceFailures.push("phrase_timing_risk_critical");
  }
  if (synthesisConfidence <= 40) {
    convergenceFailures.push("synthesis_confidence_collapsed");
  }
  if (cadenceStability <= 35) {
    convergenceFailures.push("cadence_stability_unstable");
  }
  if (transportFreshness === "expired" && coordinationFresh === "expired") {
    convergenceFailures.push("transport_freshness_expired");
  }
  if (telemetryIntegrity <= 45) {
    convergenceFailures.push("telemetry_integrity_low");
  }
  if (narrativeContinuity <= 45) {
    convergenceFailures.push("narrative_continuity_degraded");
  }
  if (orchestrationStabilitySignal <= 20) {
    convergenceFailures.push("orchestration_stability_divergent");
  }

  const audio = params.audioIntelligence;
  const spectralContinuity = Number(
    clamp(audio?.spectral.spectralContinuity ?? synthesisConfidence * 0.85, 0, 100).toFixed(2),
  );
  const vocalSurvivability = Number(
    clamp(audio?.vocal.transitionSafety ?? phraseTimingSurvivability, 0, 100).toFixed(2),
  );
  const grooveStability = Number(clamp(audio?.grooveContinuity ?? cadenceStability * 0.9, 0, 100).toFixed(2));
  const dropContinuity = Number(clamp(audio?.drop.survivability ?? emotionalContinuity, 0, 100).toFixed(2));
  const audioConfidence = Number(clamp(audio?.audioConfidence ?? 58, 0, 100).toFixed(2));

  if (vocalSurvivability < 35 && (params.audioMixRecovered !== true)) {
    convergenceFailures.push("severe_vocal_collision");
  }
  if (grooveStability < 38) {
    convergenceFailures.push("groove_collapse");
  }
  if (dropContinuity < 32) {
    convergenceFailures.push("unstable_drop_carryover");
  }
  if (spectralContinuity < 36 && audio?.spectral.recommendation === "unsafe_overlap") {
    convergenceFailures.push("spectral_conflict_severe");
  }

  const convergenceScore = Number(
    clamp(
      narrativeContinuity * 0.14 +
        cadenceStability * 0.14 +
        synthesisConfidence * 0.14 +
        phraseTimingSurvivability * 0.14 +
        emotionalContinuity * 0.08 +
        telemetryIntegrity * 0.08 +
        spectralContinuity * 0.1 +
        vocalSurvivability * 0.08 +
        grooveStability * 0.1 +
        dropContinuity * 0.05 +
        audioConfidence * 0.05,
      0,
      100,
    ).toFixed(2),
  );

  const hardFail = convergenceFailures.length > 0;
  const converged = !hardFail && convergenceScore >= 68;

  let convergenceSeverity: OrchestrationConvergenceMetrics["convergenceSeverity"] = "stable";
  if (!converged && convergenceScore >= 52) {
    convergenceSeverity = "degraded";
  } else if (!converged) {
    convergenceSeverity = "divergent";
    console.log("[CONVERGENCE] candidate globally divergent", {
      candidateId: params.candidate.id,
      failures: convergenceFailures,
      convergenceScore,
    });
  } else {
    console.log("[CONVERGENCE] orchestration converged", { candidateId: params.candidate.id, convergenceScore });
  }

  return {
    convergenceScore,
    narrativeContinuity: Number(narrativeContinuity.toFixed(2)),
    cadenceStability: Number(cadenceStability.toFixed(2)),
    synthesisConfidence: Number(synthesisConfidence.toFixed(2)),
    phraseTimingSurvivability: Number(phraseTimingSurvivability.toFixed(2)),
    emotionalContinuity: Number(emotionalContinuity.toFixed(2)),
    telemetryIntegrity: Number(telemetryIntegrity.toFixed(2)),
    spectralContinuity,
    vocalSurvivability,
    grooveStability,
    dropContinuity,
    audioConfidence,
    converged,
    convergenceFailures,
    convergenceSeverity,
  };
}
