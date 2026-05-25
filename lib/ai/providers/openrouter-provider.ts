import "server-only";

import {
  MoodPhase,
  QueueEngineProvider,
  QueueGenerationContext,
  QueueRecommendation,
} from "@/lib/ai/queue-engine";
import { getServerEnv } from "@/lib/env/server";
import {
  recordAiFailure,
  recordAiSuccess,
  recordFallback,
  recordRetry,
  recordTimeout,
} from "@/lib/ai/observability";
import { generateQueueFromPlan } from "@/lib/ai/queue-engine";
import { EventPlanView } from "@/lib/events/types";
import { SupabaseClient } from "@supabase/supabase-js";

type OpenRouterMessage = {
  role: "system" | "user";
  content: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ParsedAiPayload = {
  currentMoodPhase?: MoodPhase;
  currentEnergy?: number;
  crowdMomentum?: "low" | "steady" | "rising" | "surging";
  nextRecommendedTransition?: string;
  bpmFlow?: Array<{ min: number; max: number }>;
  energyCurve?: number[];
  recommendedQueue?: Array<{
    title: string;
    artist: string;
    genre: string;
    bpm: number;
    energy: number;
    moodPhase: MoodPhase;
    transitionCompatibility: { score: number; reason: string };
  }>;
  insights?: {
    transitionRecommendations?: string[];
    energyAdjustments?: string[];
    genreBlendSuggestions?: string[];
    bpmProgressionImprovements?: string[];
    djSequencingInsights?: string[];
  };
};

function getOpenRouterApiKey() {
  return getServerEnv().openRouterApiKey;
}

function getOpenRouterModel() {
  return getServerEnv().openRouterModel;
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    ms,
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseContentAsJson(content: string): ParsedAiPayload | null {
  try {
    return JSON.parse(content) as ParsedAiPayload;
  } catch {
    const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i);
    if (!fencedMatch) return null;
    try {
      return JSON.parse(fencedMatch[1]) as ParsedAiPayload;
    } catch {
      return null;
    }
  }
}

function sanitizeAiPayload(
  payload: ParsedAiPayload,
  fallback: QueueRecommendation,
): QueueRecommendation {
  const safeBpmFlow =
    payload.bpmFlow && payload.bpmFlow.length > 0
      ? payload.bpmFlow.map((range) => ({
          min: clamp(Number(range.min || 90), 70, 180),
          max: clamp(Number(range.max || 130), 70, 200),
        }))
      : fallback.bpmFlow;

  const safeEnergyCurve =
    payload.energyCurve && payload.energyCurve.length > 0
      ? payload.energyCurve.map((energy) => clamp(Number(energy || 5), 1, 10))
      : fallback.energyCurve;

  const safeQueue =
    payload.recommendedQueue && payload.recommendedQueue.length > 0
      ? payload.recommendedQueue.slice(0, 8).map((track, index) => ({
          title: track.title || fallback.recommendedQueue[index % fallback.recommendedQueue.length].title,
          artist: track.artist || fallback.recommendedQueue[index % fallback.recommendedQueue.length].artist,
          genre: track.genre || fallback.recommendedQueue[index % fallback.recommendedQueue.length].genre,
          bpm: clamp(Number(track.bpm || 110), 70, 180),
          energy: clamp(Number(track.energy || 6), 1, 10),
          moodPhase: track.moodPhase || fallback.recommendedQueue[index % fallback.recommendedQueue.length].moodPhase,
          transitionCompatibility: {
            score: clamp(Number(track.transitionCompatibility?.score || 80), 0, 100),
            reason:
              track.transitionCompatibility?.reason ||
              "AI-enhanced compatibility estimate.",
          },
        }))
      : fallback.recommendedQueue;

  const insightText = [
    ...(payload.insights?.transitionRecommendations ?? []),
    ...(payload.insights?.energyAdjustments ?? []),
    ...(payload.insights?.genreBlendSuggestions ?? []),
    ...(payload.insights?.bpmProgressionImprovements ?? []),
    ...(payload.insights?.djSequencingInsights ?? []),
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    ...fallback,
    currentMoodPhase: payload.currentMoodPhase ?? fallback.currentMoodPhase,
    currentEnergy: clamp(Number(payload.currentEnergy ?? fallback.currentEnergy), 1, 10),
    crowdMomentum: payload.crowdMomentum ?? fallback.crowdMomentum,
    nextRecommendedTransition:
      payload.nextRecommendedTransition ||
      (insightText
        ? `${fallback.nextRecommendedTransition} | ${insightText}`
        : fallback.nextRecommendedTransition),
    bpmFlow: safeBpmFlow,
    energyCurve: safeEnergyCurve,
    recommendedQueue: safeQueue,
  };
}

function buildPrompt(plan: EventPlanView, context?: QueueGenerationContext) {
  const previousSnapshots = (context?.previousSnapshots ?? []).slice(0, 5).map((snapshot) => ({
    created_at: snapshot.created_at,
    current_phase: snapshot.current_phase,
    average_bpm: snapshot.average_bpm,
    average_energy: snapshot.average_energy,
    crowd_momentum: snapshot.crowd_momentum,
  }));

  const systemInstruction = `
You are an expert AI DJ sequencing strategist for premium events.
Return ONLY strict JSON with keys:
currentMoodPhase,currentEnergy,crowdMomentum,nextRecommendedTransition,bpmFlow,energyCurve,recommendedQueue,insights.
No markdown.
`;

  const userInput = {
    event: {
      eventType: plan.eventType,
      crowdSize: plan.crowdSize,
      genres: plan.recommendedGenres,
      baselineEnergyCurve: plan.energyProgression,
      timeline: plan.timeline,
    },
    previousSnapshots,
    objectives: [
      "improve transition smoothness",
      "crowd-aware energy modulation",
      "genre blending refinement",
      "bpm progression stability",
      "dj-style sequencing insight",
    ],
  };

  const messages: OpenRouterMessage[] = [
    { role: "system", content: systemInstruction.trim() },
    { role: "user", content: JSON.stringify(userInput) },
  ];

  return messages;
}

async function requestOpenRouterCompletion(messages: OpenRouterMessage[]) {
  const apiKey = getOpenRouterApiKey();
  const model = getOpenRouterModel();
  const timeout = withTimeout(12000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
      }),
      signal: timeout.signal,
    });

    if (response.status === 429) {
      throw new Error("OpenRouter rate limit reached.");
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    return data;
  } finally {
    timeout.clear();
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      recordRetry();
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

export class OpenRouterQueueEngineProvider implements QueueEngineProvider {
  constructor(
    private readonly fallbackProvider: QueueEngineProvider = {
      generateFromPlan: async (plan) => generateQueueFromPlan(plan),
    },
  ) {}

  async generateFromPlan(
    plan: EventPlanView,
    context?: QueueGenerationContext,
  ): Promise<QueueRecommendation> {
    const startedAt = Date.now();
    const fallback = await this.fallbackProvider.generateFromPlan(plan, context);

    try {
      const messages = buildPrompt(plan, context);
      const completion = await withRetry(
        () => requestOpenRouterCompletion(messages),
        1,
      );

      const content = completion.choices?.[0]?.message?.content?.trim();
      if (!content) {
        recordFallback("Empty OpenRouter response content.");
        recordAiFailure(Date.now() - startedAt, "Empty OpenRouter response content.");
        return fallback;
      }

      const parsed = parseContentAsJson(content);
      if (!parsed) {
        recordFallback("Invalid OpenRouter JSON payload.");
        recordAiFailure(Date.now() - startedAt, "Invalid OpenRouter JSON payload.");
        return fallback;
      }

      const enhanced = sanitizeAiPayload(parsed, fallback);
      recordAiSuccess(Date.now() - startedAt);
      return enhanced;
    } catch (error) {
      if (error instanceof Error && /aborted|timeout/i.test(error.message)) {
        recordTimeout();
      }
      recordFallback(error instanceof Error ? error.message : "OpenRouter generation failed.");
      recordAiFailure(
        Date.now() - startedAt,
        error instanceof Error ? error.message : "OpenRouter generation failed.",
      );
      // Safe fallback path: deterministic engine is always available.
      return fallback;
    }
  }
}

export async function getPreviousSnapshotsForPlan(params: {
  supabase: Pick<SupabaseClient, "from">;
  eventPlanId: string;
}) {
  const { supabase, eventPlanId } = params;
  const { data, error } = await supabase
    .from("queue_snapshots")
    .select(
      "id,user_id,event_plan_id,created_at,queue_data,current_phase,average_bpm,average_energy,crowd_momentum",
    )
    .eq("event_plan_id", eventPlanId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error || !data) return [];
  return data;
}

