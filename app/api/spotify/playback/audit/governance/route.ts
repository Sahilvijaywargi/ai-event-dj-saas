import { NextResponse } from "next/server";
import {
  loadRetentionGovernance,
  saveRetentionGovernance,
} from "@/lib/spotify/retention-governance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type GovernanceBody = {
  retentionWindowDays?: number;
  autoPruneEnabled?: boolean;
  scheduledPruneIntervalHours?: number;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const governance = await loadRetentionGovernance(user.id);
    return NextResponse.json({ governance });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load governance." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: GovernanceBody = {};
  try {
    body = (await request.json()) as GovernanceBody;
  } catch {
    body = {};
  }

  try {
    const governance = await saveRetentionGovernance(user.id, body);
    return NextResponse.json({ governance });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to save governance." },
      { status: 500 },
    );
  }
}

