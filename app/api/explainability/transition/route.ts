import { NextResponse } from "next/server";
import { getExplainabilityTransition } from "@/lib/ai/explainability";
import { loadQueueRecommendationsForUser } from "@/lib/ai/runtime-intelligence-coordinator";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const assisted = url.searchParams.get("assisted") === "true";

  try {
    const queueRecommendations = await loadQueueRecommendationsForUser(user.id);
    const explanation = await getExplainabilityTransition({
      userId: user.id,
      queueRecommendations,
      assistedAutonomousEnabled: assisted,
    });
    return NextResponse.json({ explanation });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load transition explainability." },
      { status: 500 },
    );
  }
}

