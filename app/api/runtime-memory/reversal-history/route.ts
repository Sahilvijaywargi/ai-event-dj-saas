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
  const limit = Number(url.searchParams.get("limit") ?? "80");
  const patternId = url.searchParams.get("patternId") ?? undefined;

  try {
    const audit = await getRuntimeReinforcementAudit({
      userId: user.id,
      patternId,
      limit: Number.isFinite(limit) ? limit : 80,
    });
    const reversals = audit.filter(
      (row) =>
        row.action_type.startsWith("undo_") ||
        row.reversed_by_audit_id !== null ||
        row.reversal_reason !== null,
    );
    return NextResponse.json({ reversals });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load reversal history." },
      { status: 500 },
    );
  }
}

