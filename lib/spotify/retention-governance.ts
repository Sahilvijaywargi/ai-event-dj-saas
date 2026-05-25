import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RetentionWindowDays } from "@/lib/spotify/audit-retention";

export type AuditRetentionGovernance = {
  id: string;
  user_id: string;
  retention_window_days: RetentionWindowDays;
  auto_prune_enabled: boolean;
  scheduled_prune_interval_hours: number;
  last_prune_at: string | null;
  next_prune_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RetentionGovernanceInput = {
  retentionWindowDays: number;
  autoPruneEnabled: boolean;
  scheduledPruneIntervalHours: number;
};

export function validateRetentionGovernanceInput(
  input: Partial<RetentionGovernanceInput>,
): RetentionGovernanceInput {
  const retentionWindowDays =
    input.retentionWindowDays === 30 || input.retentionWindowDays === 60 || input.retentionWindowDays === 90
      ? input.retentionWindowDays
      : 60;
  const autoPruneEnabled = Boolean(input.autoPruneEnabled);
  const interval = Number.isFinite(input.scheduledPruneIntervalHours)
    ? Math.round(input.scheduledPruneIntervalHours as number)
    : 24;
  const scheduledPruneIntervalHours = Math.max(1, Math.min(720, interval));

  return {
    retentionWindowDays,
    autoPruneEnabled,
    scheduledPruneIntervalHours,
  };
}

export function computeNextScheduledPrune(params: {
  autoPruneEnabled: boolean;
  scheduledPruneIntervalHours: number;
  lastPruneAt?: string | null;
}) {
  if (!params.autoPruneEnabled) return null;
  const base = params.lastPruneAt ? new Date(params.lastPruneAt).getTime() : Date.now();
  return new Date(base + params.scheduledPruneIntervalHours * 60 * 60 * 1000).toISOString();
}

export async function loadRetentionGovernance(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_retention_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const defaultInput = validateRetentionGovernanceInput({
      retentionWindowDays: 60,
      autoPruneEnabled: false,
      scheduledPruneIntervalHours: 24,
    });
    const created = await saveRetentionGovernance(userId, defaultInput);
    return created;
  }
  return data as AuditRetentionGovernance;
}

export async function saveRetentionGovernance(
  userId: string,
  rawInput: Partial<RetentionGovernanceInput>,
) {
  const supabase = await createSupabaseServerClient();
  const input = validateRetentionGovernanceInput(rawInput);
  const existing = await loadRetentionGovernanceNoCreate(userId);
  const nextPruneAt = computeNextScheduledPrune({
    autoPruneEnabled: input.autoPruneEnabled,
    scheduledPruneIntervalHours: input.scheduledPruneIntervalHours,
    lastPruneAt: existing?.last_prune_at ?? null,
  });

  const payload = {
    user_id: userId,
    retention_window_days: input.retentionWindowDays,
    auto_prune_enabled: input.autoPruneEnabled,
    scheduled_prune_interval_hours: input.scheduledPruneIntervalHours,
    last_prune_at: existing?.last_prune_at ?? null,
    next_prune_at: nextPruneAt,
    updated_at: new Date().toISOString(),
    created_at: existing?.created_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("audit_retention_config")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AuditRetentionGovernance;
}

export async function touchRetentionLastPruneAt(userId: string) {
  const supabase = await createSupabaseServerClient();
  const current = await loadRetentionGovernance(userId);
  const now = new Date().toISOString();
  const nextPruneAt = computeNextScheduledPrune({
    autoPruneEnabled: current.auto_prune_enabled,
    scheduledPruneIntervalHours: current.scheduled_prune_interval_hours,
    lastPruneAt: now,
  });
  const { error } = await supabase
    .from("audit_retention_config")
    .update({
      last_prune_at: now,
      next_prune_at: nextPruneAt,
      updated_at: now,
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

async function loadRetentionGovernanceNoCreate(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_retention_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as AuditRetentionGovernance | null;
}

