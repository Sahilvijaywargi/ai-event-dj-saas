import { NextResponse } from "next/server";
import { getRuntimeMemoryPatterns, RuntimeMemoryPatternType } from "@/lib/ai/runtime-memory";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const patternType = url.searchParams.get("patternType") as RuntimeMemoryPatternType | null;
  const limit = Number(url.searchParams.get("limit") ?? "50");

  try {
    const patterns = await getRuntimeMemoryPatterns({
      userId: user.id,
      patternType: patternType ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return NextResponse.json({ patterns });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load runtime memory patterns." },
      { status: 500 },
    );
  }
}

