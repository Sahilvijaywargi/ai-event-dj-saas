import { NextResponse } from "next/server";
import { getRuntimeReinforcementAudit } from "@/lib/ai/runtime-memory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const patternId = url.searchParams.get("patternId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "80");

  try {
    const audit = await getRuntimeReinforcementAudit({
      userId: user.id,
      patternId,
      limit: Number.isFinite(limit) ? limit : 80,
    });
    return NextResponse.json({ audit });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load runtime reinforcement audit." },
      { status: 500 },
    );
  }
}

