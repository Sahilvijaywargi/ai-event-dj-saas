import "server-only";

import type { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import { getSpotifyQueueState } from "@/lib/spotify/playback-service";

export type RollbackSnapshotSource = "execution" | "bootstrap" | "missing";

export type RollbackSnapshotPayload = {
  currentTrackUri: string | null;
  queueHeadUri: string | null;
  playbackPositionMs: number | null;
  snapshotHash?: string;
  snapshotCreatedAt?: number;
  ownerUserId?: string;
  source: "execution" | "bootstrap";
};

export type BootstrapReplayTelemetry = {
  rollbackIntegrity: number;
  rollbackIntegrityScore: number;
  rollbackConfidence: number;
  verificationSnapshotReliability: number;
  verificationRecoveryConfidence: number;
  verificationFinalized: boolean;
  transportIntegrityScore?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

export function computeRollbackSnapshotHash(snapshot: {
  currentTrackUri: string | null;
  queueHeadUri: string | null;
  playbackPositionMs: number | null;
}) {
  return [
    snapshot.currentTrackUri ?? "none",
    snapshot.queueHeadUri ?? "none",
    snapshot.playbackPositionMs ?? "none",
  ].join("|");
}

export function isRollbackSnapshotComplete(
  snapshot: Pick<
    RollbackSnapshotPayload,
    "currentTrackUri" | "queueHeadUri" | "playbackPositionMs"
  > | null | undefined,
) {
  return Boolean(
    snapshot?.currentTrackUri && snapshot.queueHeadUri && snapshot.playbackPositionMs !== null,
  );
}

export function buildObservationalRollbackSnapshot(params: {
  userId: string;
  queueState?: Awaited<ReturnType<typeof getSpotifyQueueState>> | null;
  playback?: Awaited<ReturnType<typeof getPlaybackOrchestrationState>> | null;
}): RollbackSnapshotPayload | null {
  const queueState = params.queueState ?? null;
  const playback = params.playback ?? null;

  const currentTrackUri =
    queueState?.currentlyPlaying?.uri ?? playback?.playbackState?.track?.uri ?? null;
  const queueHeadUri = queueState?.queue?.[0]?.uri ?? null;
  const playbackPositionMs = playback?.playbackState?.progressMs ?? null;

  if (!currentTrackUri && !queueHeadUri && playbackPositionMs === null) {
    return null;
  }

  const snapshot: RollbackSnapshotPayload = {
    currentTrackUri,
    queueHeadUri,
    playbackPositionMs,
    snapshotCreatedAt: Date.now(),
    ownerUserId: params.userId,
    source: "bootstrap",
  };
  snapshot.snapshotHash = computeRollbackSnapshotHash(snapshot);

  console.log("[ROLLBACK] bootstrap snapshot created", {
    userId: params.userId,
    snapshotHash: snapshot.snapshotHash,
    hasCurrentTrack: Boolean(snapshot.currentTrackUri),
    queueHeadPresent: Boolean(snapshot.queueHeadUri),
    playbackPositionMs: snapshot.playbackPositionMs,
  });

  return snapshot;
}

/**
 * Telemetry-only inputs for survivability formulas during evaluate (no prepare/verification pass).
 * Capped conservatively from live orchestration telemetry — not execution verification.
 */
export function deriveBootstrapReplayTelemetry(params: {
  evaluation?: TransitionEvaluationResult | null;
  playbackActive?: boolean;
  queueUris?: string[];
  snapshotComplete: boolean;
}): BootstrapReplayTelemetry {
  if (!params.snapshotComplete) {
    return {
      rollbackIntegrity: 0,
      rollbackIntegrityScore: 0,
      rollbackConfidence: 0,
      verificationSnapshotReliability: 0,
      verificationRecoveryConfidence: 0,
      verificationFinalized: false,
    };
  }

  const transportStability = params.evaluation?.transportStability ?? 0;
  const deviceSync = params.evaluation?.deviceSynchronizationConfidence ?? 0;
  const heartbeat = params.evaluation?.heartbeatContinuity ?? 0;
  const queueVerified = Boolean(params.queueUris?.length);
  const playbackActive = params.playbackActive !== false;

  const rollbackIntegrity = round(
    clamp(deviceSync * 0.4 + transportStability * 0.35 + heartbeat * 0.25, 0, 68),
  );

  const verificationSnapshotReliability = round(
    clamp(
      rollbackIntegrity * 0.32 +
        transportStability * 0.24 +
        heartbeat * 0.2 +
        (queueVerified ? 10 : 0) +
        (playbackActive ? 4 : 0),
      0,
      68,
    ),
  );

  const verificationRecoveryConfidence = round(
    clamp(
      heartbeat * 0.35 +
        transportStability * 0.25 +
        deviceSync * 0.2 +
        (queueVerified ? 12 : 0) +
        (playbackActive ? 6 : 0),
      0,
      62,
    ),
  );

  const rollbackConfidence = round(clamp(rollbackIntegrity * 0.95, 0, 65));

  return {
    rollbackIntegrity,
    rollbackIntegrityScore: rollbackIntegrity,
    rollbackConfidence,
    verificationSnapshotReliability,
    verificationRecoveryConfidence,
    verificationFinalized: false,
    transportIntegrityScore: transportStability > 0 ? transportStability : undefined,
  };
}

export async function fetchLiveRollbackSnapshotInputs(userId: string) {
  const [queueState, playback] = await Promise.all([
    getSpotifyQueueState(userId),
    getPlaybackOrchestrationState(userId),
  ]);
  return { queueState, playback };
}
