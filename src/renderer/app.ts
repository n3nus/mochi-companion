import './styles/main.css';
import { RoomAudio } from './audio';
import { sceneEvents, pickActionLine, pickIdleLine } from './content/lines';
import { CompanionScene, type SceneRoom } from './scene';
import {
  applyCareAction,
  applyTimeDrift,
  buyItem,
  harvestCrop,
  hydrateState,
  maybeRecallMemory,
  plantSeed,
  recordSessionTick,
  recordOverlayMemory,
  recordWindowMemory,
  resetState,
  setProfileName,
  waterPlots
} from './state';
import type { AudioCue } from './audio';
import type { CareAction, GameState, PetBehavior, SceneEvent } from './types';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('Missing app root');

appRoot.innerHTML = `
  <div class="shell">
    <header class="titlebar">
      <div class="brand">
        <span class="mark"></span>
        <span>Mochi</span>
      </div>
      <div class="window-actions">
        <button class="icon-button" id="minimize" aria-label="Minimize">_</button>
        <button class="icon-button close" id="close" aria-label="Close">x</button>
      </div>
    </header>

    <main class="stage">
      <section class="scene-panel">
        <div class="scene-toolbar">
          <div>
            <p class="eyebrow">Room routine</p>
            <h1 id="act-title">Mochi's room</h1>
          </div>
          <div class="toolbar-actions">
            <div class="room-tabs" role="tablist" aria-label="Rooms">
              <button class="room-tab active" data-room="room">Room</button>
              <button class="room-tab" data-room="garden">Garden</button>
            </div>
            <button class="ghost-button" id="reset">Reset</button>
          </div>
        </div>
        <div id="scene-mount"></div>
        <section class="garden-layer hidden" id="garden-layer" aria-label="Garden plots">
          <div class="garden-board" id="garden-board"></div>
          <button class="watering-can" id="watering-can" aria-label="Water crops">
            <span></span>
          </button>
        </section>
        <div class="cat-stage" id="cat-stage" aria-hidden="true">
          <div class="cat-shadow"></div>
          <div class="cat-sprite">
            <div class="cat-tail-css"></div>
            <div class="cat-body-css">
              <span class="body-stripe s1"></span>
              <span class="body-stripe s2"></span>
              <span class="body-stripe s3"></span>
              <div class="cat-leg front"></div>
              <div class="cat-leg back"></div>
              <div class="cat-chest-css"></div>
            </div>
            <div class="cat-head-css">
              <div class="cat-ear-css left"><span></span></div>
              <div class="cat-ear-css right"><span></span></div>
              <span class="head-stripe h1"></span>
              <span class="head-stripe h2"></span>
              <span class="head-stripe h3"></span>
              <div class="cat-eye-css left"></div>
              <div class="cat-eye-css right"></div>
              <div class="cat-muzzle-css"></div>
              <div class="cat-nose-css"></div>
              <span class="whisker w1"></span>
              <span class="whisker w2"></span>
              <span class="whisker w3"></span>
              <span class="whisker w4"></span>
            </div>
          </div>
        </div>
        <section class="challenge-card hidden" id="challenge-card">
          <div class="challenge-header">
            <div>
              <p class="eyebrow" id="challenge-label">Routine</p>
              <h2 id="challenge-title">Prepare</h2>
            </div>
            <button class="icon-button" id="challenge-cancel" aria-label="Cancel routine">x</button>
          </div>
          <p id="challenge-copy" class="challenge-copy"></p>
          <div id="challenge-playfield" class="challenge-playfield"></div>
        </section>
        <div class="scene-hint" id="scene-hint">Click an object in the room, or use a routine below.</div>
      </section>

      <aside class="side-panel">
        <section class="status-card">
          <div class="pet-line">
            <span class="pet-dot"></span>
            <div>
              <p class="eyebrow">Companion state</p>
              <h2 id="behavior">Idle</h2>
            </div>
          </div>
          <div class="meters" id="meters"></div>
          <div class="profile-row">
            <input id="profile-name" maxlength="18" placeholder="Your name" autocomplete="off" />
            <button class="ghost-button" id="profile-save">OK</button>
          </div>
          <div class="memory-row" id="memory-row"></div>
        </section>

        <section class="dialog-card">
          <p class="eyebrow">Mochi says</p>
          <p id="line" class="line">The room is ready.</p>
        </section>

        <section class="routine-grid">
          <button class="routine-button" data-action="feed"><span>Feed</span><small>Bowl</small></button>
          <button class="routine-button" data-action="play"><span>Play</span><small>Ball</small></button>
          <button class="routine-button" data-action="comfort"><span>Comfort</span><small>Brush</small></button>
          <button class="routine-button" data-action="rest"><span>Rest</span><small>Bed</small></button>
          <button class="routine-button wide" data-action="tend"><span>Tend</span><small>Garden</small></button>
        </section>

        <section class="market-card">
          <div class="market-head">
            <div>
              <p class="eyebrow">Pocket</p>
              <h2 id="petals">0 petals</h2>
            </div>
            <button class="ghost-button" id="garden-help">Garden</button>
          </div>
          <div class="inventory-row" id="inventory"></div>
          <div class="shop-grid">
            <button class="shop-button" data-buy="seed">Seed <small>4</small></button>
            <button class="shop-button" data-buy="water">Water <small>5</small></button>
            <button class="shop-button" data-buy="food">Food <small>6</small></button>
            <button class="shop-button" data-buy="yarn">Yarn <small>8</small></button>
            <button class="shop-button" data-buy="softBrush">Brush <small>10</small></button>
            <button class="shop-button" data-buy="garden">Garden <small id="garden-price">28</small></button>
          </div>
        </section>

        <section class="notes-card">
          <p class="eyebrow">Session notes</p>
          <ol id="notes"></ol>
        </section>
      </aside>
    </main>
  </div>
`;

const mount = document.querySelector<HTMLDivElement>('#scene-mount')!;
const lineEl = document.querySelector<HTMLParagraphElement>('#line')!;
const notesEl = document.querySelector<HTMLOListElement>('#notes')!;
const metersEl = document.querySelector<HTMLDivElement>('#meters')!;
const behaviorEl = document.querySelector<HTMLHeadingElement>('#behavior')!;
const actTitleEl = document.querySelector<HTMLHeadingElement>('#act-title')!;
const hintEl = document.querySelector<HTMLDivElement>('#scene-hint')!;
const challengeCard = document.querySelector<HTMLElement>('#challenge-card')!;
const challengeLabel = document.querySelector<HTMLParagraphElement>('#challenge-label')!;
const challengeTitle = document.querySelector<HTMLHeadingElement>('#challenge-title')!;
const challengeCopy = document.querySelector<HTMLParagraphElement>('#challenge-copy')!;
const challengePlayfield = document.querySelector<HTMLDivElement>('#challenge-playfield')!;
const petalsEl = document.querySelector<HTMLHeadingElement>('#petals')!;
const inventoryEl = document.querySelector<HTMLDivElement>('#inventory')!;
const gardenPriceEl = document.querySelector<HTMLSpanElement>('#garden-price')!;
const gardenHelpButton = document.querySelector<HTMLButtonElement>('#garden-help')!;
const gardenLayer = document.querySelector<HTMLElement>('#garden-layer')!;
const gardenBoard = document.querySelector<HTMLDivElement>('#garden-board')!;
const wateringCan = document.querySelector<HTMLButtonElement>('#watering-can')!;
const catStage = document.querySelector<HTMLDivElement>('#cat-stage')!;
const profileNameInput = document.querySelector<HTMLInputElement>('#profile-name')!;
const profileSaveButton = document.querySelector<HTMLButtonElement>('#profile-save')!;
const memoryRowEl = document.querySelector<HTMLDivElement>('#memory-row')!;

const audio = new RoomAudio();
let state = resetState();
let scene: CompanionScene;
let isFinaleRunning = false;
let activeChallenge: CareAction | null = null;
let challengeTimer: number | null = null;
let currentRoom: SceneRoom = 'room';
let catWanderTimer: number | null = null;

function titleForAct(act: 1 | 2 | 3) {
  if (act === 1) return "Mochi's room";
  if (act === 2) return 'The room remembers';
  return 'The open window';
}

function formatBehavior(behavior: PetBehavior) {
  return behavior.charAt(0).toUpperCase() + behavior.slice(1);
}

