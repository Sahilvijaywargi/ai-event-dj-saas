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
};
