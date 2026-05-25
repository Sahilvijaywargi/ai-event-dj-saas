"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  announceMiniSheetOpen,
  lockBodyScroll,
  subscribeMiniSheetOpen,
  unlockBodyScroll,
} from "@/app/ui/mini-sheet";

export type ReliabilityMiniState = {
  connectionQuality: "good" | "degraded" | "offline";
  spotifySyncHealth: "synced" | "degraded" | "desynced";
  heartbeat: {
    alive: boolean;
    stale: boolean;
    staleMs?: number;
    lastHeartbeatAt: string | null;
  };
  reconnectInProgress: boolean;
  isRecovering?: boolean;
  recoverySuggestions: string[];
  pollingBackoffMs: number;
  playbackDesyncDetected?: boolean;
  staleStateDetected?: boolean;
};

type ReliabilityMiniPillProps = {
  reliability: ReliabilityMiniState | null;
  onReconnect: () => void;
  onResync: () => void;
  busy?: boolean;
};

function formatAge(lastHeartbeatAt: string | null) {
  if (!lastHeartbeatAt) return "n/a";
  const delta = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (delta < 1000) return "<1s";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s`;
  return `${Math.floor(delta / 60_000)}m`;
}

export function ReliabilityMiniPill({
  reliability,
  onReconnect,
  onResync,
  busy = false,
}: ReliabilityMiniPillProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reopenGuardUntilRef = useRef(0);

  const status = useMemo(() => {
    if (!reliability) return "degraded" as const;
    if (
      reliability.connectionQuality === "offline" ||
      reliability.spotifySyncHealth === "desynced" ||
      reliability.heartbeat.stale
    ) {
      return "critical" as const;
    }
    if (
      reliability.connectionQuality === "degraded" ||
      reliability.spotifySyncHealth === "degraded" ||
      reliability.reconnectInProgress ||
      reliability.pollingBackoffMs > 9000
    ) {
      return "degraded" as const;
    }
    return "healthy" as const;
  }, [reliability]);

  const pillTone =
    status === "healthy"
      ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-100"
      : status === "degraded"
        ? "border-amber-300/40 bg-amber-500/10 text-amber-100"
        : "border-red-300/40 bg-red-500/10 text-red-100";

  const closeSheet = useCallback(() => {
    if (!open) return;
    reopenGuardUntilRef.current = Date.now() + 160;
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimerRef.current = null;
    }, 170);
  }, [open]);

  const toggleSheet = useCallback(() => {
    if (open) {
      closeSheet();
      return;
    }
    if (Date.now() < reopenGuardUntilRef.current) return;
    setOpen(true);
    setClosing(false);
    announceMiniSheetOpen("reliability-mini-pill");
  }, [closeSheet, open]);

  useEffect(() => subscribeMiniSheetOpen("reliability-mini-pill", closeSheet), [closeSheet]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeSheet();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSheet();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      unlockBodyScroll();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSheet, open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => panelRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggleSheet}
        className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-wider transition hover:opacity-90 ${pillTone}`}
        aria-expanded={open}
        aria-controls="reliability-mini-sheet"
      >
        {status}
        <span className="ml-2 text-[10px] normal-case opacity-85">
          hb {formatAge(reliability?.heartbeat.lastHeartbeatAt ?? null)}
        </span>
      </button>

      {open ? (
        <div
          className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm transition-opacity duration-150 md:items-center ${
            closing ? "opacity-0" : "opacity-100"
          }`}
        >
          <div
            ref={panelRef}
            id="reliability-mini-sheet"
            role="dialog"
            aria-label="Runtime reliability details"
            tabIndex={-1}
            className={`w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b10] p-4 shadow-2xl transition-all duration-150 md:p-5 ${
              closing ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-base font-semibold">Runtime Reliability</p>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${pillTone}`}>
                {status}
              </span>
            </div>
            <div className="space-y-1 text-sm text-white/80">
              <p>Heartbeat age: {formatAge(reliability?.heartbeat.lastHeartbeatAt ?? null)}</p>
              <p>Spotify sync: {reliability?.spotifySyncHealth ?? "unknown"}</p>
              <p>Reconnect: {reliability?.reconnectInProgress ? "in progress" : "idle"}</p>
              <p>Polling backoff: {reliability?.pollingBackoffMs ?? 6500}ms</p>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/75">
              {(reliability?.recoverySuggestions ?? ["No suggestion right now."])
                .slice(0, 2)
                .map((item) => (
                  <p key={item}>- {item}</p>
                ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  onReconnect();
                  closeSheet();
                }}
                disabled={busy}
                className="min-h-10 flex-1 rounded-xl border border-white/20 px-3 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
              >
                Reconnect
              </button>
              <button
                onClick={() => {
                  onResync();
                  closeSheet();
                }}
                disabled={busy}
                className="min-h-10 flex-1 rounded-xl border border-white/20 px-3 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
              >
                Resync
              </button>
            </div>

            <button
              onClick={closeSheet}
              className="mt-3 min-h-10 w-full rounded-xl border border-purple-300/40 bg-purple-500/10 px-3 text-xs font-semibold uppercase tracking-wider text-purple-100 hover:bg-purple-500/20"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