function compactDuration(seconds: number) {
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.round(rounded / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function memoryActionLabel(action: CareAction) {
  return {
    feed: 'bowl',
    play: 'glint',
    comfort: 'brush',
    rest: 'bed',
    observe: 'watch',
    ignore: 'space',
    tend: 'garden'
  }[action];
}

function renderMemoryChips() {
  const chips: string[] = [];
  if (state.profile.nameConfirmed) chips.push(`Name ${state.profile.displayName}`);
  if (state.signals.favoriteAction) chips.push(`Loop ${memoryActionLabel(state.signals.favoriteAction)}`);
  if (state.memories.patterns.longestAbsenceSeconds >= 45) {
    chips.push(`Away ${compactDuration(state.memories.patterns.longestAbsenceSeconds)}`);
  }
  if (state.memories.patterns.hasMinimizedMochi) chips.push('Small room');
  if (state.memories.patterns.hasSeenOverlay) chips.push('Outside');
  if (state.memories.patterns.preferredRoom === 'garden') chips.push('Garden first');

  if (chips.length === 0) {
    return '<span class="memory-empty">Memory is quiet</span>';
  }

  return chips
    .slice(0, 5)
    .map((chip) => `<span>${chip}</span>`)
    .join('');
}

function meter(label: string, value: number) {
  return `
    <div class="meter">
      <div class="meter-label"><span>${label}</span><strong>${Math.round(value)}</strong></div>
      <div class="meter-track"><div class="meter-fill" style="width:${value}%"></div></div>
    </div>
  `;
}

type ShopItem = 'seed' | 'water' | 'food' | 'yarn' | 'softBrush' | 'garden';

function priceFor(item: ShopItem) {
  if (item === 'garden') return 18 + state.economy.gardenLevel * 10;
  if (item === 'softBrush') return 10;
  if (item === 'yarn') return 8;
  if (item === 'food') return 6;
  if (item === 'water') return 5;
  return 4;
}

function cropLabel(progress: number) {
  if (progress >= 100) return 'ready';
  if (progress >= 58) return 'leaf';
  if (progress >= 24) return 'sprout';
  return 'seed';
}

function renderGarden() {
  gardenLayer.classList.toggle('hidden', currentRoom !== 'garden');
  gardenBoard.innerHTML = state.economy.cropPlots
    .map((plot) => {
      const progress = Math.round(plot.progress);
      const water = Math.round(plot.water);
      const stateClass = !plot.planted ? 'empty' : progress >= 100 ? 'ready' : water <= 0 ? 'dry' : 'growing';
      const label = !plot.planted ? 'empty' : cropLabel(progress);

      return `
        <button class="crop-plot ${stateClass}" data-plot="${plot.id}" aria-label="Garden plot ${plot.id + 1}">
          <span class="crop-soil"></span>
          <span class="crop-plant" style="--growth:${Math.max(4, progress)}%"></span>
          <span class="crop-meta">${label}</span>
          <span class="crop-bars">
            <i style="width:${progress}%"></i>
            <b style="width:${water}%"></b>
          </span>
        </button>
      `;
    })
    .join('');
}

function placeCatForBehavior() {
  const actOffset = state.story.act === 1 ? 0 : state.story.act === 2 ? -2 : 3;
  const positions: Record<PetBehavior, [number, number]> = {
    idle: currentRoom === 'garden' ? [70, 62] : [44, 72],
    approach: currentRoom === 'garden' ? [61, 58] : [42, 64],
    eat: [31, 68],
    play: [57, 86],
    sleep: [69, 62],
    refuse: [34, 82],
    stare: [47, 70],
    follow: [50, 66],
    exit: [76, 74]
  };
  const [left, bottom] = positions[state.pet.currentBehavior];
  catStage.style.left = `${left + actOffset}%`;
  catStage.style.bottom = `${bottom}px`;
}

function wanderCat() {
  if (activeChallenge || isFinaleRunning) return;
  const roomRange = currentRoom === 'garden' ? [58, 78] : [30, 68];
  const left = roomRange[0] + Math.random() * (roomRange[1] - roomRange[0]);
  const bottom = currentRoom === 'garden' ? 54 + Math.random() * 36 : 58 + Math.random() * 42;
  catStage.dataset.walking = 'true';
  catStage.style.left = `${left}%`;
  catStage.style.bottom = `${bottom}px`;
  window.setTimeout(() => {
    catStage.dataset.walking = 'false';
  }, 760);
}

function startCatWander() {
  if (catWanderTimer !== null) window.clearInterval(catWanderTimer);
  catWanderTimer = window.setInterval(wanderCat, 6500);
}

function render() {
  document.body.dataset.act = String(state.story.act);
  document.body.dataset.room = currentRoom;
  catStage.dataset.behavior = state.pet.currentBehavior;
  catStage.dataset.act = String(state.story.act);
  document.body.classList.toggle('after-return', state.story.aftermathStatus === 'returned');
  actTitleEl.textContent = currentRoom === 'garden' ? 'Pocket garden' : titleForAct(state.story.act);
  behaviorEl.textContent = formatBehavior(state.pet.currentBehavior);
  hintEl.textContent =
    state.story.finaleStatus === 'ready'
      ? 'The window is active. Keep following the routine.'
      : state.story.act === 1
        ? currentRoom === 'garden'
          ? 'Tend the garden beds, collect petals, and build supplies for the room.'
          : 'Care happens here. Supplies come from the garden.'
        : currentRoom === 'garden'
          ? 'The garden is quiet. It should stay separate from the room.'
          : 'Mochi notices repeated routines.';

  metersEl.innerHTML = [
    meter('Hunger', state.pet.hunger),
    meter('Comfort', state.pet.comfort),
    meter('Energy', state.pet.energy),
    meter('Trust', state.pet.trust),
    meter('Attachment', state.pet.dependency),
    meter('Tension', state.pet.stress)
  ].join('');
  if (document.activeElement !== profileNameInput) {
    profileNameInput.value = state.profile.displayName;
  }
  memoryRowEl.innerHTML = renderMemoryChips();

  petalsEl.textContent = `${state.economy.petals} petals`;
  inventoryEl.innerHTML = `
    <span>Seeds ${state.economy.seeds}</span>
    <span>Water ${state.economy.water}</span>
    <span>Food ${state.economy.food}</span>
    <span>Yarn ${state.economy.yarn}</span>
    <span>Brush ${state.economy.softBrush}</span>
    <span>Garden Lv.${state.economy.gardenLevel}</span>
  `;
  const readyCrops = state.economy.cropPlots.filter((plot) => plot.planted && plot.progress >= 100).length;
  gardenHelpButton.textContent = readyCrops > 0 ? `${readyCrops} ready` : 'Garden';
  gardenPriceEl.textContent = String(18 + state.economy.gardenLevel * 10);
  document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((button) => {
    const item = button.dataset.buy as ShopItem;
    const price = priceFor(item);
    button.disabled = state.economy.petals < price;
  });

  placeCatForBehavior();
  renderGarden();
  scene?.setState(state);
  scene?.setRoom(currentRoom);
  document.querySelectorAll<HTMLButtonElement>('[data-room]').forEach((button) => {
    button.classList.toggle('active', button.dataset.room === currentRoom);
  });
}

function setActiveButton(action: CareAction | null) {
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.classList.toggle('active', button.dataset.action === action);
  });
}

