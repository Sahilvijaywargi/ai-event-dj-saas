import { NextResponse } from "next/server";
import { endDjSession } from "@/lib/dj-session/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EndSessionPayload = {
  sessionId?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: EndSessionPayload;
  try {
    body = (await request.json()) as EndSessionPayload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json({ message: "sessionId is required." }, { status: 400 });
  }

  const result = await endDjSession(user.id, body.sessionId);
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

