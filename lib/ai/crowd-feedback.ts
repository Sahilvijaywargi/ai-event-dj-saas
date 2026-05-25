import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CrowdFeedbackType =
  | "skip"
  | "like"
  | "dislike"
  | "energy_up"
  | "energy_down"
  | "override"
  | "interruption"
  | "transition_reject"
  | "transition_accept";

export type CrowdFeedbackSource =
  | "operator"
  | "playback_behavior"
  | "autonomous_loop"
  | "transition_engine";

export type CrowdFeedbackEvent = {
  id: string;
  user_id: string;
  session_id: string | null;
  feedback_type: CrowdFeedbackType;
  feedback_source: CrowdFeedbackSource;
  feedback_payload: Record<string, unknown>;
  energy_impact: number;
  confidence_impact: number;
  created_at: string;
};

export type CrowdFeedbackSummary = {
  crowdSentiment: number;
  operatorInterventionRate: number;
  transitionTrustScore: number;
  energyAdaptationTrend: number;
  recentTimeline: CrowdFeedbackEvent[];
  feedbackCounts: Record<CrowdFeedbackType, number>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function ingestCrowdFeedback(params: {
  userId: string;
  sessionId?: string | null;
  feedbackType: CrowdFeedbackType;
  feedbackSource: CrowdFeedbackSource;
  feedbackPayload?: Record<string, unknown>;
  energyImpact?: number;
  confidenceImpact?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crowd_feedback_events")
    .insert({
      user_id: params.userId,
      session_id: params.sessionId ?? null,
      feedback_type: params.feedbackType,
      feedback_source: params.feedbackSource,
      feedback_payload: params.feedbackPayload ?? {},
      energy_impact: params.energyImpact ?? 0,
      confidence_impact: params.confidenceImpact ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CrowdFeedbackEvent;
}

export async function getCrowdFeedbackSummary(params: {
  userId: string;
  sessionId?: string;
  limit?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const base = supabase
    .from("crowd_feedback_events")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 80);
  if (params.sessionId) {
    base.eq("session_id", params.sessionId);
  }
  const { data, error } = await base;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as CrowdFeedbackEvent[];

  const feedbackCounts: Record<CrowdFeedbackType, number> = {
    skip: 0,
    like: 0,
    dislike: 0,
    energy_up: 0,
    energy_down: 0,
    override: 0,
    interruption: 0,
    transition_reject: 0,
    transition_accept: 0,
  };

  let sentimentAccumulator = 0;
  let energyAccumulator = 0;
  let confidenceAccumulator = 0;
  let operatorSignals = 0;
  let interventionSignals = 0;
  let trustSignals = 0;
  let trustPositive = 0;

  for (const row of rows) {
    feedbackCounts[row.feedback_type] += 1;
    energyAccumulator += row.energy_impact;
    confidenceAccumulator += row.confidence_impact;
    if (row.feedback_source === "operator") operatorSignals += 1;
    if (
      row.feedback_type === "override" ||
      row.feedback_type === "interruption" ||
      row.feedback_type === "transition_reject"
    ) {
      interventionSignals += 1;
    }
    if (row.feedback_type === "transition_accept" || row.feedback_type === "transition_reject") {
      trustSignals += 1;
      if (row.feedback_type === "transition_accept") trustPositive += 1;
    }

    if (row.feedback_type === "like" || row.feedback_type === "transition_accept") sentimentAccumulator += 1.2;
    if (row.feedback_type === "dislike" || row.feedback_type === "transition_reject") sentimentAccumulator -= 1.3;
    if (row.feedback_type === "skip") sentimentAccumulator -= 0.8;
  }

  const rowCount = Math.max(rows.length, 1);
  const crowdSentiment = clamp(Number((50 + (sentimentAccumulator / rowCount) * 18).toFixed(2)), 0, 100);
  const operatorInterventionRate = Number(
    ((interventionSignals / Math.max(operatorSignals, 1)) * 100).toFixed(2),
  );
  const transitionTrustScore = trustSignals
    ? Number(((trustPositive / trustSignals) * 100).toFixed(2))
    : 50;
  const energyAdaptationTrend = Number((energyAccumulator / rowCount).toFixed(2));

  return {
    crowdSentiment,
    operatorInterventionRate,
    transitionTrustScore,
    energyAdaptationTrend,
    recentTimeline: rows.slice(0, 20),
    feedbackCounts,
    confidenceImpactTrend: Number((confidenceAccumulator / rowCount).toFixed(2)),
  } satisfies CrowdFeedbackSummary & { confidenceImpactTrend: number };
}

