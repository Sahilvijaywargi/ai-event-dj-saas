import { NextResponse } from "next/server";
import { prunePlaybackAuditRetention } from "@/lib/spotify/audit-retention";
import { touchRetentionLastPruneAt } from "@/lib/spotify/retention-governance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  windowDays?: number;
  dryRun?: boolean;
  sessionId?: string;
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
    const result = await prunePlaybackAuditRetention({
      userId: user.id,
      windowDays: body.windowDays,
      dryRun: body.dryRun ?? true,
      sessionId: body.sessionId,
    });
    if (!result.dryRun && result.deletedRows >= 0) {
      void touchRetentionLastPruneAt(user.id).catch(() => {});
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to prune playback audit." },
      { status: 500 },
    );
  }
}

