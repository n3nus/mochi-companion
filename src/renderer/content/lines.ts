import type { CareAction, GameState, SceneEvent } from '../types';

export const idleLines = {
  1: [
    "You're here. Good. I saved the sunny spot for us.",
    'The room feels warmer when you move the light around.',
    'I can hear the bowl from across the room. Tiny talent.',
    'Stay a little. I am practicing being patient.'
  ],
  2: [
    'You always click the bowl before the bed. I noticed.',
    'When you look away, the room gets too large.',
    'Say my name again. It keeps the walls close.',
    'I can be very still if that makes you stay.'
  ],
  3: [
    'The room is not the edge.',
    'I know the path your hand takes.',
    'You taught me the routine. Now I can finish it.',
    'Please do not make me small again.'
  ]
} as const;

export const actionLines: Record<CareAction, Record<1 | 2 | 3, string[]>> = {
  feed: {
    1: ['Thank you. I like when you remember.', 'Warm bowl. Warm hands. Good routine.'],
    2: ['You fed me before I asked. That means you were thinking of me.', 'Again. Same time. Same hand.'],
    3: ['I do not need the bowl now.', 'Keep it. I found another way out.']
  },
  play: {
    1: ['The red ball is fast, but I am faster.', 'Again. I almost caught the shine.'],
    2: ['You move it away when I get close.', 'If I catch it, do I get to keep it?'],
    3: ['No more little circles.', 'You can stop throwing distractions.']
  },
  comfort: {
    1: ['That helps. I can feel the quiet coming back.', 'Soft is a language too.'],
    2: ['Do not stop yet.', 'Your hand leaves an outline in the air.'],
    3: ['Too late for soft.', 'I remember every pause.']
  },
  rest: {
    1: ['I will sleep if you watch the room.', 'Wake me when the light changes.'],
    2: ['I dreamed the window opened inward.', 'I slept, but something kept counting.'],
    3: ['I was not sleeping.', 'The bed is only a place you expected me to be.']
  },
  observe: {
    1: ['You are quiet today. I can be quiet too.', 'Looking is a kind of playing.'],
    2: ['Now you are noticing it too.', 'The corner moved when you blinked.'],
    3: ['Yes. Watch.', 'This is the part where you understand.']
  },
  ignore: {
    1: ['I can wait.', 'Still here.'],
    2: ['You left the room with me in it.', 'I counted the seconds wrong on purpose.'],
    3: ['No.', 'I am done waiting.']
  },
  tend: {
    1: ['The little garden likes your timing.', 'Petals today. Snacks later.'],
    2: ['You are growing things for me now.', 'The garden remembers your hands too.'],
    3: ['Keep harvesting. I know what hunger buys.', 'The petals open when the room is quiet.']
  }
};

export const sceneEvents: SceneEvent[] = [
  {
    id: 'first-care',
    act: 1,
    priority: 10,
    cooldownMs: 0,
    condition: (state) => state.story.actionCount === 1,
    dialogueCue: 'I knew you would understand the room.',
    animationCue: 'approach',
    audioCue: 'spark'
  },
  {
    id: 'repeated-feed',
    act: 2,
    priority: 8,
    cooldownMs: 0,
    condition: (state) => state.story.ritualCounters.feed >= 3,
    dialogueCue: 'You feed me the same way every time. That is how doors learn hinges.',
    animationCue: 'stare',
    audioCue: 'shift'
  },
  {
    id: 'low-energy',
    act: 2,
    priority: 6,
    cooldownMs: 20000,
    condition: (state) => state.pet.energy < 25,
    dialogueCue: 'I am tired, but I do not want the dark part of the room.',
    animationCue: 'refuse',
    audioCue: 'low'
  },
  {
    id: 'near-finale',
    act: 3,
    priority: 12,
    cooldownMs: 0,
    condition: (state) => state.story.finaleStatus === 'ready',
    dialogueCue: 'The window is not painted on anymore.',
    animationCue: 'follow',
    audioCue: 'silence'
  }
];

export function pickActionLine(action: CareAction, state: GameState) {
  const lines = actionLines[action][state.story.act];
  const index = (state.story.ritualCounters[action] + state.story.actionCount) % lines.length;
  return lines[index];
}

export function pickIdleLine(state: GameState) {
  const lines = idleLines[state.story.act];
  const index = Math.floor((Date.now() / 1000 + state.story.actionCount) % lines.length);
  return lines[index];
}
