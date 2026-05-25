"use client";

const MINI_SHEET_OPEN_EVENT = "ai-event-dj:mini-sheet-open";

let bodyLockCount = 0;
let previousOverflow = "";
let previousTouchAction = "";

export function announceMiniSheetOpen(id: string) {
  window.dispatchEvent(new CustomEvent(MINI_SHEET_OPEN_EVENT, { detail: { id } }));
}

export function subscribeMiniSheetOpen(id: string, onOtherSheetOpen: () => void) {
  function onOpen(event: Event) {
    const detail = (event as CustomEvent<{ id?: string }>).detail;
    if (!detail?.id || detail.id === id) return;
    onOtherSheetOpen();
  }
  window.addEventListener(MINI_SHEET_OPEN_EVENT, onOpen as EventListener);
  return () => window.removeEventListener(MINI_SHEET_OPEN_EVENT, onOpen as EventListener);
}

export function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (bodyLockCount === 0) {
    previousOverflow = document.body.style.overflow;
    previousTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
  }
  bodyLockCount += 1;
}

export function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = previousOverflow;
    document.body.style.touchAction = previousTouchAction;
  }
}

