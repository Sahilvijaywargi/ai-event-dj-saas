"use client";

import { useMemo, useState } from "react";
import { AIEnhancedTrackRecommendation, QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { RecommendationTelemetryItem } from "@/lib/spotify/telemetry-types";

type AiSpotifyRecommendationsPanelProps = {
  initialRecommendations: QueueRecommendationWithMeta[];
};

type ServedMeta = {
  eventPhase: string | null;
  sourceContext: string | null;
  invalidationStatus: "valid" | "invalidated";
  refreshReason: string | null;
  triggerSource: RecommendationTelemetryItem["triggerSource"];
  lifecycleState: RecommendationTelemetryItem["lifecycleState"];
  thresholdDiagnostics?: {
    drift: {
      bpmLaneDriftPercent: number;
      momentumDrift: number;
      energyDriftPercent: number;
      stalenessPercent: number;
      phaseDistance: number;
    };
    thresholds: {
      bpmLaneDriftThresholdPercent: number;
      crowdMomentumDriftThreshold: number;
      energyDriftThresholdPercent: number;
      recommendationStalenessThresholdPercent: number;
      phaseTransitionSensitivity: number;
    };
  };
};

type FlattenedTrack = AIEnhancedTrackRecommendation & {
  eventName: string;
  eventType: string;
  eventPhase?: string | null;
  sourceContext?: string | null;
  invalidationStatus?: "valid" | "invalidated";
  refreshReason?: string | null;
};

export function AiSpotifyRecommendationsPanel({
  initialRecommendations,
}: AiSpotifyRecommendationsPanelProps) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [cacheSource, setCacheSource] = useState<"cache" | "live" | null>(null);
  const [telemetryByPlan, setTelemetryByPlan] = useState<Record<string, RecommendationTelemetryItem>>(
    {},
  );
  const [servedMetaByPlan, setServedMetaByPlan] = useState<Record<string, ServedMeta>>(
    {},
  );

  async function refreshRecommendations(forceRefresh = false) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const endpoint = forceRefresh
        ? "/api/spotify/ai-recommendations/refresh"
        : "/api/spotify/ai-recommendations";
      const response = await fetch(endpoint, {
        method: forceRefresh ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: forceRefresh ? JSON.stringify({ forceRefresh: true }) : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load AI Spotify recommendations.");
      }

      const merged = new Map<string, QueueRecommendationWithMeta>();
      for (const item of recommendations) {
        merged.set(item.planId, item);
      }
      for (const served of data.served ?? []) {
        const existing = merged.get(served.eventPlanId);
        if (!existing) continue;
        merged.set(served.eventPlanId, {
          ...existing,
          spotifyEnhancedRecommendations: served.tracks ?? [],
        });
      }
      const nextMeta: Record<string, ServedMeta> = {};
      for (const served of data.served ?? []) {
        nextMeta[served.eventPlanId] = {
          eventPhase: served.eventPhase ?? null,
          sourceContext: served.sourceContext ?? null,
          invalidationStatus: served.invalidationStatus ?? "valid",
          refreshReason: served.refreshReason ?? null,
          triggerSource: served.triggerSource ?? "none",
          lifecycleState: served.lifecycleState ?? "active",
          thresholdDiagnostics: served.thresholdDiagnostics,
        };
      }
      setServedMetaByPlan(nextMeta);
      setRecommendations(Array.from(merged.values()));
      setLastUpdatedAt(data.generatedAt ?? new Date().toISOString());
      const firstSource = (data.served?.[0]?.source as "cache" | "live" | undefined) ?? null;
      setCacheSource(firstSource);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load AI Spotify recommendations.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function pollDiagnostics() {
    try {
      const response = await fetch("/api/spotify/ai-recommendations/diagnostics");
      const data = await response.json();
      if (!response.ok) return;
      const next: Record<string, RecommendationTelemetryItem> = {};
      const telemetryItems = (data.telemetry ?? data.items ?? []) as RecommendationTelemetryItem[];
      for (const item of telemetryItems) {
        next[item.eventPlanId] = item as RecommendationTelemetryItem;
      }
      setTelemetryByPlan(next);
    } catch {
      // best-effort polling only
    }
  }

  const topTracks = useMemo(() => {
    const flat: FlattenedTrack[] = [];
    for (const recommendation of recommendations) {
      for (const track of recommendation.spotifyEnhancedRecommendations ?? []) {
        flat.push({
          ...track,
          eventName: recommendation.eventName,
          eventType: recommendation.eventType,
          eventPhase: servedMetaByPlan[recommendation.planId]?.eventPhase ?? null,
          sourceContext: servedMetaByPlan[recommendation.planId]?.sourceContext ?? null,
          invalidationStatus: servedMetaByPlan[recommendation.planId]?.invalidationStatus ?? "valid",
          refreshReason: servedMetaByPlan[recommendation.planId]?.refreshReason ?? null,
        });
      }
    }
    return flat.sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total).slice(0, 12);
  }, [recommendations, servedMetaByPlan]);

  useMemo(() => {
    void pollDiagnostics();
    const timer = setInterval(() => {
      void pollDiagnostics();
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <article id="ai-spotify-recommendations" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">AI Spotify Recommendations</h2>
          <p className="mt-1 text-sm text-white/65">
            Spotify-backed tracks ranked by BPM, energy, blending, and crowd momentum fit.
          </p>
          <p className="mt-2 text-xs text-white/60">
            Source: {cacheSource ? cacheSource.toUpperCase() : "N/A"} | Last updated:{" "}
            {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "Not yet fetched"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refreshRecommendations(false)}
            disabled={isLoading}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:bg-white/10 disabled:opacity-60"
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => refreshRecommendations(true)}
            disabled={isLoading}
            className="rounded-full border border-purple-300/30 bg-purple-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 transition hover:border-purple-200/50 disabled:opacity-60"
          >
            Force Live
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {topTracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-black/25 p-5 text-sm text-white/70">
          No Spotify-enhanced recommendations yet. Connect Spotify and refresh queue intelligence.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topTracks.map((track) => (
            <div key={`${track.eventName}-${track.id}`} className="rounded-xl border border-white/10 bg-black/35 p-4">
              <p className="text-xs uppercase tracking-widest text-purple-200">{track.eventType}</p>
              <p className="mt-1 text-sm font-semibold">{track.name}</p>
              <p className="text-xs text-white/70">{track.artistName}</p>
              <div className="mt-2 space-y-1 text-xs text-white/75">
                <p>BPM: {track.bpm}</p>
                <p>Energy: {track.energy.toFixed(2)}</p>
                <p>AI confidence: {track.aiConfidence}%</p>
                <p>Source: {track.sourceLabel}</p>
                <p>Phase context: {track.eventPhase ?? "N/A"}</p>
                <p>Source context: {track.sourceContext ?? "N/A"}</p>
                <p>Invalidation: {track.invalidationStatus ?? "N/A"}</p>
                <p>Refresh reason: {track.refreshReason ?? "-"}</p>
                <p>
                  BPM drift:{" "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.thresholdDiagnostics?.drift.bpmLaneDriftPercent ?? 0}
                  % /{" "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.thresholdDiagnostics?.thresholds.bpmLaneDriftThresholdPercent ?? 0}
                  %
                </p>
                <p>
                  Energy drift:{" "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.thresholdDiagnostics?.drift.energyDriftPercent ?? 0}
                  % /{" "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.thresholdDiagnostics?.thresholds.energyDriftThresholdPercent ?? 0}
                  %
                </p>
                <p>
                  Momentum drift:{" "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.thresholdDiagnostics?.drift.momentumDrift ?? 0}
                  {" / "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.thresholdDiagnostics?.thresholds.crowdMomentumDriftThreshold ?? 0}
                </p>
                <p>
                  Trigger:{" "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.triggerSource ?? "none"}
                </p>
                <p>
                  Lifecycle:{" "}
                  {servedMetaByPlan[recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""]
                    ?.lifecycleState ?? "active"}
                </p>
                <p>
                  Cache age:{" "}
                  {telemetryByPlan[
                    recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""
                  ]?.cacheAgeSeconds ?? 0}
                  s
                </p>
                <p>
                  Freshness:{" "}
                  {telemetryByPlan[
                    recommendations.find((r) => r.eventName === track.eventName)?.planId ?? ""
                  ]?.freshness ?? "unknown"}
                </p>
              </div>
              <p className="mt-2 text-xs text-white/65">{track.transitionReason}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

