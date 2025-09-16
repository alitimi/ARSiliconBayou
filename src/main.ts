import { bootstrapCameraKit } from '@snap/camera-kit'

/** ---------- DOM refs ---------- */
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const container = document.querySelector('.camera-container') as HTMLDivElement;

const cameraView = document.getElementById('camera-view')!;
const backpackView = document.getElementById('backpack-view')!;
const settingsView = document.getElementById('settings-view')!;
const btnToggleAspect = document.getElementById('btn-toggle-aspect') as HTMLButtonElement | null;
const btnSwitchCam = document.getElementById('btn-switch-cam') as HTMLButtonElement | null;

/** ---------- Camera Kit setup ---------- */
let cameraKit: any = null;
let session: any = null;
let currentStream: MediaStream | null = null;
let canvasLocked = false;

type Facing = 'user' | 'environment';
type Aspect = '3:4' | '16:9';
type Tab = 'bayou' | 'photo' | 'bag' | 'settings';

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

// Defaults
let currentFacing: Facing = isDesktop() ? 'environment' : 'user';
let currentAspect: Aspect = isDesktop() ? '16:9' : '3:4';

/** Use ONE lens for both tabs */
const LENS_GROUP = '6f32833b-0365-4e96-8861-bb2b332a82ec';
const LENS_ID    = '1d5338a5-2299-44e8-b41d-e69573824971';
let loadedLensKey: string | null = null;

/** ---------- Responsive canvas bitmap & CSS ---------- */
function resizeCanvasToContainer(forceBitmap = false) {
  if (!container) return;
  const rect = container.getBoundingClientRect();

  // Set bitmap only before OffscreenCanvas takeover
  if (!canvasLocked || forceBitmap) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  // Keep CSS size in sync
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
}

/** ---------- Init / Session ---------- */
async function initCamera() {
  if (!cameraKit) {
    cameraKit = await bootstrapCameraKit({
      apiToken:
        'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU2MDg0MjEwLCJzdWIiOiJmODFlYmJhMC1iZWIwLTRjZjItOWJlMC03MzVhMTJkNGQxMWR-U1RBR0lOR345ZWY5YTc2Mi0zMTIwLTRiOTQtOTUwMy04NWFmZjc0MWU5YmIifQ.UR2iAXnhuNEOmPuk7-qsu8vD09mrRio3vNtUo0BNz8M',
    });
  }

  if (!session) {
    resizeCanvasToContainer(true); // set bitmap once
    session = await cameraKit.createSession({ liveRenderTarget: canvas });
    canvasLocked = true;
    await setCameraStream(currentFacing);
    await session.play();
  }
}

/** Load the shared lens once */
async function ensureLensLoaded() {
  await initCamera();
  const key = `${LENS_GROUP}:${LENS_ID}`;
  if (loadedLensKey === key) return;
  const lens = await cameraKit.lensRepository.loadLens(LENS_GROUP, LENS_ID);
  await session.applyLens(lens);
  loadedLensKey = key;
}

/** ---------- Facing / Aspect ---------- */
function applyAspect(aspect: Aspect) {
  currentAspect = aspect;
  // Fullscreen layout ignores aspect ratio; we just update the button label
  if (btnToggleAspect) btnToggleAspect.textContent = aspect === '3:4' ? '16:9' : '3:4';
  resizeCanvasToContainer();
}

async function setCameraStream(facing: Facing) {
  currentFacing = facing;

  try { currentStream?.getTracks().forEach((t) => t.stop()); } catch {}

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing } },
      audio: false,
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }

  currentStream = stream;
  await session.setSource(stream!);
  if (btnSwitchCam) btnSwitchCam.textContent = currentFacing === 'user' ? 'Rear' : 'Front';
}

async function toggleFacing() {
  const next: Facing = currentFacing === 'user' ? 'environment' : 'user';
  await setCameraStream(next);
}

function toggleAspect() {
  const next: Aspect = currentAspect === '3:4' ? '16:9' : '3:4';
  applyAspect(next);
}

/** ---------- Tabs & Views ---------- */
function showOnly(el: HTMLElement) {
  [cameraView, backpackView, settingsView].forEach((v) => v.classList.add('hidden'));
  el.classList.remove('hidden');
}

function setActive(tab: Tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
}

