"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReliabilityMiniPill, ReliabilityMiniState } from "@/app/operator/ReliabilityMiniPill";
import * as Sentry from "@sentry/nextjs";
import {
  createMemoizedRuntimeSelector,
  createSwrCache,
  evaluateRuntimePerformanceState,
  getAdaptivePollingOptimization,
  getNetworkEfficiencyMetrics,
} from "@/lib/runtime/performance";
import { QaReadinessPill } from "@/app/qa/QaReadinessPill";

type OperatorEvent = {
  id: string;
  event_name: string;
  event_type: string;
  event_date: string;
  start_time: string;
  end_time: string;
  crowd_size: number;
  energy_level: number;
};

type LiveSession = {
  id: string;
  event_id: string;
  session_status: "live" | "paused" | "ended";
  started_at: string;
  current_phase: string;
  current_energy: number;
  current_bpm: number;
  active_track: string;
  crowd_momentum: "low" | "steady" | "rising" | "surging";
};

type PlaybackState = {
  isPlaying: boolean;
  progressMs: number;
  device: { id: string; name: string; volumePercent: number | null } | null;
  track: { id: string; name: string; artistName: string } | null;
};

type RuntimeState = {
  unifiedConfidence: { unifiedConfidence: number };
  signalSummary: {
    crowdSentiment: number;
    audioEngagement: number;
  };
};

type QueueRecommendation = {
  nextTransitionSuggestion: string;
  recommendedQueue: Array<{ id: string; title: string; phase: string }>;
};

type OperatorConsoleProps = {
  initialEvents: OperatorEvent[];
};

type OperatorLockState = {
  locked: boolean;
  expiresAt: string | null;
  remainingSeconds: number;
};

type ProtectedActionKey =
  | "stop_autonomous_mode"
  | "emergency_cooldown"
  | "fallback_safe_mode"
  | "spotify_reconnect"
  | "device_switch"
  | "runtime_reset";

type ProtectedActionMeta = {
  title: string;
  impact: string;
  whyLocked: string;
  severity: "medium" | "high" | "critical";
  requiresConfirm: boolean;
};

