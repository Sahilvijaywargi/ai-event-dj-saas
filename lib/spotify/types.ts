export type SpotifyConnectionRecord = {
  id: string;
  user_id: string;
  spotify_user_id: string;
  display_name: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
  updated_at: string;
};

export type SpotifyCacheRecord = {
  id: string;
  user_id: string;
  cache_key: string;
  cache_type: "playlists" | "search" | "recommendations" | "liked_songs";
  payload: unknown;
  expires_at: string;
  created_at: string;
};

export type SpotifyProfile = {
  id: string;
  display_name: string;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  tracksCount: number;
};

export type SpotifySearchType = "track" | "artist" | "playlist";

export type SpotifySearchItem = {
  id: string;
  name: string;
  type: SpotifySearchType;
  artistName?: string;
};

export type SpotifyAudioFeatures = {
  id: string;
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
};

export type SpotifyRecommendation = {
  id: string;
  name: string;
  artistName: string;
};

export type SpotifyDevice = {
  id: string;
  name: string;
  type: string;
  volume_percent: number | null;
  is_active: boolean;
  is_restricted: boolean;
};

export type SpotifyPlaybackTrack = {
  id: string | null;
  name: string;
  artistName: string;
  uri: string | null;
  durationMs: number;
};

export type SpotifyPlaybackState = {
  isPlaying: boolean;
  progressMs: number;
  device: SpotifyDevice | null;
  track: SpotifyPlaybackTrack | null;
  repeatState: string | null;
  shuffleState: boolean;
};

export type PlaybackCommandResult = {
  ok: boolean;
  message: string | null;
};

