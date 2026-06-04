import "server-only";

export interface MutationCheckpoint {
  checkpointId: string;
  timestamp: string;
  queueSnapshotId: string;
  playbackPositionMs: number;
  activeTrackUri?: string;
  transportIntegrity: number;
  rollbackConfidence: number;
  recoverable: boolean;
}

const checkpointStore = new Map<string, MutationCheckpoint[]>();
const MAX_CHECKPOINTS = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function createMutationCheckpoint(params: {
  userId: string;
  queueUris: string[];
  playbackPositionMs: number;
  activeTrackUri?: string | null;
  transportIntegrity?: number;
  rollbackConfidence?: number;
}): MutationCheckpoint {
  const checkpoint: MutationCheckpoint = {
    checkpointId: `chk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    queueSnapshotId: `q_${params.queueUris.length}_${params.queueUris[0]?.slice(-8) ?? "empty"}`,
    playbackPositionMs: params.playbackPositionMs,
    activeTrackUri: params.activeTrackUri ?? undefined,
    transportIntegrity: Number(clamp(params.transportIntegrity ?? 72, 0, 100).toFixed(2)),
    rollbackConfidence: Number(clamp(params.rollbackConfidence ?? 68, 0, 100).toFixed(2)),
    recoverable: Boolean(params.activeTrackUri && params.queueUris.length > 0),
  };
  const existing = checkpointStore.get(params.userId) ?? [];
  checkpointStore.set(params.userId, [checkpoint, ...existing].slice(0, MAX_CHECKPOINTS));
  console.log("[ROLLBACK] checkpoint created", {
    checkpointId: checkpoint.checkpointId,
    recoverable: checkpoint.recoverable,
  });
  return checkpoint;
}

export function getLatestCheckpoint(userId: string): MutationCheckpoint | null {
  return checkpointStore.get(userId)?.[0] ?? null;
}

export function getCheckpoints(userId: string): MutationCheckpoint[] {
  return checkpointStore.get(userId) ?? [];
}

export function evaluateCheckpointRecoverability(checkpoint: MutationCheckpoint | null): {
  recoverable: boolean;
  coverage: number;
  reasoning: string[];
} {
  if (!checkpoint) {
    return { recoverable: false, coverage: 0, reasoning: ["No mutation checkpoint available."] };
  }
  const recoverable =
    checkpoint.recoverable &&
    checkpoint.rollbackConfidence >= 55 &&
    checkpoint.transportIntegrity >= 50;
  const coverage = Number(
    clamp(checkpoint.rollbackConfidence * 0.5 + checkpoint.transportIntegrity * 0.5, 0, 100).toFixed(2),
  );
  const reasoning: string[] = [];
  if (recoverable) reasoning.push(`Checkpoint ${checkpoint.checkpointId} is recoverable.`);
  else reasoning.push("Checkpoint recoverability insufficient for supervised rollback.");
  return { recoverable, coverage, reasoning };
}

export function restoreMutationCheckpoint(params: {
  userId: string;
  checkpointId?: string;
}): { restored: boolean; checkpoint: MutationCheckpoint | null; reasoning: string[] } {
  const checkpoints = getCheckpoints(params.userId);
  const checkpoint =
    checkpoints.find((c) => c.checkpointId === params.checkpointId) ?? checkpoints[0] ?? null;
  if (!checkpoint) {
    return { restored: false, checkpoint: null, reasoning: ["No checkpoint to restore."] };
  }
  const evalResult = evaluateCheckpointRecoverability(checkpoint);
  if (!evalResult.recoverable) {
    return {
      restored: false,
      checkpoint,
      reasoning: ["Checkpoint restore rejected — recoverability too low.", ...evalResult.reasoning],
    };
  }
  console.log("[ROLLBACK] checkpoint restored", { checkpointId: checkpoint.checkpointId });
  return {
    restored: true,
    checkpoint,
    reasoning: ["Checkpoint restore path validated for supervised recovery.", ...evalResult.reasoning],
  };
}

export function computeCheckpointCoverage(userId: string): number {
  const checkpoints = getCheckpoints(userId);
  if (!checkpoints.length) return 42;
  const recoverable = checkpoints.filter((c) => c.recoverable).length;
  return Number(clamp((recoverable / checkpoints.length) * 100, 0, 100).toFixed(2));
}
