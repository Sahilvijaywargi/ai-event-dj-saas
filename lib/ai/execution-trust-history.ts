import "server-only";

import type { ExecutionValidationResult } from "@/lib/ai/execution-validation-types";
import type { AdaptiveOrchestrationStrategy } from "@/lib/ai/adaptive-orchestration";

export type ExecutionTrustRecord = {
  executionId: string;
  recordedAt: string;
  candidateStrategy: string;
  convergenceScore: number;
  executionOutcome: ExecutionValidationResult["executionOutcome"];
  orchestrationDrift: number;
  rollbackSurvivability: number;
  trustDelta: number;
  validationSeverity: ExecutionValidationResult["validationSeverity"];
  predictedStability: number;
  actualStability: number;
  recoveryDrift: number;
  phraseDrift: number;
  driftSeverity: ExecutionValidationResult["driftSeverity"];
};

const trustHistoryStore = new Map<string, ExecutionTrustRecord[]>();
const MAX_RECORDS_PER_USER = 40;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function recordExecutionValidation(params: {
  userId: string;
  validation: ExecutionValidationResult;
  candidateStrategy?: string;
  convergenceScore?: number;
  rollbackSurvivability?: number;
}) {
  const record: ExecutionTrustRecord = {
    executionId: params.validation.executionId,
    recordedAt: new Date().toISOString(),
    candidateStrategy: params.candidateStrategy ?? "unknown",
    convergenceScore: params.convergenceScore ?? 0,
    executionOutcome: params.validation.executionOutcome,
    orchestrationDrift: params.validation.orchestrationDrift,
    rollbackSurvivability: params.rollbackSurvivability ?? 0,
    trustDelta: params.validation.executionTrustDelta,
    validationSeverity: params.validation.validationSeverity,
    predictedStability: params.validation.predictedExecutionStability,
    actualStability: params.validation.actualExecutionStability,
    recoveryDrift: params.validation.recoveryDrift,
    phraseDrift: params.validation.phraseDrift,
    driftSeverity: params.validation.driftSeverity,
  };
  const existing = trustHistoryStore.get(params.userId) ?? [];
  trustHistoryStore.set(params.userId, [record, ...existing].slice(0, MAX_RECORDS_PER_USER));
  console.log("[EXECUTION] trust adjusted", {
    userId: params.userId,
    trustDelta: record.trustDelta,
    outcome: record.executionOutcome,
  });
}

export function computeHistoricalExecutionTrust(userId: string): {
  trustScore: number;
  sampleCount: number;
  strategyPenalties: Partial<Record<AdaptiveOrchestrationStrategy, number>>;
} {
  const records = trustHistoryStore.get(userId) ?? [];
  if (!records.length) {
    return { trustScore: 62, sampleCount: 0, strategyPenalties: {} };
  }

  let trustScore = 70;
  const strategyPenalties: Partial<Record<AdaptiveOrchestrationStrategy, number>> = {};

  for (const record of records) {
    trustScore += record.trustDelta;
    if (record.validationSeverity === "critical") trustScore -= 4;
    if (record.validationSeverity === "healthy") trustScore += 1;
    if (record.executionOutcome === "stable") trustScore += 0.8;
    if (record.executionOutcome === "failed") trustScore -= 6;

    const strategy = record.candidateStrategy as AdaptiveOrchestrationStrategy;
    const penalty = strategyPenalties[strategy] ?? 0;
    if (record.orchestrationDrift > 25) {
      strategyPenalties[strategy] = penalty + 3;
    } else if (record.executionOutcome === "stable" && record.orchestrationDrift < 12) {
      strategyPenalties[strategy] = penalty - 1;
    }
  }

  trustScore = Number(clamp(trustScore / Math.max(1, records.length * 0.35 + 0.65), 0, 100).toFixed(2));

  return {
    trustScore,
    sampleCount: records.length,
    strategyPenalties,
  };
}

export function getExecutionTrustRecords(userId: string): ExecutionTrustRecord[] {
  return trustHistoryStore.get(userId) ?? [];
}

export function getStrategyHistoricalTrustPenalty(
  strategy: AdaptiveOrchestrationStrategy,
  userId: string,
): number {
  const { strategyPenalties } = computeHistoricalExecutionTrust(userId);
  return strategyPenalties[strategy] ?? 0;
}
