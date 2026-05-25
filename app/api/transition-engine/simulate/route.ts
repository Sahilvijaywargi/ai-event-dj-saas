import { NextResponse } from "next/server";
import { evaluateTransitionEngine, TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { simulateTransitionTimeline } from "@/lib/ai/transition-simulation";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  assistedAutonomousEnabled?: boolean;
  queueRecommendations?: QueueRecommendationWithMeta[];
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
    const queueRecommendations = body.queueRecommendations ?? [];
    const evaluation =
      body.evaluation ??
      (await evaluateTransitionEngine({
        userId: user.id,
        queueRecommendations,
        assistedAutonomousEnabled: body.assistedAutonomousEnabled ?? false,
      }));
    const diagnostics = await serveRecommendationDiagnostics(user.id);
    const telemetry = diagnostics.items[0] ?? null;
    const simulation = simulateTransitionTimeline({
      queueRecommendations,
      telemetry,
      evaluation,
    });
    return NextResponse.json({
      evaluation,
      simulation,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to run transition simulation." },
      { status: 500 },
    );
  }
}

