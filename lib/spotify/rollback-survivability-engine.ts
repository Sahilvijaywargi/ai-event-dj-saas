import "server-only";

import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import type { TransportRuntimeState } from "@/lib/transition-orchestration/layer-state";
import { computeMutationReliability, getMutationHistory } from "@/lib/spotify/mutation-journal";
import {
  computeCheckpointCoverage,
  getCheckpoints,
  getLatestCheckpoint,
} from "@/lib/spotify/mutation-checkpoint-engine";
import { analyzeTransportRecovery, type TransportRecoveryAnalysis } from "@/lib/spotify/transport-recovery-engine";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type QueueRollbackSnapshot = {
  currentTrackUri: string | null;
  queueHeadUri: string | null;
  playbackPositionMs: number | null;
  snapshotHash?: string;
  snapshotCreatedAt?: number;
};

export interface RollbackSurvivabilityResult {
  rollbackReadiness: number;
  snapshotIntegrity: number;
  replayConfidence: number;
  transportRecoveryConfidence: number;
  queueRecoveryConfidence: number;
  mutationCheckpointCoverage: number;
  survivabilityScore: number;
  blockers: string[];
  recommendations: string[];
  survivable: boolean;
}

export function evaluateRollbackSurvivability(params: {
  userId: string;
  evaluation?: TransitionEvaluationResult | null;
  executionState?: {
    rollbackSnapshot?: QueueRollbackSnapshot | null;
    rollbackIntegrity?: number;
    rollbackIntegrityScore?: number;
    rollbackConfidence?: number;
    verificationFinalized?: boolean;
    verificationSnapshotReliability?: number;
    verificationRecoveryConfidence?: number;
    transportIntegrityScore?: number;
    mutationRecoverabilityScore?: number;
  } | null;
  transportRuntime?: TransportRuntimeState | null;
  queueUris?: string[];
  playbackActive?: boolean;
  transportRecovery?: TransportRecoveryAnalysis | null;
}): RollbackSurvivabilityResult {
  console.log("[ROLLBACK] survivability evaluation started", { userId: params.userId });

  const snapshot = params.executionState?.rollbackSnapshot ?? null;
  const snapshotComplete = Boolean(
    snapshot?.currentTrackUri && snapshot?.queueHeadUri && snapshot.playbackPositionMs !== null,
  );

  const snapshotIntegrity = Number(
    clamp(
      (snapshotComplete ? 72 : 28) +
        (params.executionState?.verificationSnapshotReliability ?? 0) * 0.18 +
        (params.executionState?.verificationFinalized ? 10 : 0),
      0,
      100,
    ).toFixed(2),
  );

  const replayConfidence = Number(
    clamp(
      (params.executionState?.rollbackConfidence ??
        params.executionState?.rollbackIntegrity ??
        params.executionState?.rollbackIntegrityScore ??
        50) *
        0.55 +
        snapshotIntegrity * 0.25 +
        (params.playbackActive !== false ? 12 : 0) +
        (params.executionState?.verificationRecoveryConfidence ?? 0) * 0.1,
      0,
      100,
    ).toFixed(2),
  );

  const transportRecovery =
    params.transportRecovery ??
    analyzeTransportRecovery({
      userId: params.userId,
      transportRuntime: params.transportRuntime,
      deviceSynchronizationConfidence: params.evaluation?.deviceSynchronizationConfidence,
      transportStability: params.evaluation?.transportStability ?? params.executionState?.transportIntegrityScore,
      heartbeatContinuity: params.evaluation?.heartbeatContinuity,
      rollbackIntegrity:
        params.executionState?.rollbackIntegrity ?? params.executionState?.rollbackIntegrityScore,
      queueContinuityScore: params.transportRuntime?.queueContinuityScore,
    });

  const transportRecoveryConfidence = transportRecovery.confidence;

  const queueRecoveryConfidence = Number(
    clamp(
      transportRecovery.queueRecoverability * 0.45 +
        (params.queueUris?.length ? 18 : 8) +
        (params.transportRuntime?.queueContinuityScore ?? 55) * 0.37,
      0,
      100,
    ).toFixed(2),
  );

  const mutationCheckpointCoverage = computeCheckpointCoverage(params.userId);
  const checkpoint = getLatestCheckpoint(params.userId);
  if (checkpoint) {
    console.log("[ROLLBACK] replay confidence updated", {
      checkpointId: checkpoint.checkpointId,
      rollbackConfidence: checkpoint.rollbackConfidence,
    });
  }

  const mutationReliability = computeMutationReliability(params.userId);

  const rollbackReadiness = Number(
    clamp(
      snapshotIntegrity * 0.2 +
        replayConfidence * 0.2 +
        transportRecoveryConfidence * 0.2 +
        queueRecoveryConfidence * 0.15 +
        mutationCheckpointCoverage * 0.15 +
        mutationReliability * 0.1,
      0,
      100,
    ).toFixed(2),
  );

  const survivabilityScore = Number(
    clamp(
      rollbackReadiness * 0.45 +
        transportRecovery.recoveryScore * 0.25 +
        replayConfidence * 0.15 +
        mutationReliability * 0.15,
      0,
      100,
    ).toFixed(2),
  );

  const blockers: string[] = [];
  const recommendations: string[] = [];

  if (snapshotIntegrity < 50) {
    blockers.push("snapshot_integrity_insufficient");
    recommendations.push("Refresh rollback snapshot before queue mutation.");
  }
  if (replayConfidence < 52) {
    blockers.push("replay_confidence_low");
    recommendations.push("Stabilize playback verification before execution.");
  }
  if (transportRecoveryConfidence < 55) {
    blockers.push("transport_recovery_confidence_low");
    recommendations.push(`Apply ${transportRecovery.recoveryStrategy.replace(/_/g, " ")} recovery path.`);
  }
  if (mutationCheckpointCoverage < 45 && getCheckpoints(params.userId).length < 2) {
    recommendations.push("Create additional mutation checkpoints during prepare window.");
  }
  if (getMutationHistory(params.userId).filter((e) => !e.success).length >= 2) {
    recommendations.push("Review mutation journal — recent failures reduce reliability.");
  }

  const survivable =
    rollbackReadiness > 55 &&
    survivabilityScore > 60 &&
    transportRecoveryConfidence > 60 &&
    blockers.length === 0;

  if (!survivable && params.evaluation?.rollbackReadiness) {
    recommendations.push(
      `Orchestration estimate ${params.evaluation.rollbackReadiness.toFixed(0)} superseded by survivability model ${rollbackReadiness.toFixed(0)}.`,
    );
  }

  return {
    rollbackReadiness,
    snapshotIntegrity,
    replayConfidence,
    transportRecoveryConfidence,
    queueRecoveryConfidence,
    mutationCheckpointCoverage,
    survivabilityScore,
    blockers,
    recommendations,
    survivable,
  };
}
