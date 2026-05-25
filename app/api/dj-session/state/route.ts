import { NextResponse } from "next/server";
import { getLiveSessionState } from "@/lib/dj-session/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const state = await getLiveSessionState(user.id);
  return NextResponse.json(state);
}

