import { NextResponse } from "next/server";
import { evaluateTransitionEngine, TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { loadQueueRecommendationsForUser } from "@/lib/ai/runtime-intelligence-coordinator";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { approvePreparedExecution, queuePreparedTrack } from "@/lib/spotify/playback-execution-engine";

type Body = {
  evaluation?: TransitionEvaluationResult;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  try {
    const evaluation =
      body.evaluation ??
      (await (async () => {
        const queueRecommendations = await loadQueueRecommendationsForUser(user.id);
        return evaluateTransitionEngine({
          userId: user.id,
          queueRecommendations,
          assistedAutonomousEnabled: true,
        });
      })());
    const approval = approvePreparedExecution(user.id);
    const queued = await queuePreparedTrack({
      userId: user.id,
      evaluation,
    });
    return NextResponse.json({
      ok: queued.ok,
      evaluation,
      approval,
      state: queued.state,
      message: queued.message,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to approve playback execution." },
      { status: 500 },
    );
  }
}