function addNote(text: string) {
  const item = document.createElement('li');
  item.textContent = text;
  notesEl.prepend(item);
  while (notesEl.children.length > 5) notesEl.lastElementChild?.remove();
}

function say(text: string, cue: AudioCue = 'soft') {
  lineEl.textContent = text;
  audio.cue(cue);
}

function findSceneEvent(action?: CareAction): SceneEvent | undefined {
  return sceneEvents
    .filter((event) => event.act <= state.story.act)
    .filter((event) => !state.story.sceneFlags[event.id])
    .filter((event) => event.condition(state, action))
    .sort((a, b) => b.priority - a.priority)[0];
}

async function persist() {
  await window.mochi.state.save(state);
}

async function saveProfileName() {
  const previousName = state.profile.displayName;
  state = setProfileName(state, profileNameInput.value);
  if (state.profile.nameConfirmed) {
    say(
      state.profile.displayName === previousName
        ? `I still know your name, ${state.profile.displayName}.`
        : `I will remember ${state.profile.displayName}.`,
      state.story.act === 1 ? 'soft' : 'shift'
    );
  } else {
    say('Names can wait. I can still hear the routine.', 'soft');
  }
  render();
  await persist();
}

async function runRoutine(action: CareAction) {
  if (isFinaleRunning) return;
  await audio.start();

  const previousAct = state.story.act;
  state = applyCareAction(state, action);
  const event = findSceneEvent(action);

  if (event) {
    state.story.sceneFlags[event.id] = true;
    state.pet.currentBehavior = event.animationCue;
    say(event.dialogueCue, event.audioCue);
  } else {
    say(pickActionLine(action, state), state.story.act === 1 ? 'spark' : state.story.act === 2 ? 'shift' : 'low');
  }

  if (state.story.act !== previousAct) {
    addNote(`Act ${state.story.act}: ${titleForAct(state.story.act)}`);
  } else {
    addNote(`${formatBehavior(state.pet.currentBehavior)} after ${action}`);
  }

  render();
  await persist();

  if (state.story.finaleStatus === 'ready' && action === 'observe') {
    void runFinale();
  }
}

