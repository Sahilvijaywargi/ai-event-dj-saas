import { NextResponse } from "next/server";
import { evaluateRuntimeIntelligence } from "@/lib/ai/runtime-intelligence-coordinator";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const state = await evaluateRuntimeIntelligence({
      userId: user.id,
      assistedAutonomousEnabled: true,
    });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load runtime intelligence state." },
      { status: 500 },
    );
  }
}

