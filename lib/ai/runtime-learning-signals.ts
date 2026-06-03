import type { ExecutionDriftBreakdown } from "@/lib/ai/execution-validation-types";
import type { ExecutionValidationResult } from "@/lib/ai/execution-validation-types";

export interface RuntimeLearningSignal {
  category: "phrase_timing" | "cadence" | "transport" | "rollback" | "recovery" | "crowd_flow";
  severity: "low" | "moderate" | "high";
  description: string;
  confidence: number;
}

export function extractRuntimeLearningSignals(params: {
  validation: ExecutionValidationResult;
  drift: ExecutionDriftBreakdown;
  candidateStrategy?: string;
}): RuntimeLearningSignal[] {
  const signals: RuntimeLearningSignal[] = [];
  const { validation, drift } = params;

  if (drift.phraseDrift >= 18) {
    signals.push({
      category: "phrase_timing",
      severity: drift.phraseDrift >= 32 ? "high" : "moderate",
      description: "Repeated phrase timing prediction mismatch under live execution.",
      confidence: Number(Math.min(0.95, 0.55 + drift.phraseDrift / 100).toFixed(2)),
    });
  }

  if (drift.cadenceDrift >= 16) {
    signals.push({
      category: "cadence",
      severity: drift.cadenceDrift >= 28 ? "high" : "moderate",
      description: "Cadence collapse pattern detected between predicted and actual runtime.",
      confidence: Number(Math.min(0.92, 0.5 + drift.cadenceDrift / 100).toFixed(2)),
    });
  }

  if (drift.transportDrift >= 20) {
    signals.push({
      category: "transport",
      severity: drift.transportDrift >= 35 ? "high" : "moderate",
      description: "Transport degradation correlated with execution drift.",
      confidence: Number(Math.min(0.9, 0.48 + drift.transportDrift / 100).toFixed(2)),
    });
  }

  if (validation.survivabilityDelta < -12) {
    signals.push({
      category: "rollback",
      severity: validation.survivabilityDelta < -22 ? "high" : "moderate",
      description: "Rollback survivability underestimated relative to live mutation outcome.",
      confidence: 0.78,
    });
  }

  if (params.candidateStrategy === "recovery_blend" && validation.executionOutcome === "stable") {
    signals.push({
      category: "recovery",
      severity: "low",
      description: "Recovery blend candidate demonstrated positive live survivability.",
      confidence: 0.72,
    });
  }

  if (validation.predictedRecoveryPressure > 65 && validation.actualRecoveryPressure < 45) {
    signals.push({
      category: "crowd_flow",
      severity: "low",
      description: "Crowd recovery pressure was over-estimated; actual flow remained stable.",
      confidence: 0.64,
    });
  }

  if (drift.driftSeverity === "severe") {
    signals.push({
      category: "recovery",
      severity: "high",
      description: "Severe execution drift requires conservative orchestration calibration.",
      confidence: 0.88,
    });
  }

  console.log("[EXECUTION] learning signals extracted", { count: signals.length });
  return signals;
}
