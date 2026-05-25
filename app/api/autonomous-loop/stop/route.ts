import { NextResponse } from "next/server";
import { stopAutonomousLoop } from "@/lib/ai/autonomous-loop";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const state = stopAutonomousLoop(user.id);
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to stop autonomous loop." },
      { status: 500 },
    );
  }
}

