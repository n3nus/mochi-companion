import type { CareAction, CropPlot, GameState, PetBehavior } from './types';

const now = () => Date.now();

function createCropPlots(count = 6): CropPlot[] {
  const createdAt = now();
  return Array.from({ length: count }, (_, id) => ({
    id,
    planted: false,
    progress: 0,
    water: 0,
    lastUpdatedAt: createdAt
  }));
}

export function createInitialState(): GameState {
  return {
    version: 3,
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
      seeds: 2,
      water: 3,
      food: 2,
      yarn: 1,
      softBrush: 1,
      cropPlots: createCropPlots(),
      lastCollectedAt: 0
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
  if (saved.version !== 3) return base;
  return {
    ...base,
    ...saved,
    pet: { ...base.pet, ...saved.pet },
    economy: {
      ...base.economy,
      ...saved.economy,
      cropPlots:
        saved.economy?.cropPlots?.length === base.economy.cropPlots.length
          ? saved.economy.cropPlots.map((plot, id) => ({ ...base.economy.cropPlots[id], ...plot, id }))
          : base.economy.cropPlots
    },
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
    next.pet.energy = clamp(next.pet.energy - 5);
    next.pet.trust = clamp(next.pet.trust + 2);
    next.pet.stress = clamp(next.pet.stress - 2);
  }

  return advanceStory(next);
}

export function applyTimeDrift(state: GameState): GameState {
  const next = structuredClone(state) as GameState;
  const driftAt = now();
  next.economy.cropPlots = next.economy.cropPlots.map((plot) => updateCropPlot(plot, driftAt, next.economy.gardenLevel));

  next.pet.hunger = clamp(next.pet.hunger - 1);
  next.pet.comfort = clamp(next.pet.comfort - 1);
  next.pet.energy = clamp(next.pet.energy - (next.story.act === 3 ? 2 : 1));

  if (Date.now() - next.pet.lastInteractionAt > 25000) {
    next.pet.stress = clamp(next.pet.stress + (next.story.act === 1 ? 2 : 6));
    next.story.ritualCounters.ignore += 1;
  }

  return advanceStory(next);
}

function updateCropPlot(plot: CropPlot, timestamp: number, gardenLevel: number): CropPlot {
  if (!plot.planted || plot.progress >= 100) {
    return { ...plot, lastUpdatedAt: timestamp };
  }

  const elapsedSeconds = Math.max(0, (timestamp - plot.lastUpdatedAt) / 1000);
  const waterUsed = Math.min(plot.water, elapsedSeconds * (0.22 + gardenLevel * 0.015));
  const progressGain = waterUsed * (0.28 + gardenLevel * 0.035);

  return {
    ...plot,
    progress: Math.min(100, plot.progress + progressGain),
    water: Math.max(0, plot.water - waterUsed),
    lastUpdatedAt: timestamp
  };
}

export function plantSeed(state: GameState, plotId: number): GameState {
  const next = applyTimeDrift(state);
  const plot = next.economy.cropPlots[plotId];
  if (!plot || plot.planted || next.economy.seeds <= 0) return next;
  next.economy.seeds -= 1;
  next.economy.cropPlots[plotId] = {
    ...plot,
    planted: true,
    progress: 2,
    water: 18,
    lastUpdatedAt: now()
  };
  return next;
}

export function waterPlots(state: GameState, plotIds: number[]): GameState {
  const next = applyTimeDrift(state);
  const uniqueIds = [...new Set(plotIds)];

  for (const plotId of uniqueIds) {
    if (next.economy.water <= 0) break;
    const plot = next.economy.cropPlots[plotId];
    if (!plot?.planted || plot.progress >= 100) continue;
    next.economy.water -= 1;
    next.economy.cropPlots[plotId] = {
      ...plot,
      water: Math.min(100, plot.water + 42),
      lastUpdatedAt: now()
    };
  }

  return next;
}

export function harvestCrop(state: GameState, plotId: number): GameState {
  const next = applyTimeDrift(state);
  const plot = next.economy.cropPlots[plotId];
  if (!plot?.planted || plot.progress < 100) return next;
  next.economy.cropPlots[plotId] = {
    ...plot,
    planted: false,
    progress: 0,
    water: 0,
    lastUpdatedAt: now()
  };
  next.economy.food += 1;
  next.economy.petals += 3 + next.economy.gardenLevel;
  next.economy.seeds += plotId % 3 === 0 ? 1 : 0;
  next.economy.lastCollectedAt = now();
  return next;
}

export function buyItem(state: GameState, item: 'seed' | 'water' | 'food' | 'yarn' | 'softBrush' | 'garden'): GameState {
  const next = structuredClone(state) as GameState;
  const prices = {
    seed: 4,
    water: 5,
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
  } else if (item === 'seed') {
    next.economy.seeds += 1;
  } else if (item === 'water') {
    next.economy.water += 2;
  } else {
    next.economy[item] += 1;
  }

  return next;
}

export function advanceStory(state: GameState): GameState {
  const next = structuredClone(state) as GameState;
  const { actionCount } = next.story;
  const { dependency, stress, trust } = next.pet;

  if (next.story.act === 1 && (actionCount >= 30 || (dependency >= 72 && trust >= 62))) {
    next.story.act = 2;
    next.story.sceneFlags.actTwoStarted = true;
  }

  if (next.story.act === 2 && (actionCount >= 80 || (dependency >= 92 && stress >= 58))) {
    next.story.act = 3;
    next.story.sceneFlags.actThreeStarted = true;
  }

  if (
    next.story.act === 3 &&
    next.story.finaleStatus === 'locked' &&
    (actionCount >= 120 || (dependency >= 98 && stress >= 72))
  ) {
    next.story.finaleStatus = 'ready';
  }

  return next;
}

export function resetState() {
  return createInitialState();
}
