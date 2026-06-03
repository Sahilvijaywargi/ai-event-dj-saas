import "server-only";

import type { ExecutionValidationResult } from "@/lib/ai/execution-validation-types";
import type { AdaptiveOrchestrationStrategy } from "@/lib/ai/adaptive-orchestration";

export type StrategyOutcomeRecord = {
  strategy: AdaptiveOrchestrationStrategy;
  recordedAt: string;
  executionOutcome: ExecutionValidationResult["executionOutcome"];
  orchestrationDrift: number;
  rollbackSurvivability: number;
  recoverySuccess: boolean;
  cadenceStable: boolean;
  rollbackSuccess: boolean;
};

export type StrategyReliabilityProfile = {
  strategy: AdaptiveOrchestrationStrategy;
  reliabilityScore: number;
  survivabilityScore: number;
  driftFrequency: number;
  recoverySuccessRate: number;
  rollbackSuccessRate: number;
  sampleCount: number;
};

const strategyHistoryStore = new Map<string, StrategyOutcomeRecord[]>();
const MAX_RECORDS_PER_USER = 60;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asStrategy(value: string | undefined): AdaptiveOrchestrationStrategy | null {
  if (
    value === "fast_cut" ||
    value === "smooth_blend" ||
    value === "hold_state" ||
    value === "energy_ramp" ||
    value === "recovery_blend"
  ) {
    return value;
  }
  return null;
}

export function recordStrategyOutcome(params: {
  userId: string;
  strategy?: string;
  validation: ExecutionValidationResult;
  rollbackSurvivability?: number;
}) {
  const strategy = asStrategy(params.strategy);
  if (!strategy) return;

  const record: StrategyOutcomeRecord = {
    strategy,
    recordedAt: new Date().toISOString(),
    executionOutcome: params.validation.executionOutcome,
    orchestrationDrift: params.validation.orchestrationDrift,
    rollbackSurvivability: params.rollbackSurvivability ?? 0,
    recoverySuccess:
      params.validation.executionOutcome === "recovered" ||
      (params.validation.executionOutcome === "stable" && params.validation.recoveryDrift < 14),
    cadenceStable: params.validation.cadenceDrift < 16,
    rollbackSuccess: (params.rollbackSurvivability ?? 0) >= 55 && params.validation.survivabilityDelta >= -8,
  };

  const existing = strategyHistoryStore.get(params.userId) ?? [];
  strategyHistoryStore.set(params.userId, [record, ...existing].slice(0, MAX_RECORDS_PER_USER));
  console.log("[TRUST] strategy reliability updated", {
    strategy,
    outcome: record.executionOutcome,
    drift: record.orchestrationDrift,
  });
}

export function computeStrategyReliability(userId: string): {
  byStrategy: Partial<Record<AdaptiveOrchestrationStrategy, StrategyReliabilityProfile>>;
  globalReliability: number;
} {
  const records = strategyHistoryStore.get(userId) ?? [];
  const strategies: AdaptiveOrchestrationStrategy[] = [
    "fast_cut",
    "smooth_blend",
    "recovery_blend",
    "hold_state",
    "energy_ramp",
  ];

  const byStrategy: Partial<Record<AdaptiveOrchestrationStrategy, StrategyReliabilityProfile>> = {};
  let globalReliability = 62;

  for (const strategy of strategies) {
    const samples = records.filter((r) => r.strategy === strategy);
    if (!samples.length) {
      byStrategy[strategy] = {
        strategy,
        reliabilityScore: 60,
        survivabilityScore: 60,
        driftFrequency: 0,
        recoverySuccessRate: 0,
        rollbackSuccessRate: 0,
        sampleCount: 0,
      };
      continue;
    }

    const stableCount = samples.filter((s) => s.executionOutcome === "stable").length;
    const driftHits = samples.filter((s) => s.orchestrationDrift >= 22).length;
    const recoveryHits = samples.filter((s) => s.recoverySuccess).length;
    const rollbackHits = samples.filter((s) => s.rollbackSuccess).length;
    const cadenceHits = samples.filter((s) => s.cadenceStable).length;

    const reliabilityScore = Number(
      clamp(
        (stableCount / samples.length) * 55 +
          (cadenceHits / samples.length) * 20 +
          (rollbackHits / samples.length) * 15 +
          (1 - driftHits / samples.length) * 10,
        0,
        100,
      ).toFixed(2),
    );

    byStrategy[strategy] = {
      strategy,
      reliabilityScore,
      survivabilityScore: Number(
        clamp((rollbackHits / samples.length) * 50 + (recoveryHits / samples.length) * 50, 0, 100).toFixed(2),
      ),
      driftFrequency: Number(((driftHits / samples.length) * 100).toFixed(2)),
      recoverySuccessRate: Number(((recoveryHits / samples.length) * 100).toFixed(2)),
      rollbackSuccessRate: Number(((rollbackHits / samples.length) * 100).toFixed(2)),
      sampleCount: samples.length,
    };
  }

  const scored = Object.values(byStrategy).filter((p) => p && p.sampleCount > 0) as StrategyReliabilityProfile[];
  if (scored.length) {
    globalReliability = Number(
      (scored.reduce((sum, p) => sum + p.reliabilityScore, 0) / scored.length).toFixed(2),
    );
  }

  return { byStrategy, globalReliability };
}

export function getStrategyReliabilityPenalty(
  strategy: AdaptiveOrchestrationStrategy,
  userId: string,
): number {
  const { byStrategy } = computeStrategyReliability(userId);
  const profile = byStrategy[strategy];
  if (!profile || profile.sampleCount < 2) return 0;
  if (profile.reliabilityScore < 45) return 14;
  if (profile.reliabilityScore < 58) return 8;
  if (profile.reliabilityScore > 78) return -4;
  return 0;
}
