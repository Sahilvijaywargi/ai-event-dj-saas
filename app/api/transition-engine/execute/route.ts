import { NextResponse } from "next/server";
import {
  executeTransitionEnginePlan,
  TransitionEvaluationResult,
} from "@/lib/ai/transition-engine";
import type { OrchestrationRefinementResult } from "@/lib/ai/orchestration-refinement-types";
import { runSupervisedExecutionValidation } from "@/lib/spotify/playback-execution-engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  evaluation?: TransitionEvaluationResult;
  mode?: "review_only" | "execute";
  adaptiveRefinement?: OrchestrationRefinementResult | null;
};

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch {
      body = {};
    }
    if (!body.evaluation) {
      return NextResponse.json({ message: "evaluation is required." }, { status: 400 });
    }

    const result = await executeTransitionEnginePlan({
      userId: user.id,
      evaluation: body.evaluation,
      mode: body.mode ?? "review_only",
    });

    let executionValidation = null;
    let historicalTrust = null;
    let learningSignals = null;
    let runtimeTrustCalibration = null;
    let autonomyReadiness = null;

    if (body.mode === "execute" && result.ok) {
      const bundle = await runSupervisedExecutionValidation({
        userId: user.id,
        evaluation: body.evaluation,
        queueMutationSuccess: true,
        selectedCandidate: body.adaptiveRefinement?.selectedCandidate ?? null,
        convergenceMetrics: body.adaptiveRefinement?.convergenceMetrics ?? null,
      });
      executionValidation = bundle.validation;
      historicalTrust = bundle.historicalTrust;
      learningSignals = bundle.learningSignals;
      runtimeTrustCalibration = bundle.runtimeTrustCalibration;
      autonomyReadiness = bundle.autonomyReadiness;
    }

    return NextResponse.json(
      {
        ...result,
        executionValidation,
        historicalTrust,
        learningSignals,
        runtimeTrustCalibration,
        autonomyReadiness,
      },
      { status: result.ok ? 200 : 409 },
    );
  } catch (error) {
    console.error("[ReviewRoute] fatal", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}
