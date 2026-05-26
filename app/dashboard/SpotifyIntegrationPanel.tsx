"use client";

import { FormEvent, useState } from "react";

type Playlist = {
  id: string;
  name: string;
  tracksCount: number;
};

type SearchResult = {
  id: string;
  name: string;
  type: "track" | "artist" | "playlist";
  artistName?: string;
};

type SpotifyIntegrationPanelProps = {
  initialConnected: boolean;
  initialAccountName: string | null;
  initialPlaylists: Playlist[];
};

export function SpotifyIntegrationPanel({
  initialConnected,
  initialAccountName,
  initialPlaylists,
}: SpotifyIntegrationPanelProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [accountName, setAccountName] = useState(initialAccountName);
  const [playlists, setPlaylists] = useState<Playlist[]>(initialPlaylists);

  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");

  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<
    "track" | "artist" | "playlist"
  >("track");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // DEVICE HOOKS
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  function connectSpotify() {
    window.location.href = "/api/spotify/connect";
  }

  async function disconnectSpotify() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/spotify/disconnect", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to disconnect.");
      }

      setConnected(false);
      setAccountName(null);
      setPlaylists([]);
      setResults([]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to disconnect.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function syncPlaylists() {
    setSyncStatus("syncing");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/spotify/playlists");

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to sync playlists.");
      }

      setConnected(Boolean(data.connected));
      setAccountName(data.account?.display_name ?? null);
      setPlaylists(data.playlists ?? []);

      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to sync playlists.",
      );
    }
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault();

    if (!query.trim()) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/spotify/search?q=${encodeURIComponent(
          query,
        )}&type=${searchType}`,
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? "Search failed.");
      }

      setResults(data.results ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Search failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  const loadDevices = async () => {
    try {
      setDevicesLoading(true);
      setDeviceError(null);

      const response = await fetch("/api/spotify/devices");

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load devices.");
      }

      setDevices(data.devices || []);

      const activeDevice = (data.devices || []).find(
        (device: any) => device.is_active,
      );

      if (activeDevice) {
        setSelectedDeviceId(activeDevice.id);
      }
    } catch (error) {
      setDeviceError(
        error instanceof Error
          ? error.message
          : "Failed to load devices.",
      );
    } finally {
      setDevicesLoading(false);
    }
  };

  return (
    <article
      id="spotify"
      className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">
            Spotify Integration
          </h2>

          <p className="mt-1 text-sm text-white/65">
            Secure account connection and music intelligence sync.
          </p>
        </div>

        <div className="flex gap-2">
          {!connected ? (
            <button
              onClick={connectSpotify}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-black hover:bg-purple-100"
            >
              Connect Spotify
            </button>
          ) : (
            <>
              <button
                onClick={syncPlaylists}
                disabled={syncStatus === "syncing"}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-white/10 disabled:opacity-60"
              >
                {syncStatus === "syncing" ? "Syncing..." : "Sync"}
              </button>

              <button
                onClick={loadDevices}
                disabled={devicesLoading}
                className="rounded-full border border-blue-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-blue-200 hover:bg-blue-500/10 disabled:opacity-60"
              >
                {devicesLoading ? "Loading..." : "Devices"}
              </button>

              <button
                onClick={disconnectSpotify}
                disabled={loading}
                className="rounded-full border border-red-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-red-200 hover:bg-red-500/10 disabled:opacity-60"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {deviceError ? (
        <p className="mb-4 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {deviceError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">
            Connection
          </p>

          <p className="mt-1 font-semibold">
            {connected ? "Connected" : "Not connected"}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">
            Account
          </p>

          <p className="mt-1 font-semibold">{accountName ?? "-"}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">
            Playlist Count
          </p>

          <p className="mt-1 font-semibold">{playlists.length}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-3">
          <p className="text-xs uppercase tracking-widest text-white/60">
            Sync Status
          </p>

          <p className="mt-1 font-semibold">{syncStatus}</p>
        </div>
      </div>

      {devices.length > 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/35 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/70">
            Spotify Devices
          </h3>

          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="">Select Device</option>

            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.is_active ? " (Active)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {connected ? (
        <>
          <form
            onSubmit={runSearch}
            className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Quick search tracks, artists, playlists"
              className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
            />

            <select
              value={searchType}
              onChange={(event) =>
                setSearchType(
                  event.target.value as "track" | "artist" | "playlist",
                )
              }
              className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm"
            >
              <option value="track">Track</option>
              <option value="artist">Artist</option>
              <option value="playlist">Playlist</option>
            </select>

            <button
              type="submit"
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Search
            </button>
          </form>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">
                Playlists
              </p>

              <ul className="mt-2 space-y-1 text-sm text-white/85">
                {playlists.slice(0, 8).map((playlist) => (
                  <li key={playlist.id}>
                    {playlist.name} ({playlist.tracksCount})
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/35 p-3">
              <p className="text-xs uppercase tracking-widest text-white/60">
                Search Results
              </p>

              <ul className="mt-2 space-y-1 text-sm text-white/85">
                {results.slice(0, 8).map((result) => (
                  <li key={result.id}>
                    {result.name}
                    {result.artistName
                      ? ` - ${result.artistName}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : null}
    </article>
  );
}