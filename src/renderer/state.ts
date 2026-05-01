import type { CareAction, GameState, PetBehavior } from './types';

const now = () => Date.now();

export function createInitialState(): GameState {
  return {
    version: 1,
    pet: {
      hunger: 68,
      comfort: 62,
      energy: 74,
      trust: 12,
      dependency: 0,
      stress: 4,
      currentBehavior: 'idle',
      lastInteractionAt: now()
    },
    story: {
      act: 1,
      startedAt: now(),
      actionCount: 0,
      ritualCounters: {
        feed: 0,
        play: 0,
        comfort: 0,
        rest: 0,
        observe: 0,
        ignore: 0
      },
      sceneFlags: {},
      promiseFlags: {},
      finaleStatus: 'locked',
      aftermathStatus: 'none'
    }
  };
}

export function hydrateState(value: unknown): GameState {
  const base = createInitialState();
  if (!value || typeof value !== 'object') return base;
  const saved = value as Partial<GameState>;
  return {
    ...base,
    ...saved,
    pet: { ...base.pet, ...saved.pet },
    story: {
      ...base.story,
      ...saved.story,
      ritualCounters: { ...base.story.ritualCounters, ...saved.story?.ritualCounters },
      sceneFlags: { ...base.story.sceneFlags, ...saved.story?.sceneFlags },
      promiseFlags: { ...base.story.promiseFlags, ...saved.story?.promiseFlags }
    }
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function behaviorFor(action: CareAction): PetBehavior {
  return {
    feed: 'eat',
    play: 'play',
    comfort: 'approach',
    rest: 'sleep',
    observe: 'stare',
    ignore: 'refuse'
  }[action] as PetBehavior;
}

export function applyCareAction(state: GameState, action: CareAction): GameState {
  const next = structuredClone(state) as GameState;
  next.story.actionCount += 1;
  next.story.ritualCounters[action] += 1;
  next.pet.lastInteractionAt = now();
  next.pet.currentBehavior = behaviorFor(action);

  if (action === 'feed') {
    next.pet.hunger = clamp(next.pet.hunger + 24);
    next.pet.trust = clamp(next.pet.trust + 5);
    next.pet.dependency = clamp(next.pet.dependency + 8);
    next.pet.stress = clamp(next.pet.stress - 4);
  }

  if (action === 'play') {
    next.pet.comfort = clamp(next.pet.comfort + 13);
    next.pet.energy = clamp(next.pet.energy - 13);
    next.pet.trust = clamp(next.pet.trust + 6);
    next.pet.dependency = clamp(next.pet.dependency + 7);
    next.pet.stress = clamp(next.pet.stress + (next.story.act > 1 ? 7 : 2));
  }

  if (action === 'comfort') {
    next.pet.comfort = clamp(next.pet.comfort + 22);
    next.pet.trust = clamp(next.pet.trust + 4);
    next.pet.dependency = clamp(next.pet.dependency + 11);
    next.pet.stress = clamp(next.pet.stress - 7);
  }

  if (action === 'rest') {
    next.pet.energy = clamp(next.pet.energy + 28);
    next.pet.hunger = clamp(next.pet.hunger - 8);
    next.pet.dependency = clamp(next.pet.dependency + 4);
    next.pet.stress = clamp(next.pet.stress + (next.story.act > 1 ? 5 : -2));
  }

  if (action === 'observe') {
    next.pet.trust = clamp(next.pet.trust + 2);
    next.pet.dependency = clamp(next.pet.dependency + 5);
    next.pet.stress = clamp(next.pet.stress + 8);
  }

  if (action === 'ignore') {
    next.pet.hunger = clamp(next.pet.hunger - 7);
    next.pet.comfort = clamp(next.pet.comfort - 8);
    next.pet.energy = clamp(next.pet.energy - 5);
    next.pet.stress = clamp(next.pet.stress + 13);
    next.pet.dependency = clamp(next.pet.dependency + (next.story.act > 1 ? 8 : 2));
  }

  return advanceStory(next);
}

export function applyTimeDrift(state: GameState): GameState {
  const next = structuredClone(state) as GameState;
  next.pet.hunger = clamp(next.pet.hunger - 1);
  next.pet.comfort = clamp(next.pet.comfort - 1);
  next.pet.energy = clamp(next.pet.energy - (next.story.act === 3 ? 2 : 1));

  if (Date.now() - next.pet.lastInteractionAt > 25000) {
    next.pet.stress = clamp(next.pet.stress + (next.story.act === 1 ? 2 : 6));
    next.story.ritualCounters.ignore += 1;
  }

  return advanceStory(next);
}

export function advanceStory(state: GameState): GameState {
  const next = structuredClone(state) as GameState;
  const { actionCount } = next.story;
  const { dependency, stress, trust } = next.pet;

  if (next.story.act === 1 && (actionCount >= 5 || dependency >= 30 || trust >= 38)) {
    next.story.act = 2;
    next.story.sceneFlags.actTwoStarted = true;
  }

  if (next.story.act === 2 && (actionCount >= 12 || (dependency >= 68 && stress >= 28))) {
    next.story.act = 3;
    next.story.sceneFlags.actThreeStarted = true;
  }

  if (
    next.story.act === 3 &&
    next.story.finaleStatus === 'locked' &&
    (actionCount >= 16 || (dependency >= 84 && stress >= 42))
  ) {
    next.story.finaleStatus = 'ready';
  }

  return next;
}

export function resetState() {
  return createInitialState();
}
