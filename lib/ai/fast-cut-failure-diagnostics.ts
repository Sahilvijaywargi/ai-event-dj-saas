import "server-only";

import type { AdaptiveOrchestrationCandidate } from "@/lib/ai/adaptive-orchestration";
import type { SimulationInstabilitySignals } from "@/lib/ai/adaptive-orchestration";
import type { OrchestrationConvergenceMetrics } from "@/lib/ai/orchestration-convergence";
import { simulateCandidateExecution } from "@/lib/ai/orchestration-candidate-engine";
import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransitionSimulationResult } from "@/lib/ai/transition-simulation";

export type FastCutStabilityContributions = {
  phraseStability: number;
  harmonicStability: number;
  structuralConfidence: number;
  narrativeContinuity: number;
  crowdMomentum: number;
  recoveryPressure: number;
  executionStability: number;
};

export type FastCutFailureDimension =
  | "phraseStability"
  | "harmonicStability"
  | "structuralConfidence"
  | "narrativeContinuity"
  | "crowdMomentum"
  | "recoveryPressure"
  | "executionStability";

export type FastCutRejectedCandidateDiagnostic = {
  candidateId: string;
  rejected: boolean;
  globallyDivergent: boolean;
  rejectionReasons: string[];
  contributions: FastCutStabilityContributions;
  rankedFailureReasons: FastCutRankedFailureReason[];
};

export type FastCutRankedFailureReason = {
  dimension: FastCutFailureDimension | "explicit_rejection";
  reason: string;
  severity: number;
  contribution: number;
};

export type FastCutFailureDiagnostics = {
  fastCutSimulationCount: number;
  fastCutCandidateCount: number;
  rejectedFastCutCount: number;
  instabilityDetected: boolean;
  instabilitySignals: string[];
  simulationRiskReasons: string[];
  rejectedCandidates: FastCutRejectedCandidateDiagnostic[];
  rankedFailureReasons: FastCutRankedFailureReason[];
  summary: string;
};

const VIABILITY_THRESHOLD = 58;
const RECOVERY_PRESSURE_CEILING = 72;

const DIMENSION_LABELS: Record<FastCutFailureDimension, string> = {
  phraseStability: "Phrase stability",
  harmonicStability: "Harmonic stability",
  structuralConfidence: "Structural confidence",
  narrativeContinuity: "Narrative continuity",
  crowdMomentum: "Crowd momentum",
  recoveryPressure: "Recovery pressure",
  executionStability: "Execution stability",
};