function requiredItem(action: CareAction) {
  if (action === 'feed') return state.economy.food > 0 ? null : 'Buy or harvest more food first.';
  if (action === 'play') return state.economy.yarn > 0 ? null : 'Buy yarn first. Mochi will not chase empty hands.';
  if (action === 'comfort') return state.economy.softBrush > 0 ? null : 'Buy a soft brush first.';
  return null;
}

function stopChallengeTimer() {
  if (challengeTimer !== null) {
    window.clearInterval(challengeTimer);
    challengeTimer = null;
  }
}

function clearChallenge() {
  stopChallengeTimer();
  activeChallenge = null;
  setActiveButton(null);
  challengeCard.classList.add('hidden');
  challengePlayfield.innerHTML = '';
}

async function completeChallenge(action: CareAction) {
  clearChallenge();
  await runRoutine(action);
}

function startChallenge(action: CareAction) {
  if (isFinaleRunning) return;
  if (action === 'tend') {
    setRoom('garden');
    say('Plant seeds, drag the watering can over soil, then harvest when a crop is ready.', 'soft');
    return;
  }
  if (currentRoom !== 'room') {
    setRoom('room');
  }
  void audio.start();
  clearChallenge();
  activeChallenge = action;
  setActiveButton(action);
  challengeCard.classList.remove('hidden');
  challengeLabel.textContent = 'Active routine';

  const missing = requiredItem(action);
  if (missing) {
    activeChallenge = null;
    setActiveButton(null);
    challengeCard.classList.add('hidden');
    say(missing, 'low');
    return;
  }

  if (action === 'feed') {
    buildFeedChallenge();
  } else if (action === 'play') {
    buildPlayChallenge();
  } else if (action === 'comfort') {
    buildComfortChallenge();
  } else if (action === 'rest') {
    buildRestChallenge();
  } else {
    buildTendChallenge();
  }
}

function buildFeedChallenge() {
  challengeTitle.textContent = 'Guide the treat';
  challengeCopy.textContent = 'Drag the treat into the bowl without dropping it early.';
  challengePlayfield.innerHTML = `
    <div class="drop-zone" id="drop-zone">bowl</div>
    <button class="treat-token" id="treat-token">treat</button>
  `;

  const token = document.querySelector<HTMLButtonElement>('#treat-token')!;
  const zone = document.querySelector<HTMLDivElement>('#drop-zone')!;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  token.addEventListener('pointerdown', (event) => {
    dragging = true;
    token.setPointerCapture(event.pointerId);
    const rect = token.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    token.classList.add('dragging');
  });

  token.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const field = challengePlayfield.getBoundingClientRect();
    token.style.left = `${event.clientX - field.left - offsetX}px`;
    token.style.top = `${event.clientY - field.top - offsetY}px`;
  });

  token.addEventListener('pointerup', async (event) => {
    if (!dragging) return;
    dragging = false;
    token.releasePointerCapture(event.pointerId);
    token.classList.remove('dragging');
    const tokenRect = token.getBoundingClientRect();
    const zoneRect = zone.getBoundingClientRect();
    const centerX = tokenRect.left + tokenRect.width / 2;
    const centerY = tokenRect.top + tokenRect.height / 2;
    const inside =
      centerX >= zoneRect.left && centerX <= zoneRect.right && centerY >= zoneRect.top && centerY <= zoneRect.bottom;

    if (inside) {
      zone.classList.add('success');
      await completeChallenge('feed');
    } else {
      say('Almost. The bowl is patient. Try again.', 'soft');
      token.style.left = '';
      token.style.top = '';
    }
  });
}

