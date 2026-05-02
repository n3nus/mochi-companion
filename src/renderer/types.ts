export type CareAction = 'feed' | 'play' | 'comfort' | 'rest' | 'observe' | 'ignore' | 'tend';
export type RoomId = 'room' | 'garden';
export type MemoryKind = 'session' | 'absence' | 'window' | 'routine' | 'room' | 'garden' | 'overlay';

export type PetBehavior =
  | 'idle'
  | 'approach'
  | 'eat'
  | 'play'
  | 'sleep'
  | 'refuse'
  | 'stare'
  | 'follow'
  | 'exit';

export interface PetState {
  hunger: number;
  comfort: number;
  energy: number;
  trust: number;
  dependency: number;
  stress: number;
  currentBehavior: PetBehavior;
  lastInteractionAt: number;
}

export interface StoryState {
  act: 1 | 2 | 3;
  startedAt: number;
  actionCount: number;
  ritualCounters: Record<CareAction, number>;
  sceneFlags: Record<string, boolean>;
  promiseFlags: Record<string, boolean>;
  finaleStatus: 'locked' | 'ready' | 'running' | 'complete';
  aftermathStatus: 'none' | 'returned';
}

export interface EconomyState {
  petals: number;
  gardenLevel: number;
  seeds: number;
  water: number;
  food: number;
  yarn: number;
  softBrush: number;
  cropPlots: CropPlot[];
  lastCollectedAt: number;
}

export interface CropPlot {
  id: number;
  planted: boolean;
  progress: number;
  water: number;
  lastUpdatedAt: number;
}

export interface PlayerProfile {
  displayName: string;
  nameConfirmed: boolean;
}

export interface RoutineSignals {
  sessionStartedAt: number;
  lastTickAt: number;
  appOpenSeconds: number;
  focusedSeconds: number;
  awaySeconds: number;
  longestAwaySeconds: number;
  currentAwayStartedAt: number;
  roomSeconds: Record<RoomId, number>;
  actionCounts: Record<CareAction, number>;
  favoriteAction: CareAction | null;
}

export interface MemoryEvent {
  id: string;
  kind: MemoryKind;
  text: string;
  createdAt: number;
  emotionalWeight: number;
  recalled: number;
}

export interface MemoryPatterns {
  sessionCount: number;
  lastSeenAt: number;
  longestAbsenceSeconds: number;
  firstActionOfSession: CareAction | null;
  preferredRoom: RoomId | null;
  hasMinimizedMochi: boolean;
  hasSeenOverlay: boolean;
  quickExitCount: number;
  gardenFirstCount: number;
  roomFirstCount: number;
  outsideMentions: number;
}

export interface MemoryState {
  events: MemoryEvent[];
  patterns: MemoryPatterns;
  lastRecalledAt: number;
}

export interface GameState {
  version: 4;
  pet: PetState;
  story: StoryState;
  economy: EconomyState;
  profile: PlayerProfile;
  signals: RoutineSignals;
  memories: MemoryState;
  lastLineId?: string;
}

export interface SceneEvent {
  id: string;
  act: 1 | 2 | 3;
  priority: number;
  cooldownMs: number;
  condition: (state: GameState, action?: CareAction) => boolean;
  dialogueCue: string;
  animationCue: PetBehavior;
  audioCue: 'soft' | 'spark' | 'shift' | 'low' | 'silence';
}
