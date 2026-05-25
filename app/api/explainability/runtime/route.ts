import { NextResponse } from "next/server";
import { getExplainabilityRuntime } from "@/lib/ai/explainability";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const explanation = await getExplainabilityRuntime({
      userId: user.id,
      assistedAutonomousEnabled: true,
    });
    return NextResponse.json({ explanation });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load runtime explainability." },
      { status: 500 },
    );
  }
}

