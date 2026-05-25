"use client";

import { useMemo, useState } from "react";
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
  const [session, setSession] = useState<DjSessionRecord | null>(initialSession);
  const [activities, setActivities] = useState<SessionActivityRecord[]>(initialActivities);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<RecommendationTelemetryItem[]>([]);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [playbackState, setPlaybackState] = useState<SpotifyPlaybackState | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const topSpotifySuggestion = useMemo<AIEnhancedTrackRecommendation | null>(() => {
    const suggestions = queueRecommendations
      .flatMap((item) => item.spotifyEnhancedRecommendations ?? [])
      .sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total);
    return suggestions[0] ?? null;
  }, [queueRecommendations]);

  useMemo(() => {
    const channel = supabase
      .channel("live-dj-session")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dj_sessions" },
        () => {
          void refreshState();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_activity" },
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
      if (!response.ok) throw new Error(data.message ?? "Failed to refresh session state.");
      setSession(data.session ?? null);
      setActivities(data.activities ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh state.");
    }
  }

  async function refreshDiagnosticsTelemetry() {
    try {
      const response = await fetch("/api/spotify/ai-recommendations/diagnostics");
      const data = await response.json();
      if (!response.ok) return;
      setTelemetry((data.telemetry ?? data.items ?? []) as RecommendationTelemetryItem[]);
    } catch {
      // non-blocking telemetry refresh
    }
  }

  async function refreshPlaybackState() {
    try {
      const response = await fetch("/api/spotify/playback/state");
      const data = await response.json();
      if (!response.ok) return;
      setDevices(data.devices ?? []);
      setPlaybackState(data.playbackState ?? null);
      const active = (data.devices ?? []).find((device: SpotifyDevice) => device.is_active);
      if (active?.id) setSelectedDeviceId(active.id);
    } catch {
      // non-blocking playback refresh
    }
  }

  async function selectDevice(deviceId: string) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/spotify/device/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to select device.");
      await refreshPlaybackState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to select device.");
    } finally {
      setIsLoading(false);
    }
  }

  async function playbackCommand(
    endpoint: string,
    body?: Record<string, unknown>,
  ) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Playback command failed.");
      await refreshPlaybackState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Playback command failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function startSession() {
    if (!eventId) {
      setErrorMessage("Select an event to start a live session.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/dj-session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to start session.");
      setSession(data.session);
      await refreshState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start session.");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateSession(payload: UpdateSessionPayload) {
    if (!session) return;
    const previous = session;
    setErrorMessage(null);
    setIsLoading(true);

    // Optimistic patch for fast control response
    if (payload.action === "pause") {
      setSession({ ...session, session_status: "paused" });
    }
    if (payload.action === "resume") {
      setSession({ ...session, session_status: "live" });
    }

    try {
      const response = await fetch("/api/dj-session/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to update session.");
      setSession(data.session);
      if (data.activity) {
        setActivities((current) => [data.activity, ...current].slice(0, 30));
      }
    } catch (error) {
      setSession(previous);
      setErrorMessage(error instanceof Error ? error.message : "Unable to update session.");
    } finally {
      setIsLoading(false);
    }
  }

  async function endSession() {
    if (!session) return;
    setIsLoading(true);
    setErrorMessage(null);
    const endedSession = { ...session, session_status: "ended" as const };
    setSession(endedSession);
    try {
      const response = await fetch("/api/dj-session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to end session.");
      setSession(data.session);
      await refreshState();
    } catch (error) {
      setSession(session);
      setErrorMessage(error instanceof Error ? error.message : "Unable to end session.");
    } finally {
      setIsLoading(false);
    }
  }

  useMemo(() => {
    void refreshDiagnosticsTelemetry();
    void refreshPlaybackState();
    const timer = setInterval(() => {
      void refreshDiagnosticsTelemetry();
      void refreshPlaybackState();
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  return (
    <article id="live-session" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">LIVE SESSION</h2>
          <p className="mt-1 text-sm text-white/65">
            Realtime orchestration state for active event sequencing.
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

      {!session || session.session_status === "ended" ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-black/25 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
            >
              <option value="">Select event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.event_name}
                </option>
              ))}
            </select>
            <button
              onClick={startSession}
              disabled={isLoading}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black transition hover:bg-purple-100 disabled:opacity-60"
            >
              Start Session
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Live Status</p>
              <p className="mt-1 font-semibold text-purple-200">{session.session_status}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Current Phase</p>
              <p className="mt-1 font-semibold">{session.current_phase}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Current BPM</p>
              <p className="mt-1 font-semibold">{session.current_bpm}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Energy Meter</p>
              <p className="mt-1 font-semibold">{session.current_energy}/10</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Active Track</p>
              <p className="mt-1 font-semibold">{session.active_track}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Crowd Momentum</p>
              <p className="mt-1 font-semibold">{session.crowd_momentum}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Adaptive BPM Drift</p>
              <p className="mt-1 font-semibold">
                {topSpotifySuggestion?.contextSnapshot?.bpmLane
                  ? `${Math.abs(
                      session.current_bpm -
                        (topSpotifySuggestion.contextSnapshot.bpmLane.min +
                          topSpotifySuggestion.contextSnapshot.bpmLane.max) /
                          2,
                    ).toFixed(1)} BPM`
                  : "N/A"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Adaptive Energy Drift</p>
              <p className="mt-1 font-semibold">
                {topSpotifySuggestion
                  ? `${Math.abs(session.current_energy - topSpotifySuggestion.energy).toFixed(2)}`
                  : "N/A"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">Phase Diagnostics</p>
              <p className="mt-1 font-semibold">
                {topSpotifySuggestion?.contextSnapshot?.eventPhase ?? "N/A"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {session.session_status === "live" ? (
              <button
                onClick={() =>
                  updateSession({
                    sessionId: session.id,
                    action: "pause",
                  })
                }
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={() =>
                  updateSession({
                    sessionId: session.id,
                    action: "resume",
                  })
                }
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
              >
                Resume
              </button>
            )}

            <button
              onClick={() =>
                updateSession({
                  sessionId: session.id,
                  action: "queue_transition",
                  queuePosition: activities.length + 1,
                  track: topSpotifySuggestion
                    ? `${topSpotifySuggestion.name} - ${topSpotifySuggestion.artistName}`
                    : `Transition Track ${activities.length + 1}`,
                  bpm: topSpotifySuggestion?.bpm ?? Math.min(180, session.current_bpm + 2),
                  energy: topSpotifySuggestion?.energy ?? Math.min(10, session.current_energy + 1),
                  momentum: topSpotifySuggestion ? session.crowd_momentum : "rising",
                  aiDecision: topSpotifySuggestion
                    ? `Applied Spotify-enhanced recommendation (${topSpotifySuggestion.aiConfidence}% confidence).`
                    : "Applied deterministic queue transition fallback.",
                })
              }
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Next Transition
            </button>
            <button
              onClick={async () => {
                if (onRequestRecommendationRefresh) {
                  await onRequestRecommendationRefresh();
                }
                await refreshState();
              }}
              className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10"
            >
              Refresh AI Recs
            </button>
            <button
              onClick={() =>
                updateSession({
                  sessionId: session.id,
                  action: "phase_change",
                  phase:
                    session.current_phase === "warmup"
                      ? "build"
                      : session.current_phase === "build"
                        ? "peak"
                        : "cooldown",
                  aiDecision: "Phase transitioned, triggering phase-aware recommendation invalidation.",
                })
              }
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Advance Phase
            </button>

            <button
              onClick={endSession}
              className="rounded-full border border-red-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-200 hover:bg-red-500/10"
            >
              End Session
            </button>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Spotify Playback Orchestration</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p>
                  Active device:{" "}
                  <span className="text-purple-200">
                    {playbackState?.device?.name ?? "No active device"}
                  </span>
                </p>
                <p>
                  Playback:{" "}
                  <span className="text-purple-200">
                    {playbackState?.isPlaying ? "playing" : "paused"}
                  </span>
                </p>
                <p>
                  Current track:{" "}
                  <span className="text-purple-200">
                    {playbackState?.track
                      ? `${playbackState.track.name} - ${playbackState.track.artistName}`
                      : "None"}
                  </span>
                </p>
                <p>Progress: {Math.round((playbackState?.progressMs ?? 0) / 1000)}s</p>
                <p>Queue sync: {devices.some((d) => d.is_active) ? "synced" : "not synced"}</p>
              </div>
              <div className="space-y-2">
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
                >
                  <option value="">Select playback device</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name} ({device.type})
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      if (selectedDeviceId) void selectDevice(selectedDeviceId);
                    }}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/10"
                  >
                    Sync Device
                  </button>
                  <button
                    onClick={() => void playbackCommand("/api/spotify/playback/play", { deviceId: selectedDeviceId || undefined })}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/10"
                  >
                    Play
                  </button>
                  <button
                    onClick={() => void playbackCommand("/api/spotify/playback/pause")}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/10"
                  >
                    Pause
                  </button>
                  <button
                    onClick={() => void playbackCommand("/api/spotify/playback/skip")}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/10"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => {
                      const trackId = topSpotifySuggestion?.id;
                      if (trackId) {
                        void playbackCommand("/api/spotify/playback/queue", {
                          spotifyTrackId: trackId,
                          deviceId: selectedDeviceId || undefined,
                        });
                      }
                    }}
                    className="rounded-full border border-purple-300/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10"
                  >
                    Queue AI Track
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void playbackCommand("/api/spotify/playback/volume", { volumePercent: 35, deviceId: selectedDeviceId || undefined })}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/10"
                  >
                    Vol 35%
                  </button>
                  <button
                    onClick={() => void playbackCommand("/api/spotify/playback/volume", { volumePercent: 65, deviceId: selectedDeviceId || undefined })}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/10"
                  >
                    Vol 65%
                  </button>
                  <button
                    onClick={() => void playbackCommand("/api/spotify/playback/seek", { positionMs: 45000, deviceId: selectedDeviceId || undefined })}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/10"
                  >
                    Seek 45s
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Realtime Transition Updates</p>
            <div className="mt-3 space-y-2 text-sm text-white/85">
              {activities.length === 0 ? (
                <p className="text-white/60">No live activity yet.</p>
              ) : (
                activities.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{activity.activity_type.replaceAll("_", " ")}</span>
                    <span className="text-xs text-white/60">
                      {new Date(activity.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/35 p-4">
            <p className="text-xs uppercase tracking-widest text-white/60">Lightweight Diagnostics Telemetry</p>
            <div className="mt-3 space-y-2 text-xs text-white/80">
              {telemetry.slice(0, 3).map((item) => (
                <div key={item.eventPlanId} className="rounded-lg border border-white/10 bg-black/25 p-3">
                  <p className="font-semibold text-white">{item.eventName}</p>
                  <p>Lifecycle: {item.lifecycleState}</p>
                  <p>Trigger: {item.triggerSource}</p>
                  <p>Freshness: {item.freshness}</p>
                  <p>Cache age: {item.cacheAgeSeconds}s</p>
                  <p>
                    Drift BPM/Energy: {item.drift.bpmLaneDriftPercent}% / {item.drift.energyDriftPercent}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

