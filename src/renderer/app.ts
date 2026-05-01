import './styles/main.css';
import { RoomAudio } from './audio';
import { sceneEvents, pickActionLine, pickIdleLine } from './content/lines';
import { CompanionScene } from './scene';
import { applyCareAction, applyTimeDrift, hydrateState, resetState } from './state';
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
          <button class="ghost-button" id="reset">Reset</button>
        </div>
        <div id="scene-mount"></div>
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

const audio = new RoomAudio();
let state = resetState();
let scene: CompanionScene;
let isFinaleRunning = false;

function titleForAct(act: 1 | 2 | 3) {
  if (act === 1) return "Mochi's room";
  if (act === 2) return 'The room remembers';
  return 'The open window';
}

function formatBehavior(behavior: PetBehavior) {
  return behavior.charAt(0).toUpperCase() + behavior.slice(1);
}

function meter(label: string, value: number) {
  return `
    <div class="meter">
      <div class="meter-label"><span>${label}</span><strong>${Math.round(value)}</strong></div>
      <div class="meter-track"><div class="meter-fill" style="width:${value}%"></div></div>
    </div>
  `;
}

function render() {
  document.body.dataset.act = String(state.story.act);
  document.body.classList.toggle('after-return', state.story.aftermathStatus === 'returned');
  actTitleEl.textContent = titleForAct(state.story.act);
  behaviorEl.textContent = formatBehavior(state.pet.currentBehavior);
  hintEl.textContent =
    state.story.finaleStatus === 'ready'
      ? 'The window is active. Keep following the routine.'
      : state.story.act === 1
        ? 'Click an object in the room, or use a routine below.'
        : 'Mochi notices repeated routines.';

  metersEl.innerHTML = [
    meter('Hunger', state.pet.hunger),
    meter('Comfort', state.pet.comfort),
    meter('Energy', state.pet.energy),
    meter('Trust', state.pet.trust),
    meter('Attachment', state.pet.dependency),
    meter('Tension', state.pet.stress)
  ].join('');

  scene?.setState(state);
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

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
  button.addEventListener('click', () => runRoutine(button.dataset.action as CareAction));
});

document.querySelector<HTMLButtonElement>('#minimize')?.addEventListener('click', () => window.mochi.window.minimize());
document.querySelector<HTMLButtonElement>('#close')?.addEventListener('click', () => window.mochi.window.close());
document.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', async () => {
  state = resetState();
  await window.mochi.overlay.hide();
  await persist();
  notesEl.innerHTML = '';
  say('The room is ready.', 'soft');
  render();
});

async function init() {
  const [saved, settings] = await Promise.all([window.mochi.state.load(), window.mochi.settings.get()]);
  state = hydrateState(saved);
  await window.mochi.settings.set({ companionMode: settings?.companionMode ?? true });

  scene = new CompanionScene(mount, runRoutine);
  scene.update();
  render();
  say(state.story.aftermathStatus === 'returned' ? 'You still remember the routine.' : pickIdleLine(state), 'soft');

  window.setInterval(async () => {
    if (isFinaleRunning) return;
    const previousAct = state.story.act;
    state = applyTimeDrift(state);
    if (state.story.act !== previousAct) {
      addNote(`Act ${state.story.act}: ${titleForAct(state.story.act)}`);
    }
    if (!document.hidden) {
      say(pickIdleLine(state), state.story.act === 1 ? 'soft' : 'shift');
    }
    render();
    await persist();
  }, 18000);
}

void init();
