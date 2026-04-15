export interface PlayerState {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffering: boolean;
  error: string | null;
  ready: boolean;
}

export interface PlayerCallbacks {
  onStateChange?: (state: PlayerState) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export type PlayerBackend = "avplay" | "html5";

export function createInitialPlayerState(): PlayerState {
  return {
    playing: false,
    currentTime: 0,
    duration: 0,
    buffering: true,
    error: null,
    ready: false,
  };
}
