import "server-only";

import { logPlaybackCommandAudit, evaluatePlaybackGuardrails, PlaybackCommandType, PlaybackExecutionSource } from "@/lib/spotify/playback-audit";

export async function executeGuardedPlaybackCommand<T>(params: {
  userId: string;
  sessionId?: string | null;
  commandType: PlaybackCommandType;
  executionSource: PlaybackExecutionSource;
  targetDeviceId?: string;
  trackUri?: string;
  commandPayload?: Record<string, unknown>;
  execute: () => Promise<T>;
}) {
  const startedAt = Date.now();
  const violations = await evaluatePlaybackGuardrails({
    userId: params.userId,
    commandType: params.commandType,
    targetDeviceId: params.targetDeviceId,
    trackUri: params.trackUri,
    payload: params.commandPayload,
  });
  const blocking = violations.find((v) => v.severity === "blocked");
  if (blocking) {
    void logPlaybackCommandAudit({
      userId: params.userId,
      sessionId: params.sessionId ?? null,
      commandType: params.commandType,
      targetDeviceId: params.targetDeviceId,
      trackUri: params.trackUri,
      commandPayload: {
        ...(params.commandPayload ?? {}),
        latencyMs: Date.now() - startedAt,
        guardrails: violations,
      },
      executionStatus: "blocked",
      executionSource: params.executionSource,
      failureReason: blocking.message,
    }).catch(() => {});
    return {
      ok: false as const,
      result: null as T | null,
      violations,
      message: blocking.message,
    };
  }

  try {
    const result = await params.execute();
    void logPlaybackCommandAudit({
      userId: params.userId,
      sessionId: params.sessionId ?? null,
      commandType: params.commandType,
      targetDeviceId: params.targetDeviceId,
      trackUri: params.trackUri,
      commandPayload: {
        ...(params.commandPayload ?? {}),
        latencyMs: Date.now() - startedAt,
        guardrails: violations,
      },
      executionStatus: "success",
      executionSource: params.executionSource,
      failureReason: null,
    }).catch(() => {});
    return {
      ok: true as const,
      result,
      violations,
      message: null,
    };
  } catch (error) {
    void logPlaybackCommandAudit({
      userId: params.userId,
      sessionId: params.sessionId ?? null,
      commandType: params.commandType,
      targetDeviceId: params.targetDeviceId,
      trackUri: params.trackUri,
      commandPayload: {
        ...(params.commandPayload ?? {}),
        latencyMs: Date.now() - startedAt,
        guardrails: violations,
      },
      executionStatus: "failed",
      executionSource: params.executionSource,
      failureReason: error instanceof Error ? error.message : "Playback command failed.",
    }).catch(() => {});
    return {
      ok: false as const,
      result: null as T | null,
      violations,
      message: error instanceof Error ? error.message : "Playback command failed.",
    };
  }
}