const EXPLICIT_REJECTION_SEVERITY: Record<string, { dimension: FastCutFailureDimension | "explicit_rejection"; severity: number; label: string }> = {
  aggressive_strategy_blocked_by_transport_instability: {
    dimension: "executionStability",
    severity: 92,
    label: "Transport instability blocked aggressive fast cut",
  },
  narrow_window_rejected_under_transport_instability: {
    dimension: "executionStability",
    severity: 84,
    label: "Narrow execution window rejected under transport instability",
  },
  fast_cut_instability_loop: {
    dimension: "executionStability",
    severity: 88,
    label: "Repeated fast-cut instability loop detected in simulation",
  },
  convergence_phrase_timing_risk_critical: {
    dimension: "phraseStability",
    severity: 86,
    label: "Phrase timing risk critical for fast-cut entry",
  },
  convergence_synthesis_confidence_collapsed: {
    dimension: "structuralConfidence",
    severity: 82,
    label: "Orchestration synthesis confidence collapsed",
  },
  convergence_cadence_stability_unstable: {
    dimension: "phraseStability",
    severity: 78,
    label: "Cadence stability too unstable for fast cut",
  },
  convergence_transport_freshness_expired: {
    dimension: "executionStability",
    severity: 80,
    label: "Transport freshness expired during simulation",
  },
  convergence_telemetry_integrity_low: {
    dimension: "executionStability",
    severity: 76,
    label: "Telemetry integrity too low for fast-cut execution",
  },
  convergence_narrative_continuity_degraded: {
    dimension: "narrativeContinuity",
    severity: 74,
    label: "Narrative continuity degraded under fast-cut aggression",
  },
  convergence_orchestration_stability_divergent: {
    dimension: "executionStability",
    severity: 90,
    label: "Orchestration stability diverged during fast-cut projection",
  },
  convergence_severe_vocal_collision: {
    dimension: "phraseStability",
    severity: 85,
    label: "Severe vocal collision risk in fast-cut window",
  },
  convergence_groove_collapse: {
    dimension: "crowdMomentum",
    severity: 72,
    label: "Groove collapse undermines fast-cut crowd carryover",
  },
  convergence_unstable_drop_carryover: {
    dimension: "structuralConfidence",
    severity: 80,
    label: "Unstable drop carryover invalidates fast-cut timing",
  },
  convergence_spectral_conflict_severe: {
    dimension: "harmonicStability",
    severity: 83,
    label: "Severe spectral conflict in fast-cut overlap",
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(clamp(value, 0, 100).toFixed(2));
}

function computeAverage(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatRejectionKey(reason: string) {
  if (reason.startsWith("convergence_")) return reason;
  return reason;
}

function computeFastCutContributions(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  candidate: AdaptiveOrchestrationCandidate;
  instability: SimulationInstabilitySignals;
  convergenceMetrics?: OrchestrationConvergenceMetrics | null;
}): FastCutStabilityContributions {
  const fastCutSteps = params.simulation.timeline.steps.filter((step) => step.executionStrategy === "fast_cut");
  const phraseFromSim = computeAverage(
    fastCutSteps.map((step) => step.transitionWindowConfidence * 0.45 + step.structuralContinuityProjection * 0.55),
  );
  const harmonicFromSim = computeAverage(fastCutSteps.map((step) => step.harmonicScore));
  const executionFromSim = computeAverage(params.simulation.timeline.projectedExecutionStability);

  const projection = simulateCandidateExecution({
    candidate: params.candidate,
    evaluation: params.evaluation,
    simulation: params.simulation,
    instability: params.instability,
  });

  const phraseStability = round(
    params.evaluation.phraseStability * 0.42 +
      params.evaluation.transitionDiagnostics.phraseAlignmentScore * 0.28 +
      (params.convergenceMetrics?.phraseTimingSurvivability ?? params.candidate.phraseSurvivability ?? 50) * 0.18 +
      phraseFromSim * 0.12,
  );

  const harmonicStability = round(
    params.evaluation.harmonicCompatibility * 0.38 +
      params.evaluation.transitionDiagnostics.harmonicCompatibilityScore * 0.34 +
      harmonicFromSim * 0.18 +
      params.evaluation.tonalStability * 0.1,
  );

  const structuralConfidence = round(
    params.evaluation.transitionDiagnostics.structuralConfidence * 0.55 +
      (params.evaluation.structuralCompatibility?.structuralConfidence ??
        params.evaluation.transitionDiagnostics.structuralCompatibility) *
        0.25 +
      (params.convergenceMetrics?.synthesisConfidence ?? params.evaluation.orchestrationSynthesisConfidence) * 0.2,
  );

  const narrativeContinuity = round(
    params.evaluation.narrativeContinuity * 0.55 +
      (params.convergenceMetrics?.narrativeContinuity ?? params.evaluation.narrativeContinuity) * 0.25 +
      projection.narrativeStability * 0.2,
  );

  const crowdMomentum = round(
    params.evaluation.crowdMomentumScore * 0.62 +
      computeAverage(
        fastCutSteps.map((step) => step.crowdMomentumProjection ?? params.evaluation.crowdMomentumScore),
      ) *
        0.22 +
      params.evaluation.crowdEngagementConfidence * 0.16,
  );

  const recoveryPressure = round(
    projection.predictedRecoveryPressure * 0.55 +
      params.evaluation.narrativeRecoveryPressure * 0.2 +
      params.simulation.riskForecast.escalationProbability * 0.25,
  );

  const executionStability = round(
    projection.projectedExecutionStability * 0.45 +
      (params.candidate.executionStability > 0 ? params.candidate.executionStability : executionFromSim) * 0.3 +
      params.evaluation.transportStability * 0.15 +
      (params.instability.fastCutInstability ? -12 : 4),
  );

  return {
    phraseStability,
    harmonicStability,
    structuralConfidence,
    narrativeContinuity,
    crowdMomentum,
    recoveryPressure,
    executionStability,
  };
}

function rankContributionFailures(contributions: FastCutStabilityContributions): FastCutRankedFailureReason[] {
  const reasons: FastCutRankedFailureReason[] = [];

  for (const dimension of Object.keys(DIMENSION_LABELS) as FastCutFailureDimension[]) {
    const contribution = contributions[dimension];
    if (dimension === "recoveryPressure") {
      const excess = Math.max(0, contribution - RECOVERY_PRESSURE_CEILING);
      if (excess > 0) {
        reasons.push({
          dimension,
          reason: `${DIMENSION_LABELS[dimension]} elevated (${contribution.toFixed(0)} > ${RECOVERY_PRESSURE_CEILING})`,
          severity: round(excess * 1.1 + 20),
          contribution,
        });
      }
      continue;
    }

    const deficit = Math.max(0, VIABILITY_THRESHOLD - contribution);
    if (deficit > 0) {
      reasons.push({
        dimension,
        reason: `${DIMENSION_LABELS[dimension]} below viability threshold (${contribution.toFixed(0)} < ${VIABILITY_THRESHOLD})`,
        severity: round(deficit * 1.25 + 10),
        contribution,
      });
    }
  }

  return reasons.sort((a, b) => b.severity - a.severity);
}

function rankExplicitRejections(rejectionReasons: string[]): FastCutRankedFailureReason[] {
  const reasons: FastCutRankedFailureReason[] = [];
  for (const raw of rejectionReasons) {
    const key = formatRejectionKey(raw);
    const mapped = EXPLICIT_REJECTION_SEVERITY[key];
    if (mapped) {
      reasons.push({
        dimension: mapped.dimension,
        reason: mapped.label,
        severity: mapped.severity,
        contribution: 0,
      });
      continue;
    }
    reasons.push({
      dimension: "explicit_rejection",
      reason: raw.replace(/_/g, " "),
      severity: 70,
      contribution: 0,
    });
  }
  return reasons;
}

function mergeRankedReasons(
  contributionReasons: FastCutRankedFailureReason[],
  explicitReasons: FastCutRankedFailureReason[],
): FastCutRankedFailureReason[] {
  const merged = [...explicitReasons, ...contributionReasons];
  const byKey = new Map<string, FastCutRankedFailureReason>();
  for (const reason of merged) {
    const key = `${reason.dimension}:${reason.reason}`;
    const existing = byKey.get(key);
    if (!existing || reason.severity > existing.severity) {
      byKey.set(key, reason);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.severity - a.severity);
}

function buildSummary(params: {
  rejectedCount: number;
  fastCutSimulationCount: number;
  instabilityDetected: boolean;
  topReason: FastCutRankedFailureReason | null;
}): string {
  if (params.rejectedCount === 0 && params.fastCutSimulationCount < 2) {
    return "No rejected fast-cut orchestration candidates; simulation did not show repeated fast-cut instability.";
  }
  if (params.rejectedCount === 0 && params.fastCutSimulationCount >= 2) {
    return `Simulation projected ${params.fastCutSimulationCount} fast-cut steps with instability signals, but no fast-cut orchestration candidate was formally rejected.`;
  }
  const lead = params.topReason?.reason ?? "Multiple stability dimensions fell below fast-cut viability.";
  if (params.instabilityDetected) {
    return `${params.rejectedCount} fast-cut candidate(s) rejected after simulation instability — primary driver: ${lead}`;
  }
  return `${params.rejectedCount} fast-cut candidate(s) rejected — primary driver: ${lead}`;
}

export function analyzeFastCutFailureDiagnostics(params: {
  evaluation: TransitionEvaluationResult;
  simulation: TransitionSimulationResult;
  instability: SimulationInstabilitySignals;
  candidates: AdaptiveOrchestrationCandidate[];
  convergenceByCandidateId?: Map<string, OrchestrationConvergenceMetrics>;
}): FastCutFailureDiagnostics {
  const fastCutSimulationCount = params.simulation.timeline.steps.filter(
    (step) => step.executionStrategy === "fast_cut",
  ).length;

  const fastCutCandidates = params.candidates.filter((candidate) => candidate.strategy === "fast_cut");
  const failedFastCutCandidates = fastCutCandidates.filter(
    (candidate) => candidate.rejected || candidate.globallyDivergent,
  );

  const rejectedCandidates: FastCutRejectedCandidateDiagnostic[] = failedFastCutCandidates.map((candidate) => {
    const convergenceMetrics = params.convergenceByCandidateId?.get(candidate.id) ?? null;
    const contributions = computeFastCutContributions({
      evaluation: params.evaluation,
      simulation: params.simulation,
      candidate,
      instability: params.instability,
      convergenceMetrics,
    });
    const contributionReasons = rankContributionFailures(contributions);
    const explicitReasons = rankExplicitRejections(candidate.rejectionReasons);
    const rankedFailureReasons = mergeRankedReasons(contributionReasons, explicitReasons);

    return {
      candidateId: candidate.id,
      rejected: candidate.rejected,
      globallyDivergent: candidate.globallyDivergent ?? false,
      rejectionReasons: candidate.rejectionReasons,
      contributions,
      rankedFailureReasons,
    };
  });

  const aggregateReasons = mergeRankedReasons(
    rejectedCandidates.flatMap((candidate) =>
      rankContributionFailures(candidate.contributions).map((reason) => ({
        ...reason,
        reason: `${candidate.candidateId}: ${reason.reason}`,
      })),
    ),
    rejectedCandidates.flatMap((candidate) =>
      rankExplicitRejections(candidate.rejectionReasons).map((reason) => ({
        ...reason,
        reason: `${candidate.candidateId}: ${reason.reason}`,
      })),
    ),
  );

  const simulationRiskReasons = params.simulation.riskForecast.riskReasons.filter((reason) =>
    /fast.?cut|harmonic|phrase|execution|stability|readiness|synchronization/i.test(reason),
  );

  return {
    fastCutSimulationCount,
    fastCutCandidateCount: fastCutCandidates.length,
    rejectedFastCutCount: failedFastCutCandidates.length,
    instabilityDetected: params.instability.refinementRequired,
    instabilitySignals: params.instability.signals,
    simulationRiskReasons,
    rejectedCandidates,
    rankedFailureReasons: aggregateReasons.slice(0, 12),
    summary: buildSummary({
      rejectedCount: failedFastCutCandidates.length,
      fastCutSimulationCount,
      instabilityDetected: params.instability.refinementRequired,
      topReason: aggregateReasons[0] ?? null,
    }),
  };
}