const PROTECTED_ACTIONS: Record<ProtectedActionKey, ProtectedActionMeta> = {
  stop_autonomous_mode: {
    title: "Stop Autonomous Mode",
    impact: "AI-assisted transitions halt and control returns fully manual.",
    whyLocked: "Prevent accidental interruption during active dance-floor momentum.",
    severity: "high",
    requiresConfirm: true,
  },
  emergency_cooldown: {
    title: "Emergency Cooldown",
    impact: "Current phase shifts to cooldown and energy lane drops fast.",
    whyLocked: "Prevents abrupt crowd-energy disruption from accidental taps.",
    severity: "critical",
    requiresConfirm: true,
  },
  fallback_safe_mode: {
    title: "Fallback Safe Mode",
    impact: "Runtime switches to conservative fallback handling.",
    whyLocked: "Ensures fallback is intentionally operator-triggered.",
    severity: "high",
    requiresConfirm: true,
  },
  spotify_reconnect: {
    title: "Reconnect Spotify",
    impact: "Starts reconnect flow and can interrupt active control flow.",
    whyLocked: "Avoids unintended auth/device interruptions mid-session.",
    severity: "medium",
    requiresConfirm: false,
  },
  device_switch: {
    title: "Switch Active Device",
    impact: "Transfers playback target to another Spotify device.",
    whyLocked: "Prevents accidental audio output changes during live playback.",
    severity: "high",
    requiresConfirm: true,
  },
  runtime_reset: {
    title: "Runtime Reset",
    impact: "Stops autonomous runtime and resets session to safe warmup lane.",
    whyLocked: "Protects against accidental orchestration resets in live events.",
    severity: "critical",
    requiresConfirm: true,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function vibeLabel(energy: number) {
  if (energy >= 8.5) return "Peak Party";
  if (energy >= 6.5) return "Dance Ready";
  if (energy >= 4.5) return "Warm Vibe";
  return "Chill";
}

export function OperatorConsole({ initialEvents }: OperatorConsoleProps) {
  const [events] = useState<OperatorEvent[]>(initialEvents);
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEvents[0]?.id ?? "");
  const [operatorMode, setOperatorMode] = useState<"simple" | "guided">("guided");
  const [showHints, setShowHints] = useState(true);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [devices, setDevices] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);
  const [queue, setQueue] = useState<QueueRecommendation | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runtimeDuration, setRuntimeDuration] = useState("0m");
  const [lockState, setLockState] = useState<OperatorLockState>({
    locked: true,
    expiresAt: null,
    remainingSeconds: 0,
  });
  const [pin, setPin] = useState("");
  const [sheetAction, setSheetAction] = useState<ProtectedActionKey | null>(null);
  const [sheetIntent, setSheetIntent] = useState<(() => Promise<void>) | null>(null);
  const [sheetConfirmOpen, setSheetConfirmOpen] = useState(false);
  const [reliability, setReliability] = useState<ReliabilityMiniState | null>(null);
  const [recoveryState, setRecoveryState] = useState<{
    recoverable: boolean;
    staleSnapshot: boolean;
    historyCount: number;
    consistency: { status: "consistent" | "degraded" | "stale" | "unrecoverable"; issues: string[] };
    continuityDiagnostics: string[];
    latestSnapshot: {
      createdAt: string;
      session: { status: "live" | "paused" | "ended" | "none"; phase: string | null };
      playback: { trackName: string | null; isPlaying: boolean };
    } | null;
  } | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [failureCount, setFailureCount] = useState(0);

  const selector = useMemo(
    () =>
      createMemoizedRuntimeSelector((input: {
        sessionStatus: string | null;
        phase: string | null;
        confidence: number;
      }) => ({
        sessionStatus: input.sessionStatus,
        phase: input.phase,
        confidence: Number(input.confidence.toFixed(1)),
      })),
    [],
  );
  const swrCache = useMemo(() => createSwrCache<unknown>(5500), []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const nextSuggestedTrack = useMemo(() => {
    const top = queue?.recommendedQueue?.[0];
    return top ? top.title : "AI preparing next suggestion";
  }, [queue]);

  const fetchState = useCallback(async () => {
    const cached = swrCache.read("operator:state");
    if (cached && !cached.stale) {
      return;
    }
    try {
      const [sessionRes, playbackRes, runtimeRes, queueRes, devicesRes, lockRes, reliabilityRes, recoveryRes] = await Promise.all([
        fetch("/api/dj-session/state"),
        fetch("/api/spotify/playback/state"),
        fetch("/api/runtime-intelligence/state"),
        fetch("/api/queue-intelligence"),
        fetch("/api/spotify/devices"),
        fetch("/api/operator/lock/state"),
        fetch("/api/runtime/reliability"),
        fetch("/api/runtime/recovery/state"),
      ]);
      const sessionData = await sessionRes.json();
      const playbackData = await playbackRes.json();
      const runtimeData = await runtimeRes.json();
      const queueData = await queueRes.json();
      const devicesData = await devicesRes.json();
      const lockData = await lockRes.json();
      const reliabilityData = await reliabilityRes.json();
      const recoveryData = await recoveryRes.json();
      swrCache.write("operator:state", {
        sessionData,
        playbackData,
        runtimeData,
        queueData,
        lockData,
        reliabilityData,
        recoveryData,
      });
      setRequestCount((value) => value + 1);

      if (sessionRes.ok) setSession((sessionData.session ?? null) as LiveSession | null);
      if (playbackRes.ok) {
        setPlayback((playbackData.playbackState ?? null) as PlaybackState | null);
        setDevices((playbackData.devices ?? []) as Array<{ id: string; name: string; is_active: boolean }>);
      } else if (devicesRes.ok) {
        setDevices((devicesData.devices ?? []) as Array<{ id: string; name: string; is_active: boolean }>);
      }
      if (runtimeRes.ok) setRuntime((runtimeData.state ?? null) as RuntimeState | null);
      if (lockRes.ok) setLockState(lockData as OperatorLockState);
      if (reliabilityRes.ok) setReliability((reliabilityData.state ?? null) as ReliabilityMiniState | null);
      if (recoveryRes.ok) setRecoveryState((recoveryData.state ?? null) as typeof recoveryState);

      if (queueRes.ok) {
        const first = (queueData.recommendations ?? [])[0];
        if (first) {
          setQueue({
            nextTransitionSuggestion: first.nextTransitionSuggestion,
            recommendedQueue: (first.recommendedQueue ?? []).map(
              (track: { id: string; title: string; phase: string }) => ({
                id: track.id,
                title: track.title,
                phase: track.phase,
              }),
            ),
          });
        } else {
          setQueue(null);
        }
      }
    } catch {
      setErrorMessage("Live sync failed. Tap refresh to retry.");
      Sentry.captureMessage("Operator console live sync failed.", "warning");
      setFailureCount((value) => value + 1);
    }
  }, [swrCache]);

  const callApi = useCallback(async (
    url: string,
    method: "GET" | "POST" = "POST",
    body?: Record<string, unknown>,
  ) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Operator action failed.");
      }
      await fetchState();
      setRequestCount((value) => value + 1);
      return data;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Operator action failed.");
      Sentry.captureException(error, {
        tags: { area: "operator_console", action: url },
        level: "error",
      });
      setFailureCount((value) => value + 1);
      return null;
    } finally {
      setIsBusy(false);
    }
  }, [fetchState]);

  async function unlockOperator() {
    if (!pin.trim()) {
      setErrorMessage("Enter operator PIN to unlock protected actions.");
      return false;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/operator/lock/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unlock failed.");
      setPin("");
      setLockState(data as OperatorLockState);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unlock failed.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function unlockOperatorFromSheet() {
    const unlocked = await unlockOperator();
    if (unlocked && sheetIntent) {
      const intent = sheetIntent;
      setSheetIntent(null);
      setSheetAction(null);
      setSheetConfirmOpen(false);
      await intent();
    }
  }

  async function relockOperator() {
    await callApi("/api/operator/lock/lock", "POST");
    setLockState({ locked: true, expiresAt: null, remainingSeconds: 0 });
  }

  function openProtectedSheet(action: ProtectedActionKey, intent: () => Promise<void>) {
    setSheetAction(action);
    setSheetIntent(() => intent);
    setSheetConfirmOpen(false);
  }

  async function runProtectedAction(action: ProtectedActionKey, intent: () => Promise<void>) {
    if (lockState.locked) {
      openProtectedSheet(action, intent);
      return;
    }
    if (PROTECTED_ACTIONS[action].requiresConfirm) {
      openProtectedSheet(action, intent);
      setSheetConfirmOpen(true);
      return;
    }
    await intent();
  }

  async function startGuidedEvent() {
    if (!selectedEventId) {
      setErrorMessage("Select an event first.");
      return;
    }
    await callApi("/api/dj-session/start", "POST", { eventId: selectedEventId });
    await callApi("/api/autonomous-loop/start", "POST", {
      supervisionMode: "assisted_autonomous",
      intervalMs: 12000,
    });
  }

  const checkpointRecovery = useCallback(async (source: "operator_poll" | "operator_manual" | "reconnect") => {
    await callApi("/api/runtime/recovery/checkpoint", "POST", {
      source,
      snapshot: {
        session: {
          sessionId: session?.id ?? null,
          eventId: session?.event_id ?? null,
          status: session?.session_status ?? "none",
          phase: session?.current_phase ?? null,
          energy: session?.current_energy ?? null,
          bpm: session?.current_bpm ?? null,
          activeTrack: session?.active_track ?? null,
        },
        playback: {
          activeDevice: playback?.device?.name ?? null,
          isPlaying: playback?.isPlaying ?? false,
          trackName: playback?.track?.name ?? null,
          progressMs: playback?.progressMs ?? null,
        },
        autonomous: {
          status: "unknown",
          supervisionMode: "unknown",
          lastDecision: null,
          pendingTransition: null,
        },
        reliability: {
          connectionQuality: reliability?.connectionQuality ?? "unknown",
          spotifySyncHealth: reliability?.spotifySyncHealth ?? "unknown",
          heartbeatStale: reliability?.heartbeat?.stale ?? false,
        },
      },
    });
  }, [callApi, session, playback, reliability]);

  async function restoreRecovery() {
    setRecoveryMessage(null);
    const result = await callApi("/api/runtime/recovery/restore");
    if (result?.snapshot) {
      setRecoveryMessage("Recovered session context from latest checkpoint.");
      await fetchState();
      return;
    }
    setRecoveryMessage("No restorable snapshot found. Running safe live sync.");
    await fetchState();
  }

  async function adjustEnergy(delta: number, reason: string) {
    if (!session) return;
    const nextEnergy = clamp((session.current_energy ?? 5) + delta, 1, 10);
    await callApi("/api/dj-session/update", "POST", {
      sessionId: session.id,
      action: "energy_change",
      energy: nextEnergy,
      aiDecision: reason,
    });
  }

  const performanceState = useMemo(() => {
    const visible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
    const online = typeof navigator !== "undefined" ? navigator.onLine : true;
    const connection = typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          connection?: { effectiveType?: string; saveData?: boolean };
        }).connection
      : undefined;
    const effectiveType = connection?.effectiveType ?? "4g";
    const saveData = connection?.saveData ?? false;
    const polling = getAdaptivePollingOptimization({
      visible,
      online,
      saveData,
      effectiveType,
      baseIntervalMs: reliability?.pollingBackoffMs ?? 6500,
    });
    const network = getNetworkEfficiencyMetrics({
      online,
      effectiveType,
      saveData,
      failureCount,
      requestCount,
    });
    return evaluateRuntimePerformanceState({
      polling,
      network,
      renderCountEstimate: Math.max(
        8,
        Math.min(90, requestCount * 3 + failureCount * 8 + (reliability?.isRecovering ? 12 : 0)),
      ),
    });
  }, [failureCount, requestCount, reliability?.isRecovering, reliability?.pollingBackoffMs]);

  useEffect(() => {
    const startup = setTimeout(() => {
      void fetchState();
    }, 0);
    const interval = setInterval(() => {
      if (performanceState.polling.shouldPoll) {
        void fetchState();
      }
    }, performanceState.polling.recommendedIntervalMs);
    return () => {
      clearTimeout(startup);
      clearInterval(interval);
    };
  }, [fetchState, performanceState.polling.recommendedIntervalMs, performanceState.polling.shouldPoll]);

  useEffect(() => {
    if (!session && !playback && !reliability) return;
    const timer = setTimeout(() => {
      void checkpointRecovery("operator_poll");
    }, 0);
    return () => clearTimeout(timer);
  }, [checkpointRecovery, session, playback, reliability]);

  useEffect(() => {
    if (!session?.started_at) {
      const resetTimer = setTimeout(() => {
        setRuntimeDuration("0m");
      }, 0);
      return () => clearTimeout(resetTimer);
    }
    const updateDuration = () => {
      const elapsedMs = Date.now() - new Date(session.started_at).getTime();
      const mins = Math.max(0, Math.floor(elapsedMs / 60000));
      const hrs = Math.floor(mins / 60);
      setRuntimeDuration(hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`);
    };
    updateDuration();
    const interval = setInterval(updateDuration, 30000);
    return () => clearInterval(interval);
  }, [session?.started_at]);

  useEffect(() => {
    if (lockState.locked || !lockState.expiresAt) return;
    const countdown = setInterval(() => {
      setLockState((current) => {
        if (current.locked || !current.expiresAt) return current;
        const remaining = Math.max(0, Math.floor((new Date(current.expiresAt).getTime() - Date.now()) / 1000));
        if (remaining <= 0) {
          return { locked: true, expiresAt: null, remainingSeconds: 0 };
        }
        return { ...current, remainingSeconds: remaining };
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, [lockState.locked, lockState.expiresAt]);

  useEffect(() => {
    if (lockState.locked) return;
    const autoRelock = async () => {
      try {
        await fetch("/api/operator/lock/lock", { method: "POST" });
      } finally {
        setLockState({ locked: true, expiresAt: null, remainingSeconds: 0 });
      }
    };
    let inactivityTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      void autoRelock();
    }, 2 * 60 * 1000);
    const resetTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        void autoRelock();
      }, 2 * 60 * 1000);
    };
    const events = ["pointerdown", "keydown", "touchstart"];
    for (const eventName of events) window.addEventListener(eventName, resetTimer);
    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      for (const eventName of events) window.removeEventListener(eventName, resetTimer);
    };
  }, [lockState.locked]);

  const crowdEnergy = Number(
    (
      ((session?.current_energy ?? selectedEvent?.energy_level ?? 5) * 10 +
        (runtime?.signalSummary?.audioEngagement ?? 50) * 0.5) /
      1.5
    ).toFixed(1),
  );
  const aiConfidence = Number((runtime?.unifiedConfidence?.unifiedConfidence ?? 0).toFixed(1));
  const selectedRuntime = selector({
    sessionStatus: session?.session_status ?? null,
    phase: session?.current_phase ?? null,
    confidence: aiConfidence,
  });
  const simpleVibe = vibeLabel(session?.current_energy ?? selectedEvent?.energy_level ?? 5);
  const activeDevice = playback?.device?.name ?? devices.find((device) => device.is_active)?.name ?? "No active device";

  return (
    <section className="space-y-4 md:space-y-5">
      <header className="glass-panel rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-purple-200">AI EVENT DJ</p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Operator Mode</h1>
            <p className="mt-1 text-sm text-white/70">
              Simplified live controls for house parties, weddings, and private events.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QaReadinessPill />
            <ReliabilityMiniPill
              reliability={reliability}
              onReconnect={() => {
                void callApi("/api/runtime/recovery/reconnect");
              }}
              onResync={() => {
                void callApi("/api/runtime/recovery/resync");
              }}
              busy={isBusy}
            />
            <span
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
                lockState.locked
                  ? "border-amber-300/40 bg-amber-500/10 text-amber-100"
                  : "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
              }`}
            >
              {lockState.locked ? "Lock Mode: Protected" : `Unlocked: ${lockState.remainingSeconds}s`}
            </span>
            <button
              onClick={() => setOperatorMode(operatorMode === "guided" ? "simple" : "guided")}
              className="rounded-full border border-purple-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10"
            >
              {operatorMode === "guided" ? "Guided Mode On" : "Simple Mode On"}
            </button>
            <span className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/80">
              Perf {performanceState.polling.pollingIntensity} | {performanceState.renderLoad}
            </span>
            <button
              onClick={() => setShowHints((value) => !value)}
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              {showHints ? "Hide Hints" : "Show Hints"}
            </button>
            {!lockState.locked ? (
              <button
                onClick={() => void relockOperator()}
                className="rounded-full border border-amber-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-100 hover:bg-amber-500/10"
              >
                Relock
              </button>
            ) : null}
            <a
              href="/dashboard"
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10"
            >
              Advanced Dashboard
            </a>
          </div>
        </div>
        {showHints ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-white/80">
            <p className="font-medium text-white">Guided startup</p>
            <p className="mt-1">
              1) Pick event 2) Start Event 3) Confirm Spotify device 4) Tap Start AI Mode 5) Use energy buttons as needed.
            </p>
          </div>
        ) : null}
      </header>

      {errorMessage ? (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      <p className="text-xs text-white/55">
        Polling {performanceState.polling.recommendedIntervalMs}ms | Battery{" "}
        {performanceState.polling.batteryFriendlyMode ? "friendly" : "normal"} | Network{" "}
        {performanceState.network.effectiveType} | Session {selectedRuntime.sessionStatus ?? "none"} | Phase{" "}
        {selectedRuntime.phase ?? "n/a"}
      </p>

      {recoveryMessage ? (
        <p className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {recoveryMessage}
        </p>
      ) : null}

      {recoveryState ? (
        <article className="glass-panel rounded-2xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Session Recovery</h2>
              <p className="mt-1 text-sm text-white/70">
                {recoveryState.recoverable
                  ? "Recovery snapshot available."
                  : "No reliable snapshot yet. Live sync fallback active."}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void checkpointRecovery("operator_manual")}
                disabled={isBusy}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
              >
                Checkpoint
              </button>
              <button
                onClick={() => void restoreRecovery()}
                disabled={isBusy}
                className="rounded-full border border-purple-300/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/10 disabled:opacity-60"
              >
                Restore
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Consistency" value={recoveryState.consistency.status} />
            <Metric label="History" value={`${recoveryState.historyCount}`} />
            <Metric label="Stale Snapshot" value={recoveryState.staleSnapshot ? "yes" : "no"} />
            <Metric
              label="Restored Session"
              value={recoveryState.latestSnapshot?.session.status ?? "none"}
            />
          </div>
          {recoveryState.consistency.issues.length > 0 ? (
            <p className="mt-2 text-xs text-amber-200">
              {recoveryState.consistency.issues.slice(0, 2).join(" | ")}
            </p>
          ) : null}
        </article>
      ) : null}

      {lockState.locked ? (
        <article className="glass-panel rounded-2xl p-4 md:p-5">
          <h2 className="text-lg font-semibold">Unlock Protected Controls</h2>
          <p className="mt-1 text-sm text-white/70">
            Critical actions are locked to prevent accidental live-event disruptions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Enter operator PIN"
              className="min-h-12 flex-1 rounded-xl border border-white/20 bg-white/5 px-4 text-sm"
            />
            <button
              onClick={() => void unlockOperatorFromSheet()}
              disabled={isBusy}
              className="min-h-12 rounded-xl border border-purple-300/40 bg-purple-500/10 px-5 text-sm font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/20 disabled:opacity-60"
            >
              Unlock
            </button>
          </div>
          <p className="mt-2 text-xs text-white/60">
            Unlock is temporary and auto-relocks after inactivity.
          </p>
        </article>
      ) : null}

      <article className="glass-panel rounded-2xl p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Event Overview</h2>
          <button
            onClick={() => void fetchState()}
            disabled={isBusy}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <p className="text-xs uppercase tracking-widest text-white/60">Event</p>
            <select
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-sm"
            >
              <option value="">Select event</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.event_name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-white/75">{selectedEvent?.event_type ?? "No event selected"}</p>
          </div>
          <Metric label="Runtime Duration" value={runtimeDuration} />
          <Metric label="Crowd Energy" value={`${crowdEnergy}%`} />
          <Metric label="AI Confidence" value={`${aiConfidence}%`} />
          <Metric label="Current Phase" value={session?.current_phase ?? "warmup"} />
          <Metric label="Vibe" value={simpleVibe} />
        </div>
      </article>

      <article className="glass-panel rounded-2xl p-4 md:p-5">
        <h2 className="mb-3 text-lg font-semibold">Live Playback</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Current Track" value={playback?.track?.name ?? session?.active_track ?? "No track"} />
          <Metric label="Next Suggested Track" value={nextSuggestedTrack} />
          <Metric label="Active Device" value={activeDevice} />
          <Metric label="Playback State" value={playback?.isPlaying ? "Playing" : "Paused"} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <TouchButton onClick={() => void callApi("/api/spotify/playback/play")} label="Play" busy={isBusy} />
          <TouchButton onClick={() => void callApi("/api/spotify/playback/pause")} label="Pause" busy={isBusy} />
          <TouchButton onClick={() => void callApi("/api/spotify/playback/skip")} label="Skip" busy={isBusy} />
          <TouchButton
            onClick={() =>
              void runProtectedAction("device_switch", async () => {
                const target = devices.find((device) => !device.is_active)?.id ?? devices[0]?.id;
                if (!target) {
                  setErrorMessage("No alternate Spotify device found.");
                  return;
                }
                await callApi("/api/spotify/device/select", "POST", { deviceId: target, play: true });
              })
            }
            label="Switch Device"
            busy={isBusy}
            severity={PROTECTED_ACTIONS.device_switch.severity}
          />
          <TouchButton
            onClick={() =>
              void callApi("/api/spotify/playback/volume", "POST", {
                volumePercent: clamp((playback?.device?.volumePercent ?? 45) + 10, 0, 100),
              })
            }
            label="Volume +"
            busy={isBusy}
          />
          <TouchButton
            onClick={() =>
              void callApi("/api/spotify/playback/volume", "POST", {
                volumePercent: clamp((playback?.device?.volumePercent ?? 45) - 10, 0, 100),
              })
            }
            label="Volume -"
            busy={isBusy}
          />
        </div>
      </article>

      <article className="glass-panel rounded-2xl p-4 md:p-5">
        <h2 className="mb-3 text-lg font-semibold">AI DJ Controls</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <TouchButton
            onClick={() =>
              void callApi("/api/autonomous-loop/start", "POST", {
                supervisionMode: "assisted_autonomous",
                intervalMs: operatorMode === "guided" ? 12000 : 9000,
              })
            }
            label="Start AI Mode"
            busy={isBusy}
            primary
          />
          <TouchButton
            onClick={() => void callApi("/api/autonomous-loop/stop")}
            label="Pause AI Decisions"
            busy={isBusy}
          />
          <TouchButton
            onClick={() => void adjustEnergy(1, "Operator energy increase")}
            label="Increase Energy"
            busy={isBusy}
          />
          <TouchButton
            onClick={() => void adjustEnergy(-1, "Operator energy decrease")}
            label="Decrease Energy"
            busy={isBusy}
          />
          <TouchButton
            onClick={() =>
              session
                ? void callApi("/api/dj-session/update", "POST", {
                    sessionId: session.id,
                    action: "ai_decision",
                    aiDecision: "Hold current vibe lane for stability",
                  })
                : void startGuidedEvent()
            }
            label="Hold Current Vibe"
            busy={isBusy}
          />
          <TouchButton
            onClick={() =>
              void runProtectedAction("emergency_cooldown", async () => {
                if (!session) {
                  await startGuidedEvent();
                  return;
                }
                await callApi("/api/dj-session/update", "POST", {
                  sessionId: session.id,
                  action: "phase_change",
                  phase: "cooldown",
                  aiDecision: "Emergency cooldown initiated by operator",
                });
              })
            }
            label="Emergency Cooldown"
            busy={isBusy}
            severity={PROTECTED_ACTIONS.emergency_cooldown.severity}
            danger
          />
        </div>
      </article>

      <article className="glass-panel rounded-2xl p-4 md:p-5">
        <h2 className="mb-3 text-lg font-semibold">Crowd Intelligence</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Crowd Trend" value={session?.crowd_momentum ?? "steady"} />
          <Metric label="Engagement" value={`${runtime?.signalSummary?.audioEngagement?.toFixed?.(1) ?? "0"}%`} />
          <Metric label="AI Reco Confidence" value={`${aiConfidence}%`} />
          <Metric label="Simple Vibe Meter" value={simpleVibe} />
        </div>
      </article>

      <article className="glass-panel rounded-2xl p-4 md:p-5">
        <h2 className="mb-3 text-lg font-semibold">Safety Controls</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TouchButton
            onClick={() => {
              void runProtectedAction("runtime_reset", async () => {
                if (!session) {
                  await startGuidedEvent();
                  return;
                }
                await callApi("/api/autonomous-loop/stop");
                await callApi("/api/dj-session/update", "POST", {
                  sessionId: session.id,
                  action: "pause",
                });
                await callApi("/api/dj-session/update", "POST", {
                  sessionId: session.id,
                  action: "phase_change",
                  phase: "warmup",
                  aiDecision: "Runtime reset to warmup lane by operator",
                });
              });
            }}
            label="Manual Override / Reset"
            busy={isBusy}
            severity={PROTECTED_ACTIONS.runtime_reset.severity}
          />
          <TouchButton
            onClick={() =>
              void runProtectedAction("stop_autonomous_mode", async () => {
                await callApi("/api/autonomous-loop/stop");
              })
            }
            label="Stop Autonomous Mode"
            busy={isBusy}
            severity={PROTECTED_ACTIONS.stop_autonomous_mode.severity}
          />
          <TouchButton
            onClick={() =>
              void runProtectedAction("fallback_safe_mode", async () => {
                if (!session) {
                  await startGuidedEvent();
                  return;
                }
                await callApi("/api/dj-session/update", "POST", {
                  sessionId: session.id,
                  action: "fallback_event",
                  fallbackReason: "Operator requested fallback safe mode",
                });
              })
            }
            label="Fallback Safe Mode"
            busy={isBusy}
            severity={PROTECTED_ACTIONS.fallback_safe_mode.severity}
          />
          <TouchButton
            onClick={() =>
              void runProtectedAction("spotify_reconnect", async () => {
                window.location.href = "/api/spotify/connect";
              })
            }
            label="Reconnect Spotify"
            busy={isBusy}
            severity={PROTECTED_ACTIONS.spotify_reconnect.severity}
          />
        </div>
      </article>
      {sheetAction ? (
        <ProtectedActionSheet
          locked={lockState.locked}
          action={PROTECTED_ACTIONS[sheetAction]}
          pin={pin}
          setPin={setPin}
          busy={isBusy}
          confirmMode={sheetConfirmOpen}
          onClose={() => {
            setSheetAction(null);
            setSheetIntent(null);
            setSheetConfirmOpen(false);
          }}
          onUnlock={() => void unlockOperatorFromSheet()}
          onConfirm={async () => {
            if (sheetIntent) {
              const intent = sheetIntent;
              setSheetAction(null);
              setSheetIntent(null);
              setSheetConfirmOpen(false);
              await intent();
            }
          }}
        />
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-widest text-white/60">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function TouchButton({
  onClick,
  label,
  busy,
  severity,
  primary,
  danger,
}: {
  onClick: () => void;
  label: string;
  busy: boolean;
  severity?: "medium" | "high" | "critical";
  primary?: boolean;
  danger?: boolean;
}) {
  const base =
    "min-h-12 rounded-xl px-4 py-3 text-sm font-semibold uppercase tracking-wider transition disabled:opacity-60";
  const tone = danger
    ? "border border-red-300/40 text-red-200 hover:bg-red-500/10"
    : primary
      ? "border border-purple-300/40 bg-purple-500/10 text-purple-100 hover:bg-purple-500/20"
      : "border border-white/20 hover:bg-white/10";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`${base} ${tone}`}
    >
      {label}
      {severity ? ` (${severity})` : ""}
    </button>
  );
}

