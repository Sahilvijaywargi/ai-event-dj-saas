import { NextResponse } from "next/server";
import { startDjSession } from "@/lib/dj-session/engine";
import { StartSessionPayload } from "@/lib/dj-session/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: StartSessionPayload;
  try {
    body = (await request.json()) as StartSessionPayload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.eventId) {
    return NextResponse.json({ message: "eventId is required." }, { status: 400 });
  }

  const result = await startDjSession(user.id, body);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json(
    {
      session: result.session,
      warning: result.warning,
    },
    { status: result.status },
  );
}

