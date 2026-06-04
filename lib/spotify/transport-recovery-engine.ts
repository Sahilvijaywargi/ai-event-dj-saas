import "server-only";

import type { TransportRuntimeState } from "@/lib/transition-orchestration/layer-state";
import { computeMutationReliability } from "@/lib/spotify/mutation-journal";
import {
  computeCheckpointCoverage,
  getLatestCheckpoint,
} from "@/lib/spotify/mutation-checkpoint-engine";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export interface TransportRecoveryAnalysis {
  recoveryScore: number;
  deviceContinuity: number;
  playbackContinuity: number;
  queueRecoverability: number;
  rollbackRecoverability: number;
  mutationRisk: number;
  recoveryStrategy:
    | "instant_recovery"
    | "checkpoint_restore"
    | "queue_rebuild"
    | "full_rollback";
  confidence: number;
}

export function analyzeTransportRecovery(params: {
  userId: string;
  transportRuntime?: TransportRuntimeState | null;
  deviceSynchronizationConfidence?: number;
  transportStability?: number;
  heartbeatContinuity?: number;
  rollbackIntegrity?: number;
  queueContinuityScore?: number;
}): TransportRecoveryAnalysis {
  console.log("[TRANSPORT] recovery analysis started", { userId: params.userId });

  const deviceContinuity = Number(
    clamp(
      params.deviceSynchronizationConfidence ??
        params.transportRuntime?.deviceSynchronizationConfidence ??
        55,
      0,
      100,
    ).toFixed(2),
  );

  const playbackContinuity = Number(
    clamp(
      params.heartbeatContinuity ?? params.transportRuntime?.heartbeatContinuity ?? 60,
      0,
      100,
    ).toFixed(2),
  );

  const queueRecoverability = Number(
    clamp(
      params.queueContinuityScore ?? params.transportRuntime?.queueContinuityScore ?? 58,
      0,
      100,
    ).toFixed(2),
  );

  const checkpoint = getLatestCheckpoint(params.userId);
  const checkpointCoverage = computeCheckpointCoverage(params.userId);
  const rollbackRecoverability = Number(
    clamp(
      (params.rollbackIntegrity ?? params.transportRuntime?.rollbackContinuityScore ?? 50) * 0.55 +
        checkpointCoverage * 0.45,
      0,
      100,
    ).toFixed(2),
  );

  const mutationReliability = computeMutationReliability(params.userId);
  const transportStability =
    params.transportStability ?? params.transportRuntime?.transportStability ?? 55;

  const mutationRisk = Number(
    clamp(
      100 -
        transportStability * 0.35 -
        deviceContinuity * 0.25 -
        playbackContinuity * 0.2 -
        mutationReliability * 0.2,
      0,
      100,
    ).toFixed(2),
  );

  const recoveryScore = Number(
    clamp(
      deviceContinuity * 0.22 +
        playbackContinuity * 0.22 +
        queueRecoverability * 0.2 +
        rollbackRecoverability * 0.22 +
        mutationReliability * 0.14,
      0,
      100,
    ).toFixed(2),
  );

  let recoveryStrategy: TransportRecoveryAnalysis["recoveryStrategy"] = "instant_recovery";
  if (recoveryScore < 45 || mutationRisk >= 65) {
    recoveryStrategy = "full_rollback";
  } else if (recoveryScore < 58 || !checkpoint?.recoverable) {
    recoveryStrategy = "queue_rebuild";
  } else if (checkpoint && checkpoint.rollbackConfidence >= 62) {
    recoveryStrategy = "checkpoint_restore";
  }

  const confidence = Number(
    clamp(recoveryScore - mutationRisk * 0.25 + (checkpoint?.recoverable ? 6 : 0), 0, 100).toFixed(2),
  );

  console.log("[TRANSPORT] recovery strategy selected", { recoveryStrategy, confidence, recoveryScore });

  return {
    recoveryScore,
    deviceContinuity,
    playbackContinuity,
    queueRecoverability,
    rollbackRecoverability,
    mutationRisk,
    recoveryStrategy,
    confidence,
  };
}
