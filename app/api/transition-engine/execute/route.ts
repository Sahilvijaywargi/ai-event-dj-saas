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
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const unauthorized = NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      console.log("[ReviewRoute] before response");
      console.log("[ReviewRoute] after response");
      return unauthorized;
    }

    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch {
      body = {};
    }
    if (!body.evaluation) {
      const badRequest = NextResponse.json({ message: "evaluation is required." }, { status: 400 });
      console.log("[ReviewRoute] before response");
      console.log("[ReviewRoute] after response");
      return badRequest;
    }

    console.log("[ReviewRoute] before evaluate");
    console.log("[ReviewRoute] after evaluate");

    console.log("[ReviewRoute] before execute");
    const result = await executeTransitionEnginePlan({
      userId: user.id,
      evaluation: body.evaluation,
      mode: body.mode ?? "review_only",
    });
    console.log("[ReviewRoute] after execute");

    console.log("[ReviewRoute] before response");
    const response = NextResponse.json(result, { status: result.ok ? 200 : 409 });
    console.log("[ReviewRoute] after response");
    return response;
  } catch (error) {
    console.error("[ReviewRoute] fatal", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}

