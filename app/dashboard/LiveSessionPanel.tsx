"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  DjSessionRecord,
  SessionActivityRecord,
  UpdateSessionPayload,
} from "@/lib/dj-session/types";
import {
  AIEnhancedTrackRecommendation,
  QueueRecommendationWithMeta,
} from "@/lib/ai/queue-engine";
import { EventRecord } from "@/lib/events/types";
import { RecommendationTelemetryItem } from "@/lib/spotify/telemetry-types";
import { SpotifyDevice, SpotifyPlaybackState } from "@/lib/spotify/types";

type LiveSessionPanelProps = {
  events: EventRecord[];
  queueRecommendations?: QueueRecommendationWithMeta[];
  onRequestRecommendationRefresh?: () => Promise<void>;
  initialSession: DjSessionRecord | null;
  initialActivities: SessionActivityRecord[];
};

export function LiveSessionPanel({
  events,
  queueRecommendations = [],
  onRequestRecommendationRefresh,
  initialSession,
  initialActivities,
}: LiveSessionPanelProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [session, setSession] = useState<DjSessionRecord | null>(
    initialSession,
  );

  const [activities, setActivities] = useState<
    SessionActivityRecord[]
  >(initialActivities);

  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [isLoading, setIsLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(
    null,
  );

  const [telemetry, setTelemetry] = useState<
    RecommendationTelemetryItem[]
  >([]);

  const [devices, setDevices] = useState<SpotifyDevice[]>([]);

  const [playbackState, setPlaybackState] =
    useState<SpotifyPlaybackState | null>(null);

  const [selectedDeviceId, setSelectedDeviceId] =
    useState<string>("");
  const isPollingRef = useRef(false);

  const topSpotifySuggestion =
    useMemo<AIEnhancedTrackRecommendation | null>(() => {
      const suggestions = queueRecommendations
        .flatMap(
          (item) => item.spotifyEnhancedRecommendations ?? [],
        )
        .sort(
          (a, b) =>
            b.scoreBreakdown.total -
            a.scoreBreakdown.total,
        );

      return suggestions[0] ?? null;
    }, [queueRecommendations]);

  useEffect(() => {
    const channel = supabase
      .channel("live-dj-session")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dj_sessions",
        },
        () => {
          void refreshState();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_activity",
        },
        () => {
          void refreshState();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function refreshState() {
    try {
      const response = await fetch("/api/dj-session/state");

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ??
            "Failed to refresh session state.",
        );
      }

      setSession(data.session ?? null);
      setActivities(data.activities ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to refresh state.",
      );
    }
  }

  async function refreshDiagnosticsTelemetry() {
    try {
      const response = await fetch(
        "/api/spotify/ai-recommendations/diagnostics",
      );

      const data = await response.json();

      if (!response.ok) return;

      setTelemetry(
        (data.telemetry ??
          data.items ??
          []) as RecommendationTelemetryItem[],
      );
    } catch {
      // non-blocking telemetry refresh
    }
  }

  async function refreshPlaybackState() {
    try {
      const response = await fetch(
        "/api/spotify/playback/state",
      );

      const data = await response.json();

      if (!response.ok) return;

      setDevices(data.devices ?? []);
      setPlaybackState(data.playbackState ?? null);

      const active = (data.devices ?? []).find(
        (device: SpotifyDevice) => device.is_active,
      );

      if (active?.id) {
        setSelectedDeviceId(active.id);
      }
    } catch {
      // non-blocking playback refresh
    }
  }

  async function refreshPollingState() {
    if (isPollingRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    isPollingRef.current = true;
    try {
      await refreshDiagnosticsTelemetry();
      await refreshPlaybackState();
    } finally {
      isPollingRef.current = false;
    }
  }

  useEffect(() => {
    void refreshPollingState();

    const timer = setInterval(() => {
      void refreshPollingState();
    }, 25000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <article
      id="live-session"
      className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">
            LIVE SESSION
          </h2>

          <p className="mt-1 text-sm text-white/65">
            Realtime orchestration state for active
            event sequencing.
          </p>
        </div>

        <button
          onClick={refreshState}
          disabled={isLoading}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60"
        >
          {isLoading ? "Syncing..." : "Sync"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-black/35 p-4">
        <p className="text-xs uppercase tracking-widest text-white/60">
          Spotify Playback Orchestration
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p>
              Active device:{" "}
              <span className="text-purple-200">
                {playbackState?.device?.name ??
                  "No active device"}
              </span>
            </p>

            <p>
              Playback:{" "}
              <span className="text-purple-200">
                {playbackState?.isPlaying
                  ? "playing"
                  : "paused"}
              </span>
            </p>

            <p>
              Queue sync:{" "}
              {devices.some((d) => d.is_active)
                ? "synced"
                : "not synced"}
            </p>
          </div>

          <div className="space-y-2">
            <select
              value={selectedDeviceId}
              onChange={(event) =>
                setSelectedDeviceId(event.target.value)
              }
              className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
            >
              <option value="">
                Select playback device
              </option>

              {devices.map((device) => (
                <option
                  key={device.id}
                  value={device.id}
                >
                  {device.name} ({device.type})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </article>
  );
}