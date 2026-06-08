import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type {
  AdaptiveOrchestrationCandidate,
  AdaptiveOrchestrationStrategy,
} from "@/lib/ai/adaptive-orchestration";

export type OrchestrationRefinementTelemetry = {
  refinementTriggered: boolean;
  baselineStability: number;
  selectedStability: number;
  stabilityDelta: number;
  baselineRollbackSurvivability: number;
  selectedRollbackSurvivability: number;
  rollbackSurvivabilityDelta: number;
  aggressionDecay: number;
  executionWindowAdaptation: string;
  baselineStrategy: string;
  selectedStrategy: string;
};

import type { OrchestrationConvergenceMetrics } from "@/lib/ai/orchestration-convergence";
export type { OrchestrationConvergenceMetrics };

export type PhraseRecoveryDirectiveSnapshot = {
  strategy: "delay_blend" | "hold_phrase" | "cooldown_transition" | "rephrase_alignment";
  recoveryGain: number;
  timingRiskReduction: number;
  cadenceRecovery: number;
  reasoning: string[];
};

export type { ExecutionValidationResult } from "@/lib/ai/execution-validation-types";
export type { RuntimeTrustCalibration } from "@/lib/ai/runtime-trust-calibration";
export type { AutonomyReadinessResult } from "@/lib/ai/autonomy-readiness-engine";
export type { PhraseWindowAnalysis } from "@/lib/ai/phrase-window-engine";
export type { PhraseRecoveryResult } from "@/lib/ai/phrase-lock-recovery";
export type { ConvergenceRecoveryResult } from "@/lib/ai/convergence-recovery-engine";
export type { AudioIntelligenceResult } from "@/lib/ai/audio-intelligence-engine";

export type { FastCutFailureDiagnostics } from "@/lib/ai/fast-cut-failure-diagnostics";
export type { ConvergenceNarrativeStabilitySnapshot } from "@/lib/ai/convergence-narrative-stability";

export type OrchestrationRefinementResult = {
  instabilityDetected: boolean;
  instabilitySignals: string[];
  candidates: AdaptiveOrchestrationCandidate[];
  rankedCandidates: AdaptiveOrchestrationCandidate[];
  selectedCandidate: AdaptiveOrchestrationCandidate;
  previousStrategy: AdaptiveOrchestrationStrategy;
  adaptationWarnings: string[];
  adaptationReasoning: string[];
  refinementTelemetry: OrchestrationRefinementTelemetry;
  refinedEvaluation: TransitionEvaluationResult;
  convergenceMetrics: OrchestrationConvergenceMetrics;
  phraseRecovery: PhraseRecoveryDirectiveSnapshot | null;
  globalConvergenceState: "stable" | "degraded" | "divergent";
  candidateConvergence: Array<{ candidateId: string; metrics: OrchestrationConvergenceMetrics }>;
  fastCutFailureDiagnostics: import("@/lib/ai/fast-cut-failure-diagnostics").FastCutFailureDiagnostics;
  convergenceNarrativeStability?: import("@/lib/ai/convergence-narrative-stability").ConvergenceNarrativeStabilitySnapshot;
  runtimeTrustCalibration?: import("@/lib/ai/runtime-trust-calibration").RuntimeTrustCalibration | null;
  autonomyReadiness?: import("@/lib/ai/autonomy-readiness-engine").AutonomyReadinessResult | null;
  phraseWindowAnalysis?: import("@/lib/ai/phrase-window-engine").PhraseWindowAnalysis | null;
  phraseLockRecovery?: import("@/lib/ai/phrase-lock-recovery").PhraseRecoveryResult | null;
  convergenceRecovery?: import("@/lib/ai/convergence-recovery-engine").ConvergenceRecoveryResult | null;
};