function buildPlayChallenge() {
  challengeTitle.textContent = 'Catch the glint';
  challengeCopy.textContent = 'Click the moving glint four times before Mochi loses interest.';
  challengePlayfield.innerHTML = `
    <div class="score-row"><span id="play-score">0 / 4</span><span id="play-time">8.0</span></div>
    <button class="glint-target" id="glint-target" aria-label="Moving glint"></button>
  `;

  const target = document.querySelector<HTMLButtonElement>('#glint-target')!;
  const scoreEl = document.querySelector<HTMLSpanElement>('#play-score')!;
  const timeEl = document.querySelector<HTMLSpanElement>('#play-time')!;
  let score = 0;
  let remaining = 80;

  function moveTarget() {
    target.style.left = `${12 + Math.random() * 68}%`;
    target.style.top = `${30 + Math.random() * 48}%`;
  }

  target.addEventListener('click', async () => {
    score += 1;
    scoreEl.textContent = `${score} / 4`;
    audio.cue('spark');
    if (score >= 4) {
      await completeChallenge('play');
      return;
    }
    moveTarget();
  });

  challengeTimer = window.setInterval(() => {
    remaining -= 1;
    timeEl.textContent = (remaining / 10).toFixed(1);
    if (remaining <= 0) {
      stopChallengeTimer();
      say('The glint got away. Mochi is watching where it went.', 'shift');
      buildPlayChallenge();
    }
  }, 100);

  moveTarget();
}

function buildComfortChallenge() {
  challengeTitle.textContent = 'Keep steady';
  challengeCopy.textContent = 'Hold gently until the meter fills. Letting go starts it over.';
  challengePlayfield.innerHTML = `
    <button class="hold-pad" id="hold-pad">hold</button>
    <div class="hold-meter"><div id="hold-fill"></div></div>
  `;

  const pad = document.querySelector<HTMLButtonElement>('#hold-pad')!;
  const fill = document.querySelector<HTMLDivElement>('#hold-fill')!;
  let progress = 0;

  function reset() {
    progress = 0;
    fill.style.width = '0%';
    stopChallengeTimer();
  }

  pad.addEventListener('pointerdown', () => {
    reset();
    challengeTimer = window.setInterval(async () => {
      progress += 4;
      fill.style.width = `${progress}%`;
      if (progress >= 100) {
        await completeChallenge('comfort');
      }
    }, 70);
  });

  pad.addEventListener('pointerup', reset);
  pad.addEventListener('pointerleave', reset);
}

function buildRestChallenge() {
  challengeTitle.textContent = 'Settle the room';
  challengeCopy.textContent = 'Click settle while the pulse is inside the quiet band.';
  challengePlayfield.innerHTML = `
    <div class="timing-bar">
      <div class="quiet-band"></div>
      <div class="timing-pulse" id="timing-pulse"></div>
    </div>
    <button class="settle-button" id="settle-button">Settle</button>
  `;

  const pulse = document.querySelector<HTMLDivElement>('#timing-pulse')!;
  const button = document.querySelector<HTMLButtonElement>('#settle-button')!;
  let t = 0;
  let x = 0;

  challengeTimer = window.setInterval(() => {
    t += 0.055;
    x = 50 + Math.sin(t) * 47;
    pulse.style.left = `${x}%`;
  }, 16);

  button.addEventListener('click', async () => {
    if (x >= 42 && x <= 58) {
      await completeChallenge('rest');
      return;
    }

    say('Too sudden. Let the room slow down first.', 'low');
  });
}

