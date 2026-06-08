import "server-only";

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";
import {
  SpotifyAudioFeatures,
  SpotifyConnectionRecord,
  SpotifyPlaylist,
  SpotifyProfile,
  SpotifyRecommendation,
  SpotifySearchItem,
  SpotifySearchType,
} from "@/lib/spotify/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export type SpotifyTransportAuthState = "healthy" | "refreshing" | "degraded" | "expired";

export type SpotifyTransportAuthContinuityState = {
  transportAuthState: SpotifyTransportAuthState;
  accessTokenExpiresAt: number | null;
  lastSuccessfulRefreshAt: number | null;
  refreshFailureCount: number;
  authRecoveryReasoning: string[];
};

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const transportAuthContinuityStore = new Map<string, SpotifyTransportAuthContinuityState>();

function getSpotifyConfig() {
  const env = getServerEnv();
  return {
    clientId: env.spotifyClientId,
    clientSecret: env.spotifyClientSecret,
    redirectUri: env.spotifyRedirectUri,
  };
}

function deriveEncryptionKey() {
  const secret = getServerEnv().spotifyTokenEncryptionSecret;
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(value: string) {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptToken(value: string) {
  const key = deriveEncryptionKey();
  const [ivBase64, tagBase64, encryptedBase64] = value.split(".");
  if (!ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Invalid encrypted token format.");
  }
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveExpiresAtMs(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isSpotifyUnauthorizedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("(401)") || /access token expired/i.test(message);
}

type SpotifyApiRequestParams = {
  accessToken: string;
  path: string;
  options?: RequestInit;
  expectJson?: boolean;
  errorPrefix?: string;
};

async function spotifyApiRequest<T>(params: SpotifyApiRequestParams): Promise<T> {
  const errorPrefix = params.errorPrefix ?? "Spotify API";
  const expectJson = params.expectJson ?? true;

  const execute = async () => {
    const response = await fetch(`${SPOTIFY_API_BASE}${params.path}`, {
      ...params.options,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
        ...(params.options?.headers ?? {}),
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      await wait(retryAfter * 1000);
      throw new Error(`${errorPrefix} rate limit hit; retrying.`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${errorPrefix} error (${response.status}): ${text}`);
    }

    if (!expectJson) {
      return undefined as T;
    }

    return (await response.json()) as T;
  };

  try {
    return await execute();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("rate limit hit; retrying.")) {
      return execute();
    }
    throw error;
  }
}

/** OAuth callback profile fetch — uses a freshly issued access token, not userId auth. */
async function spotifyFetch<T>(accessToken: string, path: string, options?: RequestInit): Promise<T> {
  return spotifyApiRequest<T>({ accessToken, path, options, expectJson: true, errorPrefix: "Spotify API" });
}

export type SpotifyAuthenticatedFetchParams = {
  userId: string;
  path: string;
  options?: RequestInit;
  expectJson?: boolean;
  errorPrefix?: string;
};

export async function spotifyAuthenticatedFetch<T>(params: SpotifyAuthenticatedFetchParams): Promise<T> {
  const requestParams = {
    path: params.path,
    options: params.options,
    expectJson: params.expectJson,
    errorPrefix: params.errorPrefix,
  };

  let accessToken = await getValidSpotifyAccessToken(params.userId);

  try {
    return await spotifyApiRequest<T>({ accessToken, ...requestParams });
  } catch (error) {
    if (!isSpotifyUnauthorizedError(error)) {
      throw error;
    }

    console.warn("[SPOTIFY AUTH] reactive 401 recovery triggered", {
      userId: params.userId,
      path: params.path,
    });

    try {
      console.log("[SPOTIFY AUTH] token refresh attempted", {
        userId: params.userId,
        reason: "reactive_401",
        path: params.path,
      });
      accessToken = await forceRefreshSpotifyAccessToken(params.userId);
      console.log("[SPOTIFY AUTH] token refresh succeeded", {
        userId: params.userId,
        reason: "reactive_401",
        path: params.path,
      });
      return await spotifyApiRequest<T>({ accessToken, ...requestParams });
    } catch (refreshError) {
      console.error("[SPOTIFY AUTH] token refresh failed", {
        userId: params.userId,
        reason: "reactive_401",
        path: params.path,
        error: refreshError instanceof Error ? refreshError.message : String(refreshError),
      });
      throw refreshError;
    }
  }
}

function appendAuthReasoning(existing: string[], next: string) {
  return [...existing.slice(-7), next];
}

function getDefaultTransportAuthContinuityState(): SpotifyTransportAuthContinuityState {
  return {
    transportAuthState: "healthy",
    accessTokenExpiresAt: null,
    lastSuccessfulRefreshAt: null,
    refreshFailureCount: 0,
    authRecoveryReasoning: ["Spotify transport auth continuity initialized."],
  };
}

export function getSpotifyTransportAuthContinuityState(userId: string): SpotifyTransportAuthContinuityState {
  return transportAuthContinuityStore.get(userId) ?? getDefaultTransportAuthContinuityState();
}

type EnsureSpotifyTransportAuthParams = {
  userId: string;
  minValidityMs?: number;
  forceRefresh?: boolean;
  runtimeTickActive?: boolean;
  supervisedExecutionActive?: boolean;
  deviceHealthy?: boolean;
  reason?: string;
};

export async function ensureSpotifyTransportAuth(params: EnsureSpotifyTransportAuthParams) {
  const minValidityMs = params.minValidityMs ?? 90_000;
  const continuity = getSpotifyTransportAuthContinuityState(params.userId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spotify_connections")
    .select("*")
    .eq("user_id", params.userId)
    .maybeSingle();
  if (error) {
    const degraded: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "degraded",
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Auth refresh failed while loading connection record.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, degraded);
    return { ok: false, accessToken: null, state: degraded };
  }
  if (!data) {
    const expired: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "expired",
      accessTokenExpiresAt: null,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Execution blocked due to auth expiry or missing Spotify connection.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, expired);
    return { ok: false, accessToken: null, state: expired };
  }
  const connection = data as SpotifyConnectionRecord;
  const now = Date.now();
  const expiresAtMs = resolveExpiresAtMs(connection.expires_at);
  const expiresAtInvalid = expiresAtMs === null;
  let accessToken: string;
  let refreshToken: string | null = null;
  try {
    accessToken = decryptToken(connection.access_token);
    const decryptedRefresh = connection.refresh_token ? decryptToken(connection.refresh_token) : null;
    refreshToken = decryptedRefresh?.trim() ? decryptedRefresh : null;
  } catch {
    const degraded: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "degraded",
      accessTokenExpiresAt: expiresAtMs,
      refreshFailureCount: continuity.refreshFailureCount + 1,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Auth refresh failed because token decryption failed.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, degraded);
    return { ok: false, accessToken: null, state: degraded };
  }
  if (expiresAtInvalid) {
    console.warn("[SPOTIFY AUTH] invalid expires_at detected; forcing refresh path", {
      userId: params.userId,
      expiresAt: connection.expires_at,
    });
  }
  const expiresSoon =
    expiresAtInvalid || (expiresAtMs !== null && now + minValidityMs >= expiresAtMs);
  const shouldRefresh = Boolean(params.forceRefresh) || expiresSoon;
  const canProactivelyRefresh =
    Boolean(params.runtimeTickActive) || Boolean(params.supervisedExecutionActive) || Boolean(params.reason);
  if (!shouldRefresh || !canProactivelyRefresh) {
    const healthy: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: "healthy",
      accessTokenExpiresAt: expiresAtMs,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Auth healthy; proactive refresh not required.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, healthy);
    return { ok: true, accessToken, state: healthy };
  }
  if (!refreshToken) {
    const expired: SpotifyTransportAuthContinuityState = {
      ...continuity,
      transportAuthState: expiresAtInvalid || (expiresAtMs !== null && expiresAtMs <= now) ? "expired" : "degraded",
      accessTokenExpiresAt: expiresAtMs,
      refreshFailureCount: continuity.refreshFailureCount + 1,
      authRecoveryReasoning: appendAuthReasoning(
        continuity.authRecoveryReasoning,
        "Execution blocked due to auth expiry: refresh token missing.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, expired);
    return { ok: false, accessToken: null, state: expired };
  }
  const refreshing: SpotifyTransportAuthContinuityState = {
    ...continuity,
    transportAuthState: "refreshing",
    accessTokenExpiresAt: expiresAtMs,
    authRecoveryReasoning: appendAuthReasoning(
      continuity.authRecoveryReasoning,
      "Refreshing Spotify auth proactively for supervised continuity.",
    ),
  };
  transportAuthContinuityStore.set(params.userId, refreshing);
  try {
    console.log("[SPOTIFY AUTH] token refresh attempted", {
      userId: params.userId,
      reason: params.reason ?? "proactive",
      forceRefresh: Boolean(params.forceRefresh),
      expiresAtInvalid,
    });
    const refreshed = await refreshSpotifyToken(refreshToken);
    accessToken = refreshed.access_token;
    const newRefreshToken = refreshed.refresh_token ?? refreshToken;
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    const { error: updateError } = await supabase
      .from("spotify_connections")
      .update({
        access_token: encryptToken(accessToken),
        refresh_token: encryptToken(newRefreshToken),
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", params.userId);
    if (updateError) throw new Error(updateError.message);
    const healthy: SpotifyTransportAuthContinuityState = {
      ...refreshing,
      transportAuthState: "healthy",
      accessTokenExpiresAt: new Date(newExpiresAt).getTime(),
      lastSuccessfulRefreshAt: Date.now(),
      refreshFailureCount: 0,
      authRecoveryReasoning: appendAuthReasoning(
        refreshing.authRecoveryReasoning,
        params.runtimeTickActive
          ? "Runtime preserved auth continuity with proactive refresh."
          : "Auth refreshed proactively.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, healthy);
    console.log("[SPOTIFY AUTH] token refresh succeeded", {
      userId: params.userId,
      reason: params.reason ?? "proactive",
      forceRefresh: Boolean(params.forceRefresh),
    });
    return { ok: true, accessToken, state: healthy };
  } catch (refreshError) {
    console.error("[SPOTIFY AUTH] token refresh failed", {
      userId: params.userId,
      reason: params.reason ?? "proactive",
      forceRefresh: Boolean(params.forceRefresh),
      error: refreshError instanceof Error ? refreshError.message : String(refreshError),
    });
    const failed: SpotifyTransportAuthContinuityState = {
      ...refreshing,
      transportAuthState: expiresAtInvalid || (expiresAtMs !== null && expiresAtMs <= now) ? "expired" : "degraded",
      refreshFailureCount: continuity.refreshFailureCount + 1,
      authRecoveryReasoning: appendAuthReasoning(
        refreshing.authRecoveryReasoning,
        "Auth refresh failed; execution blocked due to auth continuity degradation.",
      ),
    };
    transportAuthContinuityStore.set(params.userId, failed);
    return { ok: false, accessToken: null, state: failed };
  }
}

export function getSpotifyConnectUrl(state: string) {
  const { clientId, redirectUri } = getSpotifyConfig();
  const scopes = [
    "user-read-email",
    "playlist-read-private",
    "user-library-read",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "streaming",
  ].join(" ");

  const url = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getSpotifyConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Spotify token exchange failed (${response.status}).`);
  }
  return (await response.json()) as SpotifyTokenResponse;
}

export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const { clientId, clientSecret } = getSpotifyConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Spotify token refresh failed (${response.status}).`);
  }
  return (await response.json()) as SpotifyTokenResponse;
}

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const data = await spotifyFetch<{ id: string; display_name: string }>(accessToken, "/me");
  return {
    id: data.id,
    display_name: data.display_name ?? "Spotify User",
  };
}

export async function upsertSpotifyConnection(params: {
  userId: string;
  profile: SpotifyProfile;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}) {
  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(Date.now() + params.expiresInSeconds * 1000).toISOString();
  const { error } = await supabase.from("spotify_connections").upsert(
    {
      user_id: params.userId,
      spotify_user_id: params.profile.id,
      display_name: params.profile.display_name,
      access_token: encryptToken(params.accessToken),
      refresh_token: encryptToken(params.refreshToken),
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id",
    },
  );
  if (error) throw new Error(error.message);
}

export async function removeSpotifyConnection(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("spotify_connections").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function getValidSpotifyAccessToken(userId: string) {
  const auth = await ensureSpotifyTransportAuth({
    userId,
    minValidityMs: 90_000,
    reason: "general_access_token_validation",
  });
  if (!auth.ok || !auth.accessToken) {
    throw new Error("Spotify auth continuity degraded.");
  }
  return auth.accessToken;
}

export async function forceRefreshSpotifyAccessToken(userId: string) {
  const auth = await ensureSpotifyTransportAuth({
    userId,
    forceRefresh: true,
    minValidityMs: 0,
    reason: "forced_refresh",
  });
  if (!auth.ok || !auth.accessToken) {
    throw new Error("Spotify forced refresh failed.");
  }
  return auth.accessToken;
}

/** Spotify playlist item count ref (Feb 2026 `items`; legacy `tracks`). */
type SpotifyPlaylistCountRef = {
  href?: string;
  total?: number;
};

/** Partial playlist object from GET /me/playlists. */
type SpotifyPlaylistListItem = {
  id?: string | null;
  name?: string | null;
  items?: SpotifyPlaylistCountRef | null;
  tracks?: SpotifyPlaylistCountRef | null;
};

type SpotifyUserPlaylistsResponse = {
  items?: Array<SpotifyPlaylistListItem | null> | null;
};

function resolvePlaylistTracksCount(item: SpotifyPlaylistListItem): number {
  const fromItems = item.items?.total;
  if (typeof fromItems === "number" && Number.isFinite(fromItems)) {
    return Math.max(0, Math.floor(fromItems));
  }
  const fromTracks = item.tracks?.total;
  if (typeof fromTracks === "number" && Number.isFinite(fromTracks)) {
    return Math.max(0, Math.floor(fromTracks));
  }
  return 0;
}

function mapSpotifyPlaylistItem(
  item: SpotifyPlaylistListItem | null | undefined,
): SpotifyPlaylist | null {
  if (!item || typeof item.id !== "string" || !item.id.trim()) return null;
  if (typeof item.name !== "string" || !item.name.trim()) return null;
  try {
    return {
      id: item.id,
      name: item.name,
      tracksCount: resolvePlaylistTracksCount(item),
    };
  } catch {
    return null;
  }
}

export async function getSpotifyPlaylists(userId: string): Promise<SpotifyPlaylist[]> {
  const data = await spotifyAuthenticatedFetch<SpotifyUserPlaylistsResponse>({
    userId,
    path: "/me/playlists?limit=20",
  });

  const playlists: SpotifyPlaylist[] = [];
  for (const item of data.items ?? []) {
    const mapped = mapSpotifyPlaylistItem(item);
    if (mapped) playlists.push(mapped);
  }
  return playlists;
}

export async function getSpotifyLikedSongs(userId: string) {
  const data = await spotifyAuthenticatedFetch<{
    items: Array<{ track: { id: string; name: string; artists: Array<{ name: string }> } }>;
  }>({
    userId,
    path: "/me/tracks?limit=20",
  });
  return data.items.map((item) => ({
    id: item.track.id,
    name: item.track.name,
    artistName: item.track.artists[0]?.name ?? "Unknown Artist",
  }));
}

export async function searchSpotify(
  userId: string,
  query: string,
  type: SpotifySearchType,
): Promise<SpotifySearchItem[]> {
  const encoded = encodeURIComponent(query);

  const data = await spotifyAuthenticatedFetch<{
    tracks?: {
      items: Array<{
        id: string;
        name: string;
        artists?: Array<{ name: string }>;
      }>;
    };

    artists?: {
      items: Array<{
        id: string;
        name: string;
      }>;
    };

    playlists?: {
      items: Array<{
        id: string;
        name: string;
      }>;
    };
  }>({
    userId,
    path: `/search?q=${encoded}&type=${type}&limit=10`,
  });

  if (type === "track") {
    return (data.tracks?.items ?? [])
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: "track" as const,
        artistName:
          item.artists?.[0]?.name ??
          "Unknown Artist",
      }));
  }

  if (type === "artist") {
    return (data.artists?.items ?? [])
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: "artist" as const,
      }));
  }

  return (data.playlists?.items ?? [])
    .filter((item) => item && item.id && item.name)
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: "playlist" as const,
    }));
}

export async function getSpotifyAudioFeatures(
  userId: string,
  trackIds: string[],
): Promise<SpotifyAudioFeatures[]> {
  const ids = trackIds.slice(0, 50).join(",");
  const data = await spotifyAuthenticatedFetch<{
    audio_features: Array<{
      id: string;
      tempo: number;
      energy: number;
      danceability: number;
      valence: number;
      speechiness: number;
      acousticness: number;
      instrumentalness: number;
      key: number;
      mode: 0 | 1;
    }>;
  }>({
    userId,
    path: `/audio-features?ids=${ids}`,
  });
  return (data.audio_features ?? []).filter(Boolean);
}

export async function getSpotifyRecommendations(params: {
  userId: string;
  seedTracks?: string[];
  seedArtists?: string[];
  seedGenres?: string[];
  targetEnergy?: number;
}): Promise<SpotifyRecommendation[]> {
  const query = new URLSearchParams();
  if (params.seedTracks?.length) query.set("seed_tracks", params.seedTracks.slice(0, 5).join(","));
  if (params.seedArtists?.length) query.set("seed_artists", params.seedArtists.slice(0, 5).join(","));
  if (params.seedGenres?.length) query.set("seed_genres", params.seedGenres.slice(0, 5).join(","));
  if (typeof params.targetEnergy === "number") {
    query.set("target_energy", String(Math.min(1, Math.max(0, params.targetEnergy / 10))));
  }
  query.set("limit", "20");

  const data = await spotifyAuthenticatedFetch<{
    tracks: Array<{ id: string; name: string; artists: Array<{ name: string }> }>;
  }>({
    userId: params.userId,
    path: `/recommendations?${query.toString()}`,
  });
  return (data.tracks ?? []).map((track) => ({
    id: track.id,
    name: track.name,
    artistName: track.artists[0]?.name ?? "Unknown Artist",
  }));
}

export async function getSpotifyConnectionStatus(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spotify_connections")
    .select("spotify_user_id,display_name,connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function readSpotifyCache(userId: string, cacheKey: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("spotify_cache")
    .select("payload,expires_at")
    .eq("user_id", userId)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.payload;
}

export async function writeSpotifyCache(params: {
  userId: string;
  cacheKey: string;
  cacheType: "playlists" | "search" | "recommendations" | "liked_songs";
  payload: unknown;
  ttlSeconds: number;
}) {
  const supabase = await createSupabaseServerClient();
  const expiresAt = new Date(Date.now() + params.ttlSeconds * 1000).toISOString();
  const { error } = await supabase.from("spotify_cache").upsert(
    {
      user_id: params.userId,
      cache_key: params.cacheKey,
      cache_type: params.cacheType,
      payload: params.payload,
      expires_at: expiresAt,
    },
    { onConflict: "user_id,cache_key" },
  );
  if (error) throw new Error(error.message);
}

