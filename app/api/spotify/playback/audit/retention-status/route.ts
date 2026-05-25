import { NextResponse } from "next/server";
import { getPlaybackAuditRetentionStatus } from "@/lib/spotify/audit-retention";
import { loadRetentionGovernance } from "@/lib/spotify/retention-governance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const windowDays = Number(url.searchParams.get("windowDays") ?? "60");
  const sessionId = url.searchParams.get("sessionId") ?? undefined;

  try {
    const governance = await loadRetentionGovernance(user.id);
    const result = await getPlaybackAuditRetentionStatus({
      userId: user.id,
      windowDays: Number.isFinite(windowDays) ? windowDays : governance.retention_window_days,
      sessionId,
    });
    return NextResponse.json({
      ...result,
      governance,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch retention status." },
      { status: 500 },
    );
  }
}

