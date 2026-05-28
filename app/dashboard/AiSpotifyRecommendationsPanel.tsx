"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AIEnhancedTrackRecommendation,
  QueueRecommendationWithMeta,
} from "@/lib/ai/queue-engine";

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
  const [recommendations, setRecommendations] =
    useState(initialRecommendations);

  const [isLoading, setIsLoading] = useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [lastUpdatedAt, setLastUpdatedAt] =
    useState<string | null>(null);

  const [cacheSource, setCacheSource] =
    useState<"cache" | "live" | null>(null);

  const [telemetryByPlan, setTelemetryByPlan] =
    useState<Record<string, RecommendationTelemetryItem>>(
      {},
    );

  const [servedMetaByPlan, setServedMetaByPlan] =
    useState<Record<string, ServedMeta>>({});

  const isMountedRef = useRef(false);
  const isPollingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function refreshRecommendations(
    forceRefresh = false,
  ) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const endpoint = forceRefresh
        ? "/api/spotify/ai-recommendations/refresh"
        : "/api/spotify/ai-recommendations";

      const response = await fetch(endpoint, {
        method: forceRefresh ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body: forceRefresh
          ? JSON.stringify({ forceRefresh: true })
          : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Failed to load AI Spotify recommendations.",
        );
      }

      const merged =
        new Map<string, QueueRecommendationWithMeta>();

      for (const item of recommendations) {
        merged.set(item.planId, item);
      }

      for (const served of data.served ?? []) {
        const existing = merged.get(
          served.eventPlanId,
        );

        if (!existing) continue;

        merged.set(served.eventPlanId, {
          ...existing,
          spotifyEnhancedRecommendations:
            served.tracks ?? [],
        });
      }

      const nextMeta: Record<string, ServedMeta> = {};

      for (const served of data.served ?? []) {
        nextMeta[served.eventPlanId] = {
          eventPhase: served.eventPhase ?? null,
          sourceContext:
            served.sourceContext ?? null,
          invalidationStatus:
            served.invalidationStatus ?? "valid",
          refreshReason:
            served.refreshReason ?? null,
          triggerSource:
            served.triggerSource ?? "none",
          lifecycleState:
            served.lifecycleState ?? "active",
          thresholdDiagnostics:
            served.thresholdDiagnostics,
        };
      }

      if (isMountedRef.current) {
        setServedMetaByPlan(nextMeta);

        setRecommendations(
          Array.from(merged.values()),
        );

        setLastUpdatedAt(
          data.generatedAt ??
            new Date().toISOString(),
        );

        const firstSource =
          (data.served?.[0]?.source as
            | "cache"
            | "live"
            | undefined) ?? null;

        setCacheSource(firstSource);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load AI Spotify recommendations.",
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  async function pollDiagnostics() {
    if (isPollingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isPollingRef.current = true;
    try {
      const response = await fetch(
        "/api/spotify/ai-recommendations/diagnostics",
      );

      const data = await response.json();

      if (!response.ok) return;

      const next: Record<
        string,
        RecommendationTelemetryItem
      > = {};

      const telemetryItems = (
        data.telemetry ??
        data.items ??
        []
      ) as RecommendationTelemetryItem[];

      for (const item of telemetryItems) {
        next[item.eventPlanId] =
          item as RecommendationTelemetryItem;
      }

      if (isMountedRef.current) {
        setTelemetryByPlan(next);
      }
    } catch {
      // best-effort polling only
    } finally {
      isPollingRef.current = false;
    }
  }

  useEffect(() => {
    void pollDiagnostics();

    const timer = setInterval(() => {
      void pollDiagnostics();
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const topTracks = useMemo(() => {
    const flat: FlattenedTrack[] = [];

    for (const recommendation of recommendations) {
      for (const track of recommendation.spotifyEnhancedRecommendations ??
        []) {
        flat.push({
          ...track,
          eventName: recommendation.eventName,
          eventType: recommendation.eventType,
          eventPhase:
            servedMetaByPlan[recommendation.planId]
              ?.eventPhase ?? null,
          sourceContext:
            servedMetaByPlan[recommendation.planId]
              ?.sourceContext ?? null,
          invalidationStatus:
            servedMetaByPlan[recommendation.planId]
              ?.invalidationStatus ?? "valid",
          refreshReason:
            servedMetaByPlan[recommendation.planId]
              ?.refreshReason ?? null,
        });
      }
    }

    return flat
      .sort(
        (a, b) =>
          b.scoreBreakdown.total -
          a.scoreBreakdown.total,
      )
      .slice(0, 12);
  }, [recommendations, servedMetaByPlan]);

  return (
    <article className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      {/* KEEP YOUR EXISTING JSX BELOW THIS */}
    </article>
  );
}