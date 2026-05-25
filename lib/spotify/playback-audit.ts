import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlaybackCommandType =
  | "play"
  | "pause"
  | "skip"
  | "queue"
  | "volume_change"
  | "seek"
  | "device_transfer";

export type PlaybackExecutionSource =
  | "manual_user"
  | "ai_recommendation"
  | "live_session_sync"
  | "fallback_recovery";

export type GuardrailViolation = {
  code:
    | "duplicate_queue_spam"
    | "rapid_device_switch"
    | "excessive_volume_jump"
    | "conflicting_playback_command";
  message: string;
  severity: "warning" | "blocked";
};

type PlaybackAuditRecord = {
  id: string;
  user_id: string;
  session_id: string | null;
  command_type: PlaybackCommandType;
  target_device_id: string | null;
  track_uri: string | null;
  command_payload: Record<string, unknown>;
  execution_status: "success" | "failed" | "blocked";
  execution_source: PlaybackExecutionSource;
  failure_reason: string | null;
  executed_at: string;
};

export async function evaluatePlaybackGuardrails(params: {
  userId: string;
  commandType: PlaybackCommandType;
  targetDeviceId?: string;
  trackUri?: string;
  payload?: Record<string, unknown>;
}): Promise<GuardrailViolation[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("playback_command_audit")
    .select("command_type,target_device_id,track_uri,command_payload,executed_at")
    .eq("user_id", params.userId)
    .order("executed_at", { ascending: false })
    .limit(12);

  const recent = (data ?? []) as Array<{
    command_type: PlaybackCommandType;
    target_device_id: string | null;
    track_uri: string | null;
    command_payload: Record<string, unknown>;
    executed_at: string;
  }>;
  const nowMs = Date.now();
  const violations: GuardrailViolation[] = [];

  if (params.commandType === "queue" && params.trackUri) {
    const duplicate = recent.find(
      (item) =>
        item.command_type === "queue" &&
        item.track_uri === params.trackUri &&
        nowMs - new Date(item.executed_at).getTime() < 30_000,
    );
    if (duplicate) {
      violations.push({
        code: "duplicate_queue_spam",
        message: "Duplicate queue command blocked within 30s window.",
        severity: "blocked",
      });
    }
  }

  if (params.commandType === "device_transfer" && params.targetDeviceId) {
    const rapidSwitches = recent.filter(
      (item) =>
        item.command_type === "device_transfer" &&
        item.target_device_id !== params.targetDeviceId &&
        nowMs - new Date(item.executed_at).getTime() < 20_000,
    );
    if (rapidSwitches.length >= 2) {
      violations.push({
        code: "rapid_device_switch",
        message: "Too many device switches in short interval.",
        severity: "blocked",
      });
    }
  }

  if (params.commandType === "volume_change" && typeof params.payload?.volumePercent === "number") {
    const prevVolume = recent.find((item) => item.command_type === "volume_change")?.command_payload
      ?.volumePercent;
    if (typeof prevVolume === "number") {
      const jump = Math.abs(params.payload.volumePercent - prevVolume);
      if (jump > 35) {
        violations.push({
          code: "excessive_volume_jump",
          message: "Volume jump exceeds safety threshold (35).",
          severity: "warning",
        });
      }
    }
  }

  if (params.commandType === "play") {
    const pausedRecently = recent.find(
      (item) => item.command_type === "pause" && nowMs - new Date(item.executed_at).getTime() < 1_500,
    );
    if (pausedRecently) {
      violations.push({
        code: "conflicting_playback_command",
        message: "Play issued too soon after pause.",
        severity: "warning",
      });
    }
  }

  return violations;
}

export async function logPlaybackCommandAudit(params: {
  userId: string;
  sessionId?: string | null;
  commandType: PlaybackCommandType;
  targetDeviceId?: string;
  trackUri?: string;
  commandPayload?: Record<string, unknown>;
  executionStatus: "success" | "failed" | "blocked";
  executionSource: PlaybackExecutionSource;
  failureReason?: string | null;
  executedAt?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("playback_command_audit").insert({
    user_id: params.userId,
    session_id: params.sessionId ?? null,
    command_type: params.commandType,
    target_device_id: params.targetDeviceId ?? null,
    track_uri: params.trackUri ?? null,
    command_payload: params.commandPayload ?? {},
    execution_status: params.executionStatus,
    execution_source: params.executionSource,
    failure_reason: params.failureReason ?? null,
    executed_at: params.executedAt ?? new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function getRecentPlaybackAudit(params: { userId: string; limit?: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("playback_command_audit")
    .select("*")
    .eq("user_id", params.userId)
    .order("executed_at", { ascending: false })
    .limit(params.limit ?? 25);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlaybackAuditRecord[];
}

