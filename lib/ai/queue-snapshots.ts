import {
  getQueueAverages,
  QueueGenerationContext,
  QueueEngineProvider,
  QueueRecommendation,
  QueueSnapshotRecord,
} from "@/lib/ai/queue-engine";
import { EventPlanView } from "@/lib/events/types";
import { SupabaseClient } from "@supabase/supabase-js";

type SupabaseLikeClient = Pick<SupabaseClient, "from">;

type QueueSnapshotInsert = {
  user_id: string;
  event_plan_id: string;
  queue_data: QueueRecommendation;
  current_phase: QueueSnapshotRecord["current_phase"];
  average_bpm: number;
  average_energy: number;
  crowd_momentum: QueueSnapshotRecord["crowd_momentum"];
};

export async function createQueueSnapshotForPlan(params: {
  supabase: SupabaseLikeClient;
  provider: QueueEngineProvider;
  userId: string;
  plan: EventPlanView;
  context?: QueueGenerationContext;
}) {
  const { supabase, provider, userId, plan, context } = params;
  const recommendation: QueueRecommendation = await provider.generateFromPlan(plan, context);
  const averages = getQueueAverages(recommendation);
  const snapshotInsert: QueueSnapshotInsert = {
    user_id: userId,
    event_plan_id: plan.id,
    queue_data: recommendation,
    current_phase: recommendation.currentMoodPhase,
    average_bpm: averages.averageBpm,
    average_energy: averages.averageEnergy,
    crowd_momentum: recommendation.crowdMomentum,
  };

  const { data: snapshot, error: insertError } = await supabase
    .from("queue_snapshots")
    .insert(snapshotInsert)
    .select(
      "id,user_id,event_plan_id,created_at,queue_data,current_phase,average_bpm,average_energy,crowd_momentum",
    )
    .single();

  if (insertError || !snapshot) {
    return {
      ok: false as const,
      message: insertError?.message ?? "Failed to create queue snapshot.",
      recommendation,
      snapshot: null,
      queueVersionCount: 0,
    };
  }

  const { count, error: countError } = await supabase
    .from("queue_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_plan_id", plan.id);

  if (countError) {
    return {
      ok: false as const,
      message: countError.message,
      recommendation,
      snapshot,
      queueVersionCount: 0,
    };
  }

  return {
    ok: true as const,
    message: null,
    recommendation,
    snapshot,
    queueVersionCount: count ?? 1,
  };
}
