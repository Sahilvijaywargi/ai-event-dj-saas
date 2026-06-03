import { NextResponse } from "next/server";
import { abortPreparedExecution } from "@/lib/spotify/playback-execution-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  reason?: string;
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
  const result = abortPreparedExecution(user.id, body.reason ?? "Operator aborted execution.");
  return NextResponse.json({
    ok: result.ok,
    state: result.state,
    message: result.message,
  });
}
