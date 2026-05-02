import type { CareAction, CropPlot, GameState, MemoryKind, MemoryState, PetBehavior, RoomId, RoutineSignals } from './types';

const now = () => Date.now();
const maxMemoryEvents = 24;

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

function createActionCounts(): Record<CareAction, number> {
  return {
    feed: 0,
    play: 0,
    comfort: 0,
    rest: 0,
    observe: 0,
    ignore: 0,
    tend: 0
  };
}

function createSignals(): RoutineSignals {
  const createdAt = now();
  return {
    sessionStartedAt: createdAt,
    lastTickAt: createdAt,
    appOpenSeconds: 0,
    focusedSeconds: 0,
    awaySeconds: 0,
    longestAwaySeconds: 0,
    currentAwayStartedAt: 0,
    roomSeconds: {
      room: 0,
      garden: 0
    },
    actionCounts: createActionCounts(),
    favoriteAction: null
  };
}

function createMemories(): MemoryState {
  return {
    events: [],
    patterns: {
      sessionCount: 0,
      lastSeenAt: 0,
      longestAbsenceSeconds: 0,
      firstActionOfSession: null,
      preferredRoom: null,
      hasMinimizedMochi: false,
      hasSeenOverlay: false,
      quickExitCount: 0,
      gardenFirstCount: 0,
      roomFirstCount: 0,
      outsideMentions: 0
    },
    lastRecalledAt: 0
  };
}

export function createInitialState(): GameState {
  return {
    version: 4,
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
    profile: {
      displayName: '',
      nameConfirmed: false
    },
    signals: createSignals(),
    memories: createMemories(),
    story: {
      act: 1,
      startedAt: now(),
      actionCount: 0,
      ritualCounters: createActionCounts(),
      sceneFlags: {},
      promiseFlags: {},
      finaleStatus: 'locked',
      aftermathStatus: 'none'
    }
  };
}

