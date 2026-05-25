import { NextResponse } from "next/server";
import { getAutonomousLoopState } from "@/lib/ai/autonomous-loop";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const state = getAutonomousLoopState(user.id);
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load autonomous loop state." },
      { status: 500 },
    );
  }
}

