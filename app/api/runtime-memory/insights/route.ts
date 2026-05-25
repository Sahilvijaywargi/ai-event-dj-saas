import { NextResponse } from "next/server";
import { decayRuntimeMemoryPatterns, getRuntimeMemoryInsights } from "@/lib/ai/runtime-memory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "80");
  const applyDecay = url.searchParams.get("applyDecay") === "true";

  try {
    if (applyDecay) {
      await decayRuntimeMemoryPatterns({ userId: user.id });
    }
    const insights = await getRuntimeMemoryInsights({
      userId: user.id,
      limit: Number.isFinite(limit) ? limit : 80,
    });
    return NextResponse.json({ insights });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load runtime memory insights." },
      { status: 500 },
    );
  }
}