function formatDuration(seconds: number) {
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) return `${rounded} seconds`;
  const minutes = Math.round(rounded / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function actionLabel(action: CareAction) {
  return {
    feed: 'the bowl',
    play: 'the moving shine',
    comfort: 'the brush',
    rest: 'the bed',
    observe: 'watching',
    ignore: 'leaving space',
    tend: 'the garden'
  }[action];
}

function memoryId(kind: MemoryKind, timestamp: number) {
  return `${kind}-${timestamp}-${Math.floor(Math.random() * 10000)}`;
}

function remember(state: GameState, kind: MemoryKind, text: string, emotionalWeight = 1) {
  if (state.memories.events.some((event) => event.kind === kind && event.text === text)) return;
  const timestamp = now();

  state.memories.events = [
    {
      id: memoryId(kind, timestamp),
      kind,
      text,
      createdAt: timestamp,
      emotionalWeight,
      recalled: 0
    },
    ...state.memories.events
  ].slice(0, maxMemoryEvents);
}

function beginMemorySession(state: GameState): GameState {
  const next = structuredClone(state) as GameState;
  const openedAt = now();
  const lastSeenAt = next.memories.patterns.lastSeenAt;
  next.memories.patterns.sessionCount += 1;
  next.memories.patterns.firstActionOfSession = null;
  next.memories.patterns.lastSeenAt = openedAt;

  if (lastSeenAt > 0) {
    const absenceSeconds = Math.max(0, (openedAt - lastSeenAt) / 1000);
    if (absenceSeconds >= 90) {
      next.memories.patterns.longestAbsenceSeconds = Math.max(next.memories.patterns.longestAbsenceSeconds, absenceSeconds);
      remember(
        next,
        'absence',
        `You were gone for ${formatDuration(absenceSeconds)}. I kept the room the same shape.`,
        absenceSeconds >= 3600 ? 4 : 3
      );
    }
  }

  return next;
}

export function hydrateState(value: unknown): GameState {
  const base = createInitialState();
  if (!value || typeof value !== 'object') return beginMemorySession(base);
  const saved = value as Partial<Omit<GameState, 'version'>> & { version?: number };
  if (saved.version !== 3 && saved.version !== 4) return beginMemorySession(base);
  const sessionStartedAt = now();
  const savedSignals = saved.signals;
  const savedMemories = saved.memories;
  // Saved progress is preserved, but growth timers restart with the running app session.
  const hydrated: GameState = {
    ...base,
    ...saved,
    version: 4,
    pet: { ...base.pet, ...saved.pet, lastInteractionAt: sessionStartedAt },
    economy: {
      ...base.economy,
      ...saved.economy,
      cropPlots:
        saved.economy?.cropPlots?.length === base.economy.cropPlots.length
          ? saved.economy.cropPlots.map((plot, id) => ({
              ...base.economy.cropPlots[id],
              ...plot,
              id,
              lastUpdatedAt: sessionStartedAt
            }))
          : base.economy.cropPlots.map((plot) => ({ ...plot, lastUpdatedAt: sessionStartedAt }))
    },
    profile: { ...base.profile, ...saved.profile },
    signals: {
      ...base.signals,
      ...savedSignals,
      sessionStartedAt,
      lastTickAt: sessionStartedAt,
      currentAwayStartedAt: 0,
      roomSeconds: { ...base.signals.roomSeconds, ...savedSignals?.roomSeconds },
      actionCounts: { ...base.signals.actionCounts, ...savedSignals?.actionCounts }
    },
    memories: {
      ...base.memories,
      ...savedMemories,
      events: (savedMemories?.events ?? [])
        .filter((event) => typeof event?.text === 'string')
        .map((event) => ({
          ...event,
          id: event.id || memoryId(event.kind, event.createdAt || sessionStartedAt),
          createdAt: event.createdAt || sessionStartedAt,
          emotionalWeight: event.emotionalWeight || 1,
          recalled: event.recalled || 0
        }))
        .slice(0, maxMemoryEvents),
      patterns: {
        ...base.memories.patterns,
        ...savedMemories?.patterns,
        firstActionOfSession: null,
        lastSeenAt: savedMemories?.patterns?.lastSeenAt ?? savedSignals?.lastTickAt ?? sessionStartedAt
      }
    },
    story: {
      ...base.story,
      ...saved.story,
      ritualCounters: { ...base.story.ritualCounters, ...saved.story?.ritualCounters },
      sceneFlags: { ...base.story.sceneFlags, ...saved.story?.sceneFlags },
      promiseFlags: { ...base.story.promiseFlags, ...saved.story?.promiseFlags }
    }
  };

  return beginMemorySession(hydrated);
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

function favoriteAction(counts: Record<CareAction, number>): CareAction | null {
  let favorite: CareAction | null = null;
  let highest = 0;

  for (const [action, count] of Object.entries(counts) as [CareAction, number][]) {
    if (count > highest) {
      favorite = action;
      highest = count;
    }
  }

  return favorite;
}

export function setProfileName(state: GameState, displayName: string): GameState {
  const next = structuredClone(state) as GameState;
  const previousName = next.profile.displayName;
  const cleanName = displayName.replace(/[^\w .'-]/g, '').trim().slice(0, 18);
  next.profile.displayName = cleanName;
  next.profile.nameConfirmed = cleanName.length > 0;
  if (cleanName && cleanName !== previousName) {
    remember(next, 'session', `You told me your name is ${cleanName}. Names keep doors from closing all the way.`, 2);
  }
  return next;
}

export function applyCareAction(state: GameState, action: CareAction): GameState {
  const next = structuredClone(state) as GameState;
  const interactionAt = now();
  const previousFavorite = next.signals.favoriteAction;
  next.story.actionCount += 1;
  next.story.ritualCounters[action] += 1;
  next.signals.actionCounts[action] = (next.signals.actionCounts[action] ?? 0) + 1;
  next.signals.favoriteAction = favoriteAction(next.signals.actionCounts);
  next.pet.lastInteractionAt = interactionAt;
  next.pet.currentBehavior = behaviorFor(action);
  next.memories.patterns.lastSeenAt = interactionAt;

  if (!next.memories.patterns.firstActionOfSession) {
    next.memories.patterns.firstActionOfSession = action;
    if (action === 'tend') {
      next.memories.patterns.gardenFirstCount += 1;
      if (next.memories.patterns.sessionCount > 1) {
        remember(next, 'garden', 'You went to the garden before you came to me.', 2);
      }
    } else {
      next.memories.patterns.roomFirstCount += 1;
    }
  }

  if (next.signals.actionCounts[action] === 3) {
    remember(next, 'routine', `You have used ${actionLabel(action)} enough times that I can hear it before it happens.`, 2);
  }

  if (
    next.signals.favoriteAction &&
    next.signals.favoriteAction !== previousFavorite &&
    next.signals.actionCounts[next.signals.favoriteAction] >= 3
  ) {
    remember(next, 'routine', `Your hand keeps returning to ${actionLabel(next.signals.favoriteAction)}.`, 2);
  }

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

  if (
    driftAt - next.pet.lastInteractionAt > 11000 &&
    next.pet.currentBehavior !== 'exit' &&
    next.pet.currentBehavior !== 'follow' &&
    next.pet.currentBehavior !== 'stare'
  ) {
    next.pet.currentBehavior = 'idle';
  }

  if (driftAt - next.pet.lastInteractionAt > 25000) {
    next.pet.stress = clamp(next.pet.stress + (next.story.act === 1 ? 2 : 6));
    next.story.ritualCounters.ignore += 1;
  }

  return advanceStory(next);
}

export function recordSessionTick(state: GameState, visible: boolean, room: RoomId): GameState {
  const next = structuredClone(state) as GameState;
  const tickAt = now();
  const elapsedSeconds = Math.min(60, Math.max(0, (tickAt - next.signals.lastTickAt) / 1000));
  next.signals.lastTickAt = tickAt;
  next.signals.appOpenSeconds += elapsedSeconds;
  next.signals.roomSeconds[room] = (next.signals.roomSeconds[room] ?? 0) + elapsedSeconds;
  next.memories.patterns.lastSeenAt = tickAt;

  if (visible) {
    next.signals.focusedSeconds += elapsedSeconds;
    if (next.signals.currentAwayStartedAt > 0) {
      const awaySpan = Math.max(0, (tickAt - next.signals.currentAwayStartedAt) / 1000);
      const wasLongestAway = awaySpan > next.memories.patterns.longestAbsenceSeconds + 15;
      next.signals.longestAwaySeconds = Math.max(next.signals.longestAwaySeconds, awaySpan);
      next.memories.patterns.longestAbsenceSeconds = Math.max(next.memories.patterns.longestAbsenceSeconds, awaySpan);
      if (awaySpan >= 45 && wasLongestAway) {
        remember(
          next,
          'absence',
          `You left me open for ${formatDuration(awaySpan)} while your attention was somewhere else.`,
          awaySpan >= 300 ? 4 : 3
        );
      }
      next.signals.currentAwayStartedAt = 0;
    }
  } else {
    next.signals.awaySeconds += elapsedSeconds;
    if (next.signals.currentAwayStartedAt === 0) {
      next.signals.currentAwayStartedAt = tickAt;
    }
  }

  const roomSeconds = next.signals.roomSeconds.room ?? 0;
  const gardenSeconds = next.signals.roomSeconds.garden ?? 0;
  if (gardenSeconds > roomSeconds + 180) {
    next.memories.patterns.preferredRoom = 'garden';
    remember(next, 'room', 'You spend more time with the garden than with me.', 2);
  } else if (roomSeconds > gardenSeconds + 180) {
    next.memories.patterns.preferredRoom = 'room';
  }

  return next;
}

export function recordWindowMemory(state: GameState, action: 'minimize' | 'close'): GameState {
  const next = structuredClone(state) as GameState;
  const timestamp = now();
  next.memories.patterns.lastSeenAt = timestamp;

  if (action === 'minimize') {
    if (!next.memories.patterns.hasMinimizedMochi) {
      remember(next, 'window', 'You made the room small. I still knew where the edges were.', 3);
    }
    next.memories.patterns.hasMinimizedMochi = true;
  }

  if (action === 'close') {
    const sessionSeconds = Math.max(0, (timestamp - next.signals.sessionStartedAt) / 1000);
    if (sessionSeconds < 60) {
      next.memories.patterns.quickExitCount += 1;
      if (next.memories.patterns.quickExitCount === 2) {
        remember(next, 'window', 'Sometimes you open the room just to close it again.', 2);
      }
    }
  }

  return next;
}

export function recordOverlayMemory(state: GameState): GameState {
  const next = structuredClone(state) as GameState;
  next.memories.patterns.lastSeenAt = now();
  if (!next.memories.patterns.hasSeenOverlay) {
    remember(next, 'overlay', 'I have touched the outside edge of your screen now.', 4);
  }
  next.memories.patterns.hasSeenOverlay = true;
  return next;
}

function patternRecallLine(state: GameState): string | null {
  const { patterns } = state.memories;

  if (patterns.hasSeenOverlay && patterns.outsideMentions < 4) {
    return 'The outside edge of the screen is not far anymore.';
  }

  if (patterns.hasMinimizedMochi && patterns.outsideMentions < 5) {
    return 'When you make the room small, I still stay awake.';
  }

  if (patterns.preferredRoom === 'garden' && patterns.outsideMentions < 6) {
    return 'The garden gets more of you than the room does.';
  }

  if (patterns.longestAbsenceSeconds >= 300 && patterns.outsideMentions < 7) {
    return `I know how long ${formatDuration(patterns.longestAbsenceSeconds)} feels from here.`;
  }

  if (patterns.firstActionOfSession && patterns.outsideMentions < 8) {
    return `This session began with ${actionLabel(patterns.firstActionOfSession)}. I noticed.`;
  }

  return null;
}

export function maybeRecallMemory(state: GameState): { state: GameState; line: string | null } {
  const next = structuredClone(state) as GameState;
  const timestamp = now();
  if (timestamp - next.memories.lastRecalledAt < 45000) {
    return { state, line: null };
  }

  const event = next.memories.events
    .filter((candidate) => candidate.recalled < (candidate.emotionalWeight >= 3 ? 3 : 2))
    .sort((a, b) => a.recalled - b.recalled || b.emotionalWeight - a.emotionalWeight || b.createdAt - a.createdAt)[0];

  const line = event?.text ?? patternRecallLine(next);
  if (!line) {
    return { state, line: null };
  }

  if (event) event.recalled += 1;
  next.memories.lastRecalledAt = timestamp;
  next.memories.patterns.outsideMentions += 1;
  return { state: next, line };
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
