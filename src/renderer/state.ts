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
    economy: {
      petals: 12,
      gardenLevel: 1,
      uncollectedPetals: 0,
      food: 2,
      yarn: 1,
      softBrush: 1,
      lastYieldAt: now()
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
        ignore: 0,
        tend: 0
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
    economy: { ...base.economy, ...saved.economy },
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
    ignore: 'refuse',
    tend: 'approach'
  }[action] as PetBehavior;
}

export function applyCareAction(state: GameState, action: CareAction): GameState {
  const next = structuredClone(state) as GameState;
  next.story.actionCount += 1;
  next.story.ritualCounters[action] += 1;
  next.pet.lastInteractionAt = now();
  next.pet.currentBehavior = behaviorFor(action);

  if (action === 'feed') {
    next.economy.food = Math.max(0, next.economy.food - 1);
    next.pet.hunger = clamp(next.pet.hunger + 24);
    next.pet.trust = clamp(next.pet.trust + 5);
    next.pet.dependency = clamp(next.pet.dependency + 8);
    next.pet.stress = clamp(next.pet.stress - 4);
  }

  if (action === 'play') {
    next.economy.yarn = Math.max(0, next.economy.yarn - 1);
    next.pet.comfort = clamp(next.pet.comfort + 13);
    next.pet.energy = clamp(next.pet.energy - 13);
    next.pet.trust = clamp(next.pet.trust + 6);
    next.pet.dependency = clamp(next.pet.dependency + 7);
    next.pet.stress = clamp(next.pet.stress + (next.story.act > 1 ? 7 : 2));
  }

  if (action === 'comfort') {
    next.economy.softBrush = Math.max(0, next.economy.softBrush - 1);
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

  if (action === 'tend') {
    const earned = 4 + next.economy.gardenLevel * 2;
    next.economy.petals += earned;
    next.pet.energy = clamp(next.pet.energy - 5);
    next.pet.trust = clamp(next.pet.trust + 2);
    next.pet.stress = clamp(next.pet.stress - 2);
  }

  return advanceStory(next);
}

export function applyTimeDrift(state: GameState): GameState {
  const next = structuredClone(state) as GameState;
  const elapsed = Math.max(0, Date.now() - next.economy.lastYieldAt);
  const yieldTicks = Math.floor(elapsed / 10000);

  if (yieldTicks > 0) {
    const cap = 20 + next.economy.gardenLevel * 12;
    next.economy.uncollectedPetals = Math.min(
      cap,
      next.economy.uncollectedPetals + yieldTicks * (1 + next.economy.gardenLevel)
    );
    next.economy.lastYieldAt += yieldTicks * 10000;
  }

  next.pet.hunger = clamp(next.pet.hunger - 1);
  next.pet.comfort = clamp(next.pet.comfort - 1);
  next.pet.energy = clamp(next.pet.energy - (next.story.act === 3 ? 2 : 1));

  if (Date.now() - next.pet.lastInteractionAt > 25000) {
    next.pet.stress = clamp(next.pet.stress + (next.story.act === 1 ? 2 : 6));
    next.story.ritualCounters.ignore += 1;
  }

  return advanceStory(next);
}

export function collectYield(state: GameState): GameState {
  const next = applyTimeDrift(state);
  next.economy.petals += next.economy.uncollectedPetals;
  next.economy.uncollectedPetals = 0;
  return next;
}

export function buyItem(state: GameState, item: 'food' | 'yarn' | 'softBrush' | 'garden'): GameState {
  const next = structuredClone(state) as GameState;
  const prices = {
    food: 6,
    yarn: 8,
    softBrush: 10,
    garden: 18 + next.economy.gardenLevel * 10
  };
  const price = prices[item];
  if (next.economy.petals < price) return next;
  next.economy.petals -= price;

  if (item === 'garden') {
    next.economy.gardenLevel += 1;
  } else {
    next.economy[item] += 1;
  }

  return next;
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
