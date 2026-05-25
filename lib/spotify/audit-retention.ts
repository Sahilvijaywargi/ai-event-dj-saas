import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RetentionWindowDays = 30 | 60 | 90;

export type PlaybackAuditRetentionPolicy = {
  windowDays: RetentionWindowDays;
  maxBatchSize: number;
};

export type RetentionStatus = {
  totalRows: number;
  rowsEligibleForPruning: number;
  oldestAuditTimestamp: string | null;
  estimatedStorageBytes: number;
  currentRetentionPolicy: PlaybackAuditRetentionPolicy;
};

export type RetentionPruneResult = {
  dryRun: boolean;
  deletedRows: number;
  eligibleRows: number;
  batchCount: number;
  executionMs: number;
  errors: string[];
  cutoffTimestamp: string;
};

const DEFAULT_POLICY: PlaybackAuditRetentionPolicy = {
  windowDays: 60,
  maxBatchSize: 200,
};

function resolveWindowDays(value?: number): RetentionWindowDays {
  if (value === 30 || value === 60 || value === 90) return value;
  return DEFAULT_POLICY.windowDays;
}

function cutoffIso(windowDays: RetentionWindowDays) {
  return new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
}

export function getRetentionPolicy(overrides?: Partial<PlaybackAuditRetentionPolicy>): PlaybackAuditRetentionPolicy {
  return {
    windowDays: resolveWindowDays(overrides?.windowDays),
    maxBatchSize: Math.max(50, Math.min(500, overrides?.maxBatchSize ?? DEFAULT_POLICY.maxBatchSize)),
  };
}

export async function getPlaybackAuditRetentionStatus(params: {
  userId: string;
  windowDays?: number;
  sessionId?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const policy = getRetentionPolicy({ windowDays: params.windowDays as RetentionWindowDays | undefined });
  const cutoff = cutoffIso(policy.windowDays);

  const totalQuery = supabase
    .from("playback_command_audit")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId);
  if (params.sessionId) totalQuery.eq("session_id", params.sessionId);
  const { count: totalRows, error: totalError } = await totalQuery;
  if (totalError) throw new Error(totalError.message);

  const eligibleQuery = supabase
    .from("playback_command_audit")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .lt("executed_at", cutoff);
  if (params.sessionId) eligibleQuery.eq("session_id", params.sessionId);
  const { count: eligibleRows, error: eligibleError } = await eligibleQuery;
  if (eligibleError) throw new Error(eligibleError.message);

  const oldestQuery = supabase
    .from("playback_command_audit")
    .select("executed_at")
    .eq("user_id", params.userId)
    .order("executed_at", { ascending: true })
    .limit(1);
  if (params.sessionId) oldestQuery.eq("session_id", params.sessionId);
  const { data: oldestData, error: oldestError } = await oldestQuery;
  if (oldestError) throw new Error(oldestError.message);
  const oldestAuditTimestamp = oldestData?.[0]?.executed_at ?? null;

  const estimatedStorageBytes = Math.round((totalRows ?? 0) * 850);
  const status: RetentionStatus = {
    totalRows: totalRows ?? 0,
    rowsEligibleForPruning: eligibleRows ?? 0,
    oldestAuditTimestamp,
    estimatedStorageBytes,
    currentRetentionPolicy: policy,
  };

  return { status, cutoff };
}

export async function prunePlaybackAuditRetention(params: {
  userId: string;
  windowDays?: number;
  dryRun?: boolean;
  sessionId?: string;
}) {
  const startedAt = Date.now();
  const supabase = await createSupabaseServerClient();
  const policy = getRetentionPolicy({ windowDays: params.windowDays as RetentionWindowDays | undefined });
  const cutoffTimestamp = cutoffIso(policy.windowDays);
  const dryRun = params.dryRun ?? true;
  const errors: string[] = [];

  const eligibleQuery = supabase
    .from("playback_command_audit")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .lt("executed_at", cutoffTimestamp);
  if (params.sessionId) eligibleQuery.eq("session_id", params.sessionId);
  const { count: eligibleRows, error: eligibleError } = await eligibleQuery;
  if (eligibleError) throw new Error(eligibleError.message);
  const eligible = eligibleRows ?? 0;

  if (dryRun || eligible === 0) {
    const result: RetentionPruneResult = {
      dryRun: true,
      deletedRows: 0,
      eligibleRows: eligible,
      batchCount: 0,
      executionMs: Date.now() - startedAt,
      errors,
      cutoffTimestamp,
    };
    return result;
  }

  let deletedRows = 0;
  let batchCount = 0;

  while (true) {
    const idsQuery = supabase
      .from("playback_command_audit")
      .select("id")
      .eq("user_id", params.userId)
      .lt("executed_at", cutoffTimestamp)
      .order("executed_at", { ascending: true })
      .limit(policy.maxBatchSize);
    if (params.sessionId) idsQuery.eq("session_id", params.sessionId);
    const { data: batchRows, error: idsError } = await idsQuery;
    if (idsError) {
      errors.push(idsError.message);
      break;
    }
    const ids = (batchRows ?? []).map((row) => row.id);
    if (ids.length === 0) break;

    const { error: deleteError } = await supabase
      .from("playback_command_audit")
      .delete()
      .eq("user_id", params.userId)
      .in("id", ids);
    if (deleteError) {
      errors.push(deleteError.message);
      break;
    }

    deletedRows += ids.length;
    batchCount += 1;
    if (ids.length < policy.maxBatchSize) break;
  }

  const result: RetentionPruneResult = {
    dryRun: false,
    deletedRows,
    eligibleRows: eligible,
    batchCount,
    executionMs: Date.now() - startedAt,
    errors,
    cutoffTimestamp,
  };
  return result;
}

