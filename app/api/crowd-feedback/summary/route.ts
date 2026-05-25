import { NextResponse } from "next/server";
import { getCrowdFeedbackSummary } from "@/lib/ai/crowd-feedback";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "80");

  try {
    const summary = await getCrowdFeedbackSummary({
      userId: user.id,
      sessionId,
      limit,
    });
    return NextResponse.json({ summary });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch crowd feedback summary." },
      { status: 500 },
    );
  }
}