function ProtectedActionSheet({
  locked,
  action,
  pin,
  setPin,
  busy,
  confirmMode,
  onClose,
  onUnlock,
  onConfirm,
}: {
  locked: boolean;
  action: ProtectedActionMeta;
  pin: string;
  setPin: (value: string) => void;
  busy: boolean;
  confirmMode: boolean;
  onClose: () => void;
  onUnlock: () => void;
  onConfirm: () => void;
}) {
  const severityTone =
    action.severity === "critical"
      ? "border-red-300/40 bg-red-500/10 text-red-100"
      : action.severity === "high"
        ? "border-amber-300/40 bg-amber-500/10 text-amber-100"
        : "border-sky-300/40 bg-sky-500/10 text-sky-100";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-md animate-fade-up rounded-2xl border border-white/15 bg-[#0b0b10] p-4 shadow-2xl md:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-lg font-semibold">{action.title}</p>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${severityTone}`}>
            {action.severity}
          </span>
        </div>
        <p className="text-sm text-white/80">{action.impact}</p>
        <p className="mt-2 text-xs text-white/60">{action.whyLocked}</p>

        {locked ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-white/70">Unlock required</p>
            <div className="flex gap-2">
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                type="password"
                inputMode="numeric"
                placeholder="Operator PIN"
                className="min-h-12 flex-1 rounded-xl border border-white/20 bg-white/5 px-3 text-sm"
              />
              <button
                onClick={onUnlock}
                disabled={busy}
                className="min-h-12 rounded-xl border border-purple-300/40 bg-purple-500/10 px-4 text-xs font-semibold uppercase tracking-wider text-purple-100 disabled:opacity-60"
              >
                Unlock
              </button>
            </div>
          </div>
        ) : confirmMode ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85">
            Confirm execution of this protected action.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            Unlocked. Action can be executed safely.
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-white/20 px-3 text-sm font-semibold uppercase tracking-wider hover:bg-white/10"
          >
            Close
          </button>
          {!locked ? (
            <button
              onClick={onConfirm}
              disabled={busy}
              className="min-h-11 flex-1 rounded-xl border border-purple-300/40 bg-purple-500/10 px-3 text-sm font-semibold uppercase tracking-wider text-purple-100 disabled:opacity-60"
            >
              Confirm Action
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

