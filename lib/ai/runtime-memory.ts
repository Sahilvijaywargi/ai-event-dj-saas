import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RuntimeMemoryPatternType =
  | "successful_transition"
  | "failed_transition"
  | "crowd_energy_pattern"
  | "operator_override_pattern"
  | "playlist_flow_pattern"
  | "engagement_pattern";

export type RuntimeReinforcementState = "reinforced" | "neutral" | "decaying";

export type RuntimeLearningSignal = {
  source:
    | "transition_engine"
    | "autonomous_loop"
    | "runtime_coordinator"
    | "crowd_feedback"
    | "audio_energy"
    | "operator";
  signal: string;
  value: number;
  weight: number;
  polarity: "positive" | "negative" | "neutral";
};

export type RuntimeMemoryPattern = {
  id: string;
  user_id: string;
  pattern_type: RuntimeMemoryPatternType;
  pattern_context: string;
  success_score: number;
  confidence_score: number;
  usage_count: number;
  learned_signals: RuntimeLearningSignal[];
  reinforcement_state: RuntimeReinforcementState;
  learning_frozen: boolean;
  created_at: string;
  updated_at: string;
};

export type RuntimeReinforcementAction =
  | "reinforce_pattern"
  | "penalize_pattern"
  | "reset_pattern_bias"
  | "freeze_pattern_learning"
  | "unfreeze_pattern_learning";

export type RuntimeReversalAction =
  | "undo_reinforce_pattern"
  | "undo_penalize_pattern"
  | "undo_reset_pattern_bias"
  | "undo_freeze_pattern_learning"
  | "undo_unfreeze_pattern_learning";

export type RuntimeReinforcementAudit = {
  id: string;
  user_id: string;
  pattern_id: string;
  action_type: RuntimeReinforcementAction | RuntimeReversalAction;
  previous_score: number;
  new_score: number;
  action_reason: string;
  reversed_by_audit_id: string | null;
  reversal_reason: string | null;
  created_at: string;
};

export type RuntimeReversalAudit = RuntimeReinforcementAudit;

export type RuntimeBiasAdjustment = {
  transitionBias: number;
  energyBias: number;
  operatorBias: number;
  crowdBias: number;
  confidenceBias: number;
  rationale: string[];
};