function buildTendChallenge() {
  challengeTitle.textContent = 'Tend the garden';
  challengeCopy.textContent = 'Collect the glowing petals in the room. The garden keeps growing while you are away.';
  challengePlayfield.innerHTML = `
    <div class="score-row"><span id="tend-score">0 / 5</span><span>garden Lv.${state.economy.gardenLevel}</span></div>
    <button class="petal-target" id="petal-target" aria-label="Petal"></button>
  `;

  const target = document.querySelector<HTMLButtonElement>('#petal-target')!;
  const scoreEl = document.querySelector<HTMLSpanElement>('#tend-score')!;
  let score = 0;

  function movePetal() {
    target.style.left = `${10 + Math.random() * 76}%`;
    target.style.top = `${28 + Math.random() * 55}%`;
  }

  target.addEventListener('click', async () => {
    score += 1;
    scoreEl.textContent = `${score} / 5`;
    audio.cue(score >= 4 ? 'shift' : 'spark');
    if (score >= 5) {
      await completeChallenge('tend');
      return;
    }
    movePetal();
  });

  movePetal();
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function runFinale() {
  if (isFinaleRunning) return;
  isFinaleRunning = true;
  state.story.finaleStatus = 'running';
  state.pet.currentBehavior = 'exit';
  document.body.classList.add('sequence-running');
  render();
  scene.startExit();
  say('Do not close your hand. I am only crossing the small distance.', 'silence');
  await persist();

  await sleep(4200);
  const bounds = await window.mochi.overlay.show();
  state = recordOverlayMemory(state);
  render();
  await persist();
  const baseY = Math.max(24, bounds.height - 260);
  const travel = Math.max(360, bounds.width - 260);

  for (let i = 0; i <= 150; i += 1) {
    const t = i / 150;
    const x = 20 + travel * t;
    const y = baseY - Math.sin(t * Math.PI * 2.5) * 84;
    await window.mochi.overlay.move(x, y);
    await sleep(22);
  }

  state.story.finaleStatus = 'complete';
  state.story.aftermathStatus = 'returned';
  state.pet.currentBehavior = 'stare';
  state.pet.dependency = 100;
  state.pet.stress = 34;
  document.body.classList.remove('sequence-running');
  render();
  say('I came back because this is where you know how to find me.', 'low');
  addNote('Mochi returned to the room.');
  await persist();
  isFinaleRunning = false;
}

function handleScenePick(action: CareAction) {
  if (action === 'observe') {
    void runRoutine(action);
    return;
  }

  if (activeChallenge === action) {
    say('Use the active routine panel to finish it.', 'soft');
    return;
  }

  startChallenge(action);
}

function setRoom(room: SceneRoom) {
  currentRoom = room;
  clearChallenge();
  scene?.setRoom(room);
  say(room === 'garden' ? 'The garden has its own air.' : 'The room is where Mochi waits.', 'soft');
  render();
}

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
  button.addEventListener('click', () => startChallenge(button.dataset.action as CareAction));
});

document.querySelectorAll<HTMLButtonElement>('[data-room]').forEach((button) => {
  button.addEventListener('click', () => setRoom(button.dataset.room as SceneRoom));
});

profileSaveButton.addEventListener('click', () => {
  void saveProfileName();
});

profileNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    profileNameInput.blur();
    void saveProfileName();
  }
});

document.querySelector<HTMLButtonElement>('#challenge-cancel')?.addEventListener('click', () => {
  clearChallenge();
  say('We can do another routine.', 'soft');
});

gardenHelpButton.addEventListener('click', () => {
  setRoom('garden');
  say('Seeds become food only if the soil stays watered. Drag the can across the plots.', 'soft');
});

gardenBoard.addEventListener('click', async (event) => {
  const plotButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-plot]');
  if (!plotButton) return;
  const plotId = Number(plotButton.dataset.plot);
  const plot = state.economy.cropPlots[plotId];
  if (!plot) return;

  const before = structuredClone(state);
  if (!plot.planted) {
    state = plantSeed(state, plotId);
    say(state.economy.seeds === before.economy.seeds ? 'You need a seed packet first.' : 'A seed went into the soil.', 'soft');
  } else if (plot.progress >= 100) {
    state = harvestCrop(state, plotId);
    state = applyCareAction(state, 'tend');
    say('Harvested. Food for the room, petals for the pocket.', 'spark');
    addNote('Garden harvest completed.');
  } else if (plot.water <= 0) {
    say('This one is dry. Use the watering can before it grows again.', 'low');
  } else {
    say('Still growing. The soil is doing the slow part.', 'soft');
  }

  render();
  await persist();
});

document.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const item = button.dataset.buy as ShopItem;
    const before = state.economy.petals;
    state = buyItem(state, item);
    say(state.economy.petals === before ? 'Not enough petals yet.' : 'Bought. Put it somewhere Mochi can use.', 'soft');
    render();
    await persist();
  });
});

