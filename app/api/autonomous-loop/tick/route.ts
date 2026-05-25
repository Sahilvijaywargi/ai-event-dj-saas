import { NextResponse } from "next/server";
import { tickAutonomousLoop } from "@/lib/ai/autonomous-loop";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  executeIfSafe?: boolean;
  supervisionMode?: "manual_override" | "assisted_autonomous";
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
    const result = await tickAutonomousLoop({
      userId: user.id,
      executeIfSafe: body.executeIfSafe ?? false,
      supervisionMode: body.supervisionMode,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to run autonomous tick." },
      { status: 500 },
    );
  }
}

