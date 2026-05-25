import { NextResponse } from "next/server";
import {
  executeTransitionEnginePlan,
  TransitionEvaluationResult,
} from "@/lib/ai/transition-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  evaluation?: TransitionEvaluationResult;
  mode?: "review_only" | "execute";
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
  if (!body.evaluation) {
    return NextResponse.json({ message: "evaluation is required." }, { status: 400 });
  }

  try {
    const result = await executeTransitionEnginePlan({
      userId: user.id,
      evaluation: body.evaluation,
      mode: body.mode ?? "review_only",
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to execute transition plan." },
      { status: 500 },
    );
  }
}