async function switchTab(tab: Tab) {
  setActive(tab);

  if (tab === 'bayou') {
    showOnly(cameraView);
    await ensureLensLoaded();           // same lens
    await setCameraStream('environment'); // rear camera
  } else if (tab === 'photo') {
    showOnly(cameraView);
    await ensureLensLoaded();           // same lens
    await setCameraStream('user');        // selfie camera
  } else if (tab === 'bag') {
    renderBackpack();
    showOnly(backpackView);
  } else {
    showOnly(settingsView);
  }
}

/** ---------- Backpack stores ---------- */
// Named images (optional)
const store = {
  key: 'collected-animals',
  get(): string[] { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch { return []; } },
  set(list: string[]) { localStorage.setItem(this.key, JSON.stringify(list)); },
};

// Captured photos
type CapturedPhoto = { id: string; ts: number; dataUrl: string };
const photoStore = {
  key: 'bag-photos',
  get(): CapturedPhoto[] { try { return JSON.parse(localStorage.getItem(this.key) || '[]') as CapturedPhoto[]; } catch { return []; } },
  set(list: CapturedPhoto[]) { localStorage.setItem(this.key, JSON.stringify(list)); },
  add(dataUrl: string) {
    const list = this.get();
    const id = (crypto && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    list.unshift({ id, ts: Date.now(), dataUrl });
    this.set(list);
  },
  clear() { this.set([]); },
};

function renderBackpack() {
  const animals = store.get();
  const photos = photoStore.get();
  const grid = document.getElementById('bag-grid')!;
  const empty = document.getElementById('bag-empty')!;
  grid.innerHTML = '';

  if (animals.length === 0 && photos.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Captured photos
  photos.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'bag-item';
    item.innerHTML = `
      <div class="bag-thumb" style="background-image:url('${p.dataUrl}')"></div>
      <div>Photo • ${new Date(p.ts).toLocaleDateString()}</div>
    `;
    grid.appendChild(item);
  });

  // Optional named items (relative path)
  animals.forEach((name) => {
    const item = document.createElement('div');
    item.className = 'bag-item';
    item.innerHTML = `
      <div class="bag-thumb" style="background-image:url('images/${name}.jpg')"></div>
      <div>${name}</div>
    `;
    grid.appendChild(item);
  });
}

/** ---------- Reset App ---------- */
async function resetApp() {
  try {
    photoStore.clear();
    store.set([]);
    try { currentStream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { if (session?.pause) await session.pause(); } catch {}
    const grid = document.getElementById('bag-grid'); const empty = document.getElementById('bag-empty');
    if (grid) grid.innerHTML = ''; if (empty) empty.classList.remove('hidden');
  } finally {
    window.location.reload();
  }
}

/** ---------- UI wiring ---------- */
function wireNav() {
  (document.getElementById('tab-bayou') as HTMLButtonElement)?.addEventListener('click', () => switchTab('bayou'));
  (document.getElementById('tab-photo') as HTMLButtonElement)?.addEventListener('click', () => switchTab('photo'));
  (document.getElementById('tab-bag') as HTMLButtonElement)?.addEventListener('click', () => switchTab('bag'));
  (document.getElementById('tab-settings') as HTMLButtonElement)?.addEventListener('click', () => switchTab('settings'));

  btnSwitchCam?.addEventListener('click', () => toggleFacing());
  btnToggleAspect?.addEventListener('click', () => toggleAspect());

  const captureBtn = document.getElementById('capture-button');
  captureBtn?.addEventListener('click', () => {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const a = document.createElement('a'); a.href = dataUrl; a.download = 'capture.jpg'; a.click();
    photoStore.add(dataUrl);
    renderBackpack();
  });

  const resetBtn = document.getElementById('btn-reset-app') as HTMLButtonElement | null;
  resetBtn?.addEventListener('click', () => {
    if (window.confirm('Reset the app and clear your gallery?')) resetApp();
  });
}

/** ---------- Observers ---------- */
const ro = new ResizeObserver(() => resizeCanvasToContainer());
if (container) ro.observe(container);
window.addEventListener('resize', () => resizeCanvasToContainer());
window.addEventListener('orientationchange', () => resizeCanvasToContainer());

/** ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  if (btnToggleAspect) btnToggleAspect.textContent = currentAspect === '3:4' ? '16:9' : '3:4';
  btnSwitchCam && (btnSwitchCam.textContent = currentFacing === 'user' ? 'Rear' : 'Front');
  wireNav();
  switchTab('bayou'); // default: Bayou (rear)
});