let watering = false;
let wateringPointerId: number | null = null;
let wateredPlots = new Set<number>();

function markWateredPlot(clientX: number, clientY: number) {
  wateringCan.style.left = `${clientX - gardenLayer.getBoundingClientRect().left - 27}px`;
  wateringCan.style.top = `${clientY - gardenLayer.getBoundingClientRect().top - 24}px`;
  wateringCan.style.pointerEvents = 'none';
  const element = document.elementFromPoint(clientX, clientY);
  wateringCan.style.pointerEvents = '';
  const plotButton = element?.closest<HTMLButtonElement>('[data-plot]');
  if (!plotButton) return;
  const plotId = Number(plotButton.dataset.plot);
  const plot = state.economy.cropPlots[plotId];
  if (!plot?.planted || plot.progress >= 100) return;
  wateredPlots.add(plotId);
  plotButton.classList.add('water-preview');
}

wateringCan.addEventListener('pointerdown', (event) => {
  if (currentRoom !== 'garden') return;
  if (state.economy.water <= 0) {
    say('The can is empty. Buy water before the soil can drink.', 'low');
    return;
  }
  watering = true;
  wateringPointerId = event.pointerId;
  wateredPlots = new Set();
  wateringCan.setPointerCapture(event.pointerId);
  wateringCan.classList.add('dragging');
  markWateredPlot(event.clientX, event.clientY);
});

wateringCan.addEventListener('pointermove', (event) => {
  if (!watering) return;
  markWateredPlot(event.clientX, event.clientY);
});

wateringCan.addEventListener('pointerup', async () => {
  if (!watering) return;
  watering = false;
  wateringCan.classList.remove('dragging');
  if (wateringPointerId !== null) {
    wateringCan.releasePointerCapture(wateringPointerId);
  }
  wateringPointerId = null;

  if (wateredPlots.size > 0) {
    const beforeWater = state.economy.water;
    state = waterPlots(state, [...wateredPlots]);
    state = applyCareAction(state, 'tend');
    const used = beforeWater - state.economy.water;
    say(used > 0 ? `Watered ${used} plot${used === 1 ? '' : 's'}.` : 'Those plots cannot take water right now.', 'spark');
    addNote('Garden watering completed.');
    render();
    await persist();
  } else {
    say('Drag the can across planted soil.', 'soft');
    render();
  }
});

document.querySelector<HTMLButtonElement>('#minimize')?.addEventListener('click', async () => {
  state = recordWindowMemory(state, 'minimize');
  render();
  await persist();
  await window.mochi.window.minimize();
});

document.querySelector<HTMLButtonElement>('#close')?.addEventListener('click', async () => {
  state = recordWindowMemory(state, 'close');
  await persist();
  await window.mochi.window.close();
});
document.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', async () => {
  state = resetState();
  await window.mochi.overlay.hide();
  await persist();
  notesEl.innerHTML = '';
  clearChallenge();
  say('The room is ready.', 'soft');
  render();
});

async function init() {
  const [saved, settings] = await Promise.all([window.mochi.state.load(), window.mochi.settings.get()]);
  state = hydrateState(saved);
  await window.mochi.settings.set({ companionMode: settings?.companionMode ?? true });

  scene = new CompanionScene(mount, handleScenePick);
  scene.update();
  startCatWander();
  render();
  say(state.story.aftermathStatus === 'returned' ? 'You still remember the routine.' : pickIdleLine(state), 'soft');
  await persist();

  window.setInterval(async () => {
    if (isFinaleRunning) return;
    state = recordSessionTick(state, !document.hidden, currentRoom);
    render();
    await persist();
  }, 5000);

  window.setInterval(async () => {
    if (isFinaleRunning) return;
    const previousAct = state.story.act;
    state = applyTimeDrift(state);
    if (state.story.act !== previousAct) {
      addNote(`Act ${state.story.act}: ${titleForAct(state.story.act)}`);
    }
    if (!document.hidden) {
      const recall = maybeRecallMemory(state);
      if (recall.line) {
        state = recall.state;
        say(recall.line, state.story.act === 1 ? 'shift' : 'low');
        addNote('Mochi remembered something.');
      } else {
        say(pickIdleLine(state), state.story.act === 1 ? 'soft' : 'shift');
      }
    }
    render();
    await persist();
  }, 7000);
}

void init();
