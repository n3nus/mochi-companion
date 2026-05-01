export type CareAction = 'feed' | 'play' | 'comfort' | 'rest' | 'observe' | 'ignore';

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

export interface GameState {
  version: 1;
  pet: PetState;
  story: StoryState;
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
