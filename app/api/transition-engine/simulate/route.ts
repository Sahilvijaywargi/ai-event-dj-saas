import { NextResponse } from "next/server";
import { evaluateTransitionEngine, TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { getRuntimeMemoryPatterns, storeRuntimeMemoryPattern } from "@/lib/ai/runtime-memory";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { analyzeSimulationOutcome, simulateTransitionTimeline } from "@/lib/ai/transition-simulation";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  assistedAutonomousEnabled?: boolean;
  queueRecommendations?: QueueRecommendationWithMeta[];
  evaluation?: TransitionEvaluationResult;
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
    const queueRecommendations = body.queueRecommendations ?? [];
    const evaluation =
      body.evaluation ??
      (await evaluateTransitionEngine({
        userId: user.id,
        queueRecommendations,
        assistedAutonomousEnabled: body.assistedAutonomousEnabled ?? false,
      }));
    const diagnostics = await serveRecommendationDiagnostics(user.id);
    const telemetry = diagnostics.items[0] ?? null;
    const memoryPatterns = await getRuntimeMemoryPatterns({
      userId: user.id,
      limit: 30,
    });
    const simulation = simulateTransitionTimeline({
      queueRecommendations,
      telemetry,
      evaluation,
      memoryPatterns,
    });
    const outcome = analyzeSimulationOutcome({
      simulation,
      evaluation,
    });
    if (outcome.reinforcementType !== "neutral") {
      const boundedConfidence = Math.max(0, Math.min(100, evaluation.confidence.score + outcome.confidenceAdjustment));
      const boundedSuccessScore =
        outcome.reinforcementType === "reinforce"
          ? Math.max(0, Math.min(100, 65 + outcome.continuityScore * 0.35))
          : Math.max(-100, Math.min(100, 25 - (100 - outcome.continuityScore) * 0.45));
      await storeRuntimeMemoryPattern({
        userId: user.id,
        patternType: outcome.reinforcementType === "reinforce" ? "successful_transition" : "failed_transition",
        patternContext: outcome.orchestrationSignature.slice(0, 500),
        successScore: Number(boundedSuccessScore.toFixed(2)),
        confidenceScore: Number(boundedConfidence.toFixed(2)),
        learnedSignals: [
          {
            source: "transition_engine",
            signal: "simulation_reinforcement_strength",
            category: "confidence",
            value: outcome.reinforcementStrength,
            weight: 0.7,
            polarity: outcome.reinforcementType === "reinforce" ? "positive" : "negative",
          },
          {
            source: "transition_engine",
            signal: "simulation_continuity_score",
            category: "confidence",
            value: outcome.continuityScore / 100,
            weight: 0.82,
            polarity: outcome.continuityScore >= 65 ? "positive" : "negative",
          },
          {
            source: "transition_engine",
            signal: "simulation_stability_score",
            category: "confidence",
            value: outcome.stabilityScore / 100,
            weight: 0.8,
            polarity: outcome.stabilityScore >= 65 ? "positive" : "negative",
          },
          {
            source: "transition_engine",
            signal: "simulation_risk_adjustment",
            category: "confidence",
            value: Math.abs(outcome.riskAdjustment),
            weight: 0.65,
            polarity: outcome.riskAdjustment <= 0 ? "positive" : "negative",
          },
        ],
        reinforce: outcome.reinforcementType === "reinforce",
      });
    }
    return NextResponse.json({
      evaluation,
      simulation,
      reinforcement: outcome,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to run transition simulation." },
      { status: 500 },
    );
  }
}

