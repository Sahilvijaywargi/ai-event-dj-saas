import { NextResponse } from "next/server";
import { evaluateTransitionEngine } from "@/lib/ai/transition-engine";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  assistedAutonomousEnabled?: boolean;
  queueRecommendations?: QueueRecommendationWithMeta[];
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
    const evaluation = await evaluateTransitionEngine({
      userId: user.id,
      queueRecommendations: body.queueRecommendations ?? [],
      assistedAutonomousEnabled: body.assistedAutonomousEnabled ?? false,
    });
    return NextResponse.json({ evaluation });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to evaluate transition engine." },
      { status: 500 },
    );
  }
}

