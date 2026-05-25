import "server-only";

import { randomUUID, timingSafeEqual } from "node:crypto";

export type OperatorLockSession = {
  userId: string;
  sessionId: string;
  expiresAt: number;
};

export type OperatorLockState = {
  locked: boolean;
  expiresAt: string | null;
  remainingSeconds: number;
};

const OPERATOR_LOCK_COOKIE = "operator_lock_session";
const UNLOCK_TTL_MS = 10 * 60 * 1000;
const LOCK_REGISTRY = new Map<string, OperatorLockSession>();

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function getPin() {
  return process.env.OPERATOR_LOCK_PIN ?? "2580";
}

export function getOperatorLockCookieName() {
  return OPERATOR_LOCK_COOKIE;
}

export function validateOperatorUnlockPin(pin: string) {
  return safeEqual(pin.trim(), getPin());
}

export function createOperatorUnlockSession(userId: string) {
  const session: OperatorLockSession = {
    userId,
    sessionId: randomUUID(),
    expiresAt: Date.now() + UNLOCK_TTL_MS,
  };
  LOCK_REGISTRY.set(userId, session);
  return session;
}

export function lockOperatorSession(userId: string) {
  LOCK_REGISTRY.delete(userId);
}

export function getOperatorLockState(userId: string, cookieSessionId: string | null): OperatorLockState {
  const entry = LOCK_REGISTRY.get(userId);
  if (!entry || !cookieSessionId || entry.sessionId !== cookieSessionId) {
    return { locked: true, expiresAt: null, remainingSeconds: 0 };
  }
  if (Date.now() >= entry.expiresAt) {
    LOCK_REGISTRY.delete(userId);
    return { locked: true, expiresAt: null, remainingSeconds: 0 };
  }
  return {
    locked: false,
    expiresAt: new Date(entry.expiresAt).toISOString(),
    remainingSeconds: Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000)),
  };
}

