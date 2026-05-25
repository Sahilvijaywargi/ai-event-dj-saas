import { NextResponse } from "next/server";
import { startAutonomousLoop } from "@/lib/ai/autonomous-loop";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  intervalMs?: number;
  supervisionMode?: "manual_override" | "assisted_autonomous";
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
    const state = await startAutonomousLoop({
      userId: user.id,
      intervalMs: body.intervalMs,
      supervisionMode: body.supervisionMode,
    });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to start autonomous loop." },
      { status: 500 },
    );
  }
}

