import "server-only";

import type { TransportRuntimeState, TransportFreshness } from "@/lib/transition-orchestration/layer-state";
import {
  evaluateTelemetryFreshness,
  refreshDeviceHeartbeat,
  refreshPlaybackHeartbeat,
  refreshQueueHeartbeat,
} from "@/lib/runtime/telemetry-heartbeat";
import { TransportMutationResult, verifyActivePlaybackDevice } from "@/lib/spotify/transport-orchestrator";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function freshnessFromAgeMs(ageMs: number): TransportFreshness {
  if (ageMs < 8_000) return "healthy";
  if (ageMs < 18_000) return "aging";
  if (ageMs < 35_000) return "stale";
  return "expired";
}

function syncHealthFromConfidence(confidence: number): TransportRuntimeState["deviceSyncHealth"] {
  if (confidence >= 72) return "healthy";
  if (confidence >= 50) return "degraded";
  return "critical";
}

export async function snapshotTransportRuntime(params: {
  userId: string;
  mutation?: TransportMutationResult | null;
  refreshHeartbeats?: boolean;
}): Promise<TransportRuntimeState> {
  if (params.refreshHeartbeats) {
    const probe = await verifyActivePlaybackDevice({ userId: params.userId, evaluation: null });
    if (probe.playback.playbackState?.isPlaying) refreshPlaybackHeartbeat(params.userId);
    if (probe.playback.activeDevice) refreshDeviceHeartbeat(params.userId);
    refreshQueueHeartbeat(params.userId);
  }

  const check = await verifyActivePlaybackDevice({ userId: params.userId, evaluation: null });
  const telemetry = evaluateTelemetryFreshness(params.userId);
  const playbackAgeMs = telemetry.playbackAgeMs;
  const syncStatus = check.playback.queueStatus?.syncStatus ?? "unknown";
  const queueContinuityScore = clamp(
    (syncStatus === "synced" ? 78 : 42) + (check.deviceReady ? 14 : 0) - check.blockers.length * 6,
    0,
    100,
  );
  const transportStability = clamp(
    check.synchronizationConfidence * 0.55 +
      telemetry.heartbeatContinuityScore * 0.3 +
      queueContinuityScore * 0.15,
    0,
    100,
  );

  const reconciliation: TransportRuntimeState["runtimeReconciliationStatus"] = check.deviceReady
    ? "synced"
    : check.blockers.length <= 1
      ? "degraded"
      : "failed";

  const mutation = params.mutation ?? null;
  const finalSyncConfidence =
    typeof mutation?.data?.finalSynchronizationConfidence === "number"
      ? mutation.data.finalSynchronizationConfidence
      : check.synchronizationConfidence;

  return {
    stateOrigin: "transport_runtime",
    updatedAt: new Date().toISOString(),
    transportFreshness: freshnessFromAgeMs(playbackAgeMs),
    freshnessScore: Number(clamp(100 - playbackAgeMs / 600, 0, 100).toFixed(2)),
    heartbeatContinuity: telemetry.heartbeatContinuityScore,
    deviceSyncHealth: syncHealthFromConfidence(finalSyncConfidence),
    deviceSynchronizationConfidence: Number(finalSyncConfidence.toFixed(2)),
    rollbackContinuityScore: Number(
      clamp(
        (mutation?.rollbackPrepared ? 62 : 48) +
          check.synchronizationConfidence * 0.28 +
          telemetry.heartbeatContinuityScore * 0.1,
        0,
        100,
      ).toFixed(2),
    ),
    queueContinuityScore: Number(queueContinuityScore.toFixed(2)),
    runtimeReconciliationStatus: reconciliation,
    transportStability: Number(transportStability.toFixed(2)),
    mutationType: mutation?.mutationType ?? null,
    blockers: mutation?.blockers ?? check.blockers,
    warnings: mutation?.warnings ?? [],
    explainability: mutation?.explainability ?? check.explainability,
    recoverySuggested: mutation?.recoverySuggested ?? !check.deviceReady,
    lastMutation: mutation
      ? {
          success: mutation.success,
          mutationType: mutation.mutationType,
          executionSafety: mutation.executionSafety,
          synchronizationHealth: mutation.synchronizationHealth,
        }
      : undefined,
  };
}
