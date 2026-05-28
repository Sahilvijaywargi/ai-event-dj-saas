"use client";

import { useState } from "react";
import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";

type QueueIntelligenceSectionProps = {
  initialRecommendations: QueueRecommendationWithMeta[];
};

function momentumStyle(momentum: QueueRecommendationWithMeta["crowdMomentum"]) {
  if (momentum === "surging") return "text-green-300";
  if (momentum === "rising") return "text-purple-200";
  if (momentum === "low") return "text-amber-200";
  return "text-white/80";
}

export function QueueIntelligenceSection({
  initialRecommendations,
}: QueueIntelligenceSectionProps) {
  const [recommendations, setRecommendations] =
    useState<QueueRecommendationWithMeta[]>(initialRecommendations);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [regeneratingPlanId, setRegeneratingPlanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshQueueIntelligence() {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/queue-intelligence", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load queue intelligence.");
      }
      setRecommendations(data.recommendations ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load queue intelligence.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function regenerateQueue(eventPlanId: string) {
    setRegeneratingPlanId(eventPlanId);
    setErrorMessage(null);
    const previous = recommendations;

    setRecommendations((current) =>
      current.map((item) =>
        item.planId === eventPlanId
          ? {
              ...item,
              latestGeneratedAt: new Date().toISOString(),
            }
          : item,
      ),
    );

    try {
      const response = await fetch("/api/queue-intelligence/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventPlanId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to regenerate queue.");
      }
      await refreshQueueIntelligence();
    } catch (error) {
      setRecommendations(previous);
      setErrorMessage(error instanceof Error ? error.message : "Failed to regenerate queue.");
    } finally {
      setRegeneratingPlanId(null);
    }
  }

  return (
    <article
      id="ai-queue-intelligence"
      className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">AI Queue Intelligence</h2>
          <p className="mt-1 text-sm text-white/65">
            Adaptive sequencing with BPM flow, transition fit, and crowd momentum prediction.
          </p>
        </div>
        <button
          onClick={refreshQueueIntelligence}
          disabled={isRefreshing}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Queue AI"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {recommendations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-black/25 p-6 text-sm text-white/70">
          No queue intelligence available yet. Create an event and AI plan first.
        </div>
      ) : (
        <div className="space-y-4">
          {recommendations.map((recommendation) => (
            <div
              key={recommendation.planId}
              className="rounded-xl border border-white/10 bg-black/30 p-4"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-purple-200">
                    {recommendation.eventType}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{recommendation.eventName}</h3>
                  <p className="mt-1 text-xs text-white/60">
  Latest generated:{" "}
  {recommendation.latestGeneratedAt
    ? new Date(
        recommendation.latestGeneratedAt,
      )
        .toISOString()
        .replace("T", " ")
        .slice(0, 16)
    : "Not generated yet"}
</p>
                  <p className="text-xs text-white/60">
                    Queue versions: {recommendation.queueVersionCount}
                  </p>
                </div>
                <div className="text-right text-sm text-white/75">
                  <p>
                    Current energy:{" "}
                    <span className="font-semibold text-purple-200">
                      {recommendation.currentEnergy}/10
                    </span>
                  </p>
                  <p>
                    Crowd momentum:{" "}
                    <span className={`font-semibold ${momentumStyle(recommendation.crowdMomentum)}`}>
                      {recommendation.crowdMomentum}
                    </span>
                  </p>
                  <button
                    onClick={() => regenerateQueue(recommendation.planId)}
                    disabled={regeneratingPlanId === recommendation.planId}
                    className="mt-3 rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60"
                  >
                    {regeneratingPlanId === recommendation.planId
                      ? "Regenerating..."
                      : "Regenerate Queue"}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">
                    Next Recommended Transition
                  </p>
                  <p className="mt-2 text-sm text-white/90">
                    {recommendation.nextRecommendedTransition}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-widest text-white/60">
                    Mood phase: {recommendation.currentMoodPhase}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">BPM Flow</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/85 sm:grid-cols-3">
                    {recommendation.bpmFlow.map((range, index) => (
                      <div key={`${recommendation.planId}-bpm-${index}`} className="rounded-lg bg-white/5 p-2">
                        {range.min}-{range.max}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">Energy Curve</p>
                  <div className="mt-3 flex items-end gap-2">
                    {recommendation.energyCurve.map((value, index) => (
                      <div key={`${recommendation.planId}-energy-${index}`} className="flex-1">
                        <div
                          className="rounded-t bg-gradient-to-t from-purple-500/70 to-purple-200/80"
                          style={{ height: `${Math.max(value * 10, 16)}px` }}
                        />
                        <p className="mt-1 text-center text-[10px] text-white/65">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">Recommended Queue</p>
                  <ul className="mt-2 space-y-2 text-sm text-white/90">
                    {recommendation.recommendedQueue.slice(0, 4).map((track) => (
                      <li key={`${recommendation.planId}-${track.title}`} className="flex justify-between gap-3">
                        <span>
                          {track.title} - {track.artist}
                        </span>
                        <span className="text-purple-200">{track.bpm} BPM</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4">
                <p className="text-xs uppercase tracking-widest text-white/65">
                  Spotify Enhanced Queue Intelligence
                </p>
                {recommendation.spotifyEnhancedRecommendations?.length ? (
                  <ul className="mt-2 space-y-2 text-sm text-white/90">
                    {recommendation.spotifyEnhancedRecommendations
                      .slice(0, 3)
                      .map((track) => (
                        <li
                          key={`${recommendation.planId}-spotify-${track.id}`}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>
                            {track.name} - {track.artistName}
                          </span>
                          <span className="text-purple-200">
                            {track.bpm} BPM | {track.energy.toFixed(1)} energy | {track.aiConfidence}%
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-white/65">
                    Spotify bridge unavailable for this queue; deterministic recommendations remain active.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