export type RuntimeMemoryInsights = {
  successfulPatterns: RuntimeMemoryPattern[];
  failedPatterns: RuntimeMemoryPattern[];
  operatorAdaptationTrend: number;
  crowdAdaptationHistory: number;
  reinforcementStrength: number;
  frozenPatternCount: number;
  reversalEligibleCount: number;
  supervisedRationale: string[];
  learnedBiases: RuntimeBiasAdjustment;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSignals(signals: RuntimeLearningSignal[] | undefined) {
  if (!signals?.length) return [] as RuntimeLearningSignal[];
  return signals.map((signal) => ({
    ...signal,
    value: Number(signal.value.toFixed(3)),
    weight: Number(clamp(signal.weight, 0, 1).toFixed(3)),
  }));
}

function deriveReinforcementState(params: {
  successScore: number;
  confidenceScore: number;
  usageCount: number;
}): RuntimeReinforcementState {
  if (params.successScore >= 60 && params.confidenceScore >= 60 && params.usageCount >= 2) {
    return "reinforced";
  }
  if (params.successScore <= 35 || params.confidenceScore <= 35) {
    return "decaying";
  }
  return "neutral";
}

function toMemoryPatternRow(row: Record<string, unknown>): RuntimeMemoryPattern {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    pattern_type: row.pattern_type as RuntimeMemoryPatternType,
    pattern_context: String(row.pattern_context),
    success_score: Number(row.success_score),
    confidence_score: Number(row.confidence_score),
    usage_count: Number(row.usage_count),
    learned_signals: normalizeSignals((row.learned_signals as RuntimeLearningSignal[]) ?? []),
    reinforcement_state: row.reinforcement_state as RuntimeReinforcementState,
    learning_frozen: Boolean(row.learning_frozen),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function toReinforcementAuditRow(row: Record<string, unknown>): RuntimeReinforcementAudit {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    pattern_id: String(row.pattern_id),
    action_type: row.action_type as RuntimeReinforcementAction | RuntimeReversalAction,
    previous_score: Number(row.previous_score),
    new_score: Number(row.new_score),
    action_reason: String(row.action_reason),
    reversed_by_audit_id: row.reversed_by_audit_id ? String(row.reversed_by_audit_id) : null,
    reversal_reason: row.reversal_reason ? String(row.reversal_reason) : null,
    created_at: String(row.created_at),
  };
}

function toReversalAction(actionType: RuntimeReinforcementAction): RuntimeReversalAction {
  if (actionType === "reinforce_pattern") return "undo_reinforce_pattern";
  if (actionType === "penalize_pattern") return "undo_penalize_pattern";
  if (actionType === "reset_pattern_bias") return "undo_reset_pattern_bias";
  if (actionType === "freeze_pattern_learning") return "undo_freeze_pattern_learning";
  return "undo_unfreeze_pattern_learning";
}

async function writeReversalAudit(params: {
  userId: string;
  patternId: string;
  actionType: RuntimeReversalAction;
  previousScore: number;
  newScore: number;
  actionReason: string;
  reversalReason: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("runtime_memory_audit")
    .insert({
      user_id: params.userId,
      pattern_id: params.patternId,
      action_type: params.actionType,
      previous_score: Number(params.previousScore.toFixed(2)),
      new_score: Number(params.newScore.toFixed(2)),
      action_reason: params.actionReason.slice(0, 500),
      reversal_reason: params.reversalReason.slice(0, 500),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toReinforcementAuditRow(data as Record<string, unknown>);
}

async function writeReinforcementAudit(params: {
  userId: string;
  patternId: string;
  actionType: RuntimeReinforcementAction;
  previousScore: number;
  newScore: number;
  actionReason: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("runtime_memory_audit")
    .insert({
      user_id: params.userId,
      pattern_id: params.patternId,
      action_type: params.actionType,
      previous_score: Number(params.previousScore.toFixed(2)),
      new_score: Number(params.newScore.toFixed(2)),
      action_reason: params.actionReason.slice(0, 500),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toReinforcementAuditRow(data as Record<string, unknown>);
}

export async function storeRuntimeMemoryPattern(params: {
  userId: string;
  patternType: RuntimeMemoryPatternType;
  patternContext: string;
  successScore: number;
  confidenceScore: number;
  learnedSignals?: RuntimeLearningSignal[];
  reinforce?: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const normalizedSignals = normalizeSignals(params.learnedSignals);
  const boundedSuccess = Number(clamp(params.successScore, -100, 100).toFixed(2));
  const boundedConfidence = Number(clamp(params.confidenceScore, 0, 100).toFixed(2));
  const reinforcementState = deriveReinforcementState({
    successScore: boundedSuccess,
    confidenceScore: boundedConfidence,
    usageCount: 1,
  });

  const { data: existing } = await supabase
    .from("runtime_memory_patterns")
    .select("*")
    .eq("user_id", params.userId)
    .eq("pattern_type", params.patternType)
    .eq("pattern_context", params.patternContext)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const prev = toMemoryPatternRow(existing as Record<string, unknown>);
    if (prev.learning_frozen) return prev;
    const weightedSuccess = Number(
      ((prev.success_score * Math.max(prev.usage_count, 1) + boundedSuccess) / (prev.usage_count + 1)).toFixed(2),
    );
    const weightedConfidence = Number(
      (
        (prev.confidence_score * Math.max(prev.usage_count, 1) + boundedConfidence) /
        (prev.usage_count + 1)
      ).toFixed(2),
    );
    const mergedSignals = [...prev.learned_signals, ...normalizedSignals].slice(-24);
    const nextUsage = prev.usage_count + 1;
    const nextState = deriveReinforcementState({
      successScore: weightedSuccess,
      confidenceScore: weightedConfidence,
      usageCount: nextUsage,
    });

    const { data, error } = await supabase
      .from("runtime_memory_patterns")
      .update({
        success_score: weightedSuccess,
        confidence_score: weightedConfidence,
        usage_count: nextUsage,
        learned_signals: mergedSignals,
        reinforcement_state: params.reinforce ? "reinforced" : nextState,
      })
      .eq("id", prev.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toMemoryPatternRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("runtime_memory_patterns")
    .insert({
      user_id: params.userId,
      pattern_type: params.patternType,
      pattern_context: params.patternContext,
      success_score: boundedSuccess,
      confidence_score: boundedConfidence,
      usage_count: 1,
      learned_signals: normalizedSignals,
      reinforcement_state: params.reinforce ? "reinforced" : reinforcementState,
      learning_frozen: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toMemoryPatternRow(data as Record<string, unknown>);
}

export async function reinforceRuntimeMemoryPattern(params: {
  userId: string;
  patternId: string;
  successDelta?: number;
  confidenceDelta?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("runtime_memory_patterns")
    .select("*")
    .eq("id", params.patternId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = toMemoryPatternRow(data as Record<string, unknown>);
  if (row.learning_frozen) return row;
  const successScore = Number(clamp(row.success_score + (params.successDelta ?? 4), -100, 100).toFixed(2));
  const confidenceScore = Number(
    clamp(row.confidence_score + (params.confidenceDelta ?? 3.5), 0, 100).toFixed(2),
  );
  const usageCount = row.usage_count + 1;

  const { data: updated, error: updateError } = await supabase
    .from("runtime_memory_patterns")
    .update({
      success_score: successScore,
      confidence_score: confidenceScore,
      usage_count: usageCount,
      reinforcement_state: deriveReinforcementState({ successScore, confidenceScore, usageCount }),
    })
    .eq("id", row.id)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  const next = toMemoryPatternRow(updated as Record<string, unknown>);
  void writeReinforcementAudit({
    userId: params.userId,
    patternId: row.id,
    actionType: "reinforce_pattern",
    previousScore: row.success_score,
    newScore: next.success_score,
    actionReason: "Manual supervised reinforcement.",
  }).catch(() => {});
  return next;
}

export async function applyRuntimeReinforcementAction(params: {
  userId: string;
  patternId: string;
  actionType: RuntimeReinforcementAction;
  actionReason: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("runtime_memory_patterns")
    .select("*")
    .eq("id", params.patternId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = toMemoryPatternRow(data as Record<string, unknown>);

  const previousScore = row.success_score;
  let successScore = row.success_score;
  let confidenceScore = row.confidence_score;
  let usageCount = row.usage_count;
  let learningFrozen = row.learning_frozen;
  let reinforcementState = row.reinforcement_state;
  let learnedSignals = row.learned_signals;

  if (params.actionType === "reinforce_pattern" && !row.learning_frozen) {
    successScore = Number(clamp(row.success_score + 5, -100, 100).toFixed(2));
    confidenceScore = Number(clamp(row.confidence_score + 4, 0, 100).toFixed(2));
    usageCount = row.usage_count + 1;
    reinforcementState = deriveReinforcementState({ successScore, confidenceScore, usageCount });
  } else if (params.actionType === "penalize_pattern" && !row.learning_frozen) {
    successScore = Number(clamp(row.success_score - 6, -100, 100).toFixed(2));
    confidenceScore = Number(clamp(row.confidence_score - 5, 0, 100).toFixed(2));
    usageCount = Math.max(0, row.usage_count - 1);
    reinforcementState = deriveReinforcementState({ successScore, confidenceScore, usageCount });
  } else if (params.actionType === "reset_pattern_bias") {
    successScore = 0;
    confidenceScore = 50;
    usageCount = 0;
    reinforcementState = "neutral";
    learnedSignals = [];
  } else if (params.actionType === "freeze_pattern_learning") {
    learningFrozen = true;
  } else if (params.actionType === "unfreeze_pattern_learning") {
    learningFrozen = false;
  }

  const { data: updated, error: updateError } = await supabase
    .from("runtime_memory_patterns")
    .update({
      success_score: successScore,
      confidence_score: confidenceScore,
      usage_count: usageCount,
      learning_frozen: learningFrozen,
      reinforcement_state: reinforcementState,
      learned_signals: learnedSignals,
    })
    .eq("id", row.id)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  const audit = await writeReinforcementAudit({
    userId: params.userId,
    patternId: row.id,
    actionType: params.actionType,
    previousScore,
    newScore: successScore,
    actionReason: params.actionReason,
  });
  return {
    pattern: toMemoryPatternRow(updated as Record<string, unknown>),
    audit,
  };
}

export async function decayRuntimeMemoryPatterns(params: {
  userId: string;
  maxRows?: number;
  decayFactor?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const maxRows = clamp(params.maxRows ?? 20, 1, 100);
  const decayFactor = clamp(params.decayFactor ?? 0.92, 0.75, 0.99);
  const { data, error } = await supabase
    .from("runtime_memory_patterns")
    .select("*")
    .eq("user_id", params.userId)
    .order("updated_at", { ascending: true })
    .limit(maxRows);
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => toMemoryPatternRow(row));
  const decayed: RuntimeMemoryPattern[] = [];
  for (const row of rows) {
    if (row.learning_frozen) continue;
    const ageMs = Date.now() - new Date(row.updated_at).getTime();
    if (ageMs < 1000 * 60 * 45) continue;

    const nextSuccess = Number((row.success_score * decayFactor).toFixed(2));
    const nextConfidence = Number((row.confidence_score * decayFactor).toFixed(2));
    const nextUsage = Math.max(0, row.usage_count - 1);
    const nextState = deriveReinforcementState({
      successScore: nextSuccess,
      confidenceScore: nextConfidence,
      usageCount: nextUsage,
    });
    const { data: updated, error: updateError } = await supabase
      .from("runtime_memory_patterns")
      .update({
        success_score: nextSuccess,
        confidence_score: nextConfidence,
        usage_count: nextUsage,
        reinforcement_state: nextState,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (!updateError && updated) {
      decayed.push(toMemoryPatternRow(updated as Record<string, unknown>));
    }
  }
  return decayed;
}

export async function getRuntimeMemoryPatterns(params: {
  userId: string;
  patternType?: RuntimeMemoryPatternType;
  limit?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const limit = clamp(params.limit ?? 50, 1, 200);
  const query = supabase
    .from("runtime_memory_patterns")
    .select("*")
    .eq("user_id", params.userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (params.patternType) {
    query.eq("pattern_type", params.patternType);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => toMemoryPatternRow(row));
}

export async function getRuntimeReinforcementAudit(params: {
  userId: string;
  patternId?: string;
  limit?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const limit = clamp(params.limit ?? 80, 1, 300);
  const query = supabase
    .from("runtime_memory_audit")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (params.patternId) query.eq("pattern_id", params.patternId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => toReinforcementAuditRow(row));
}

export async function reverseRuntimeMemoryAction(params: {
  userId: string;
  patternId?: string;
  reversalReason: string;
}) {
  const supabase = await createSupabaseServerClient();
  const query = supabase
    .from("runtime_memory_audit")
    .select("*")
    .eq("user_id", params.userId)
    .in("action_type", [
      "reinforce_pattern",
      "penalize_pattern",
      "reset_pattern_bias",
      "freeze_pattern_learning",
      "unfreeze_pattern_learning",
    ])
    .is("reversed_by_audit_id", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (params.patternId) query.eq("pattern_id", params.patternId);
  const { data: targetAuditRow, error: targetAuditError } = await query.maybeSingle();
  if (targetAuditError) throw new Error(targetAuditError.message);
  if (!targetAuditRow) {
    return { ok: false as const, message: "No eligible unreversed action found." };
  }
  const targetAudit = toReinforcementAuditRow(targetAuditRow as Record<string, unknown>);

  const { data: patternRow, error: patternError } = await supabase
    .from("runtime_memory_patterns")
    .select("*")
    .eq("id", targetAudit.pattern_id)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (patternError) throw new Error(patternError.message);
  if (!patternRow) {
    return { ok: false as const, message: "Associated pattern not found." };
  }
  const pattern = toMemoryPatternRow(patternRow as Record<string, unknown>);
  const previousScore = pattern.success_score;

  let successScore = pattern.success_score;
  let confidenceScore = pattern.confidence_score;
  let usageCount = pattern.usage_count;
  let learningFrozen = pattern.learning_frozen;
  if (targetAudit.action_type === "reinforce_pattern") {
    successScore = Number(clamp(pattern.success_score - 5, -100, 100).toFixed(2));
    confidenceScore = Number(clamp(pattern.confidence_score - 4, 0, 100).toFixed(2));
    usageCount = Math.max(0, pattern.usage_count - 1);
  } else if (targetAudit.action_type === "penalize_pattern") {
    successScore = Number(clamp(pattern.success_score + 6, -100, 100).toFixed(2));
    confidenceScore = Number(clamp(pattern.confidence_score + 5, 0, 100).toFixed(2));
    usageCount = pattern.usage_count + 1;
  } else if (targetAudit.action_type === "reset_pattern_bias") {
    successScore = targetAudit.previous_score;
    confidenceScore = Number(clamp(pattern.confidence_score + 5, 0, 100).toFixed(2));
    usageCount = Math.max(1, pattern.usage_count);
  } else if (targetAudit.action_type === "freeze_pattern_learning") {
    learningFrozen = false;
  } else if (targetAudit.action_type === "unfreeze_pattern_learning") {
    learningFrozen = true;
  }
  const reinforcementState = deriveReinforcementState({
    successScore,
    confidenceScore,
    usageCount,
  });

  const { data: updatedPatternRow, error: updatedPatternError } = await supabase
    .from("runtime_memory_patterns")
    .update({
      success_score: successScore,
      confidence_score: confidenceScore,
      usage_count: usageCount,
      learning_frozen: learningFrozen,
      reinforcement_state: reinforcementState,
    })
    .eq("id", pattern.id)
    .select("*")
    .single();
  if (updatedPatternError) throw new Error(updatedPatternError.message);

  const reversalAudit = await writeReversalAudit({
    userId: params.userId,
    patternId: pattern.id,
    actionType: toReversalAction(targetAudit.action_type as RuntimeReinforcementAction),
    previousScore,
    newScore: successScore,
    actionReason: `Reversal for ${targetAudit.action_type}`,
    reversalReason: params.reversalReason,
  });
  const { error: linkError } = await supabase
    .from("runtime_memory_audit")
    .update({
      reversed_by_audit_id: reversalAudit.id,
      reversal_reason: params.reversalReason.slice(0, 500),
    })
    .eq("id", targetAudit.id)
    .eq("user_id", params.userId);
  if (linkError) throw new Error(linkError.message);

  return {
    ok: true as const,
    message: "Latest eligible supervised action reversed safely.",
    targetAudit,
    reversalAudit,
    pattern: toMemoryPatternRow(updatedPatternRow as Record<string, unknown>),
  };
}

export function computeLearnedOrchestrationBias(patterns: RuntimeMemoryPattern[]): RuntimeBiasAdjustment {
  if (!patterns.length) {
    return {
      transitionBias: 0,
      energyBias: 0,
      operatorBias: 0,
      crowdBias: 0,
      confidenceBias: 0,
      rationale: ["No runtime memory patterns found; neutral bias applied."],
    };
  }

  let transitionAccumulator = 0;
  let energyAccumulator = 0;
  let operatorAccumulator = 0;
  let crowdAccumulator = 0;
  let confidenceAccumulator = 0;
  let weightAccumulator = 0;

  for (const pattern of patterns) {
    if (pattern.learning_frozen) continue;
    const reinforcementWeight =
      pattern.reinforcement_state === "reinforced"
        ? 1.25
        : pattern.reinforcement_state === "decaying"
          ? 0.7
          : 1;
    const usageWeight = clamp(1 + pattern.usage_count / 10, 1, 2.2);
    const baseWeight = reinforcementWeight * usageWeight;
    const normalizedSuccess = pattern.success_score / 100;
    const normalizedConfidence = pattern.confidence_score / 100;
    const signedBias = normalizedSuccess * baseWeight;
    transitionAccumulator += signedBias;
    confidenceAccumulator += normalizedConfidence * baseWeight;

    for (const signal of pattern.learned_signals) {
      const signedSignal = signal.value * signal.weight * baseWeight;
      if (signal.signal.includes("energy")) energyAccumulator += signedSignal;
      if (signal.signal.includes("operator")) operatorAccumulator += signedSignal;
      if (signal.signal.includes("crowd")) crowdAccumulator += signedSignal;
    }
    weightAccumulator += baseWeight;
  }

  const normalizer = Math.max(weightAccumulator, 1);
  const transitionBias = Number(clamp((transitionAccumulator / normalizer) * 20, -20, 20).toFixed(2));
  const energyBias = Number(clamp((energyAccumulator / normalizer) * 12, -12, 12).toFixed(2));
  const operatorBias = Number(clamp((operatorAccumulator / normalizer) * 14, -14, 14).toFixed(2));
  const crowdBias = Number(clamp((crowdAccumulator / normalizer) * 14, -14, 14).toFixed(2));
  const confidenceBias = Number(clamp((confidenceAccumulator / normalizer) * 18, -18, 18).toFixed(2));

  return {
    transitionBias,
    energyBias,
    operatorBias,
    crowdBias,
    confidenceBias,
    rationale: [
      `Bias derived from ${patterns.length} learned patterns using deterministic weighted scoring.`,
      "Reinforced patterns increase impact; decaying patterns reduce impact.",
      "Operator/crowd/energy signals only adjust bounded bias lanes.",
    ],
  };
}

export async function getRuntimeMemoryInsights(params: { userId: string; limit?: number }) {
  const patterns = await getRuntimeMemoryPatterns({
    userId: params.userId,
    limit: params.limit ?? 80,
  });
  const successfulPatterns = patterns.filter(
    (pattern) => pattern.pattern_type === "successful_transition" || pattern.success_score >= 55,
  );
  const failedPatterns = patterns.filter(
    (pattern) => pattern.pattern_type === "failed_transition" || pattern.success_score <= 30,
  );
  const operatorPatterns = patterns.filter((pattern) => pattern.pattern_type === "operator_override_pattern");
  const crowdPatterns = patterns.filter((pattern) => pattern.pattern_type === "crowd_energy_pattern");
  const frozenPatternCount = patterns.filter((pattern) => pattern.learning_frozen).length;
  const audit = await getRuntimeReinforcementAudit({ userId: params.userId, limit: 120 });
  const reversalEligibleCount = audit.filter(
    (row) =>
      !row.reversed_by_audit_id &&
      !row.action_type.startsWith("undo_") &&
      [
        "reinforce_pattern",
        "penalize_pattern",
        "reset_pattern_bias",
        "freeze_pattern_learning",
        "unfreeze_pattern_learning",
      ].includes(row.action_type),
  ).length;
  const reinforcementStrength = Number(
    (
      patterns.reduce(
        (acc, pattern) => acc + (pattern.reinforcement_state === "reinforced" ? 1 : pattern.reinforcement_state === "neutral" ? 0.5 : 0.2),
        0,
      ) / Math.max(patterns.length, 1) * 100
    ).toFixed(2),
  );
  const operatorAdaptationTrend = Number(
    (
      operatorPatterns.reduce((acc, pattern) => acc + pattern.success_score, 0) /
      Math.max(operatorPatterns.length, 1)
    ).toFixed(2),
  );
  const crowdAdaptationHistory = Number(
    (
      crowdPatterns.reduce((acc, pattern) => acc + pattern.confidence_score, 0) /
      Math.max(crowdPatterns.length, 1)
    ).toFixed(2),
  );
  return {
    successfulPatterns: successfulPatterns.slice(0, 12),
    failedPatterns: failedPatterns.slice(0, 12),
    operatorAdaptationTrend,
    crowdAdaptationHistory,
    reinforcementStrength,
    frozenPatternCount,
    reversalEligibleCount,
    supervisedRationale: [
      "Reinforcement actions are operator-triggered and fully audited.",
      "Frozen patterns are excluded from autonomous reinforcement/decay.",
      "Bias computation ignores frozen patterns to prevent hidden escalation.",
      "Only latest unreversed supervised action can be reversed.",
      "Reversals create linked immutable audit entries, not history rewrites.",
    ],
    learnedBiases: computeLearnedOrchestrationBias(patterns),
  } satisfies RuntimeMemoryInsights;
}

