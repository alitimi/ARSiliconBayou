import { bootstrapCameraKit } from '@snap/camera-kit'

/** ---------- DOM refs ---------- */
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const container = document.querySelector('.camera-container') as HTMLDivElement;

const cameraView = document.getElementById('camera-view')!;
const backpackView = document.getElementById('backpack-view')!;
const settingsView = document.getElementById('settings-view')!;
const viewTitle = document.getElementById('view-title')!;

const btnToggleAspect = document.getElementById('btn-toggle-aspect') as HTMLButtonElement | null;
const btnSwitchCam = document.getElementById('btn-switch-cam') as HTMLButtonElement | null;

/** ---------- Camera Kit setup ---------- */
let cameraKit: any = null;
let session: any = null;
let currentStream: MediaStream | null = null;

// After Camera Kit takes over, you cannot change canvas.width/height.
let canvasLocked = false;

type Facing = 'user' | 'environment';
type Aspect = '3:4' | '16:9';

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

// Defaults: desktop = rear + 16:9, mobile/tablet = front + 3:4
let currentFacing: Facing = isDesktop() ? 'environment' : 'user';
let currentAspect: Aspect = isDesktop() ? '16:9' : '3:4';

/** ---------- Responsive canvas bitmap & CSS ---------- */
function resizeCanvasToContainer(forceBitmap = false) {
  if (!container) return;
  const rect = container.getBoundingClientRect();

  // Set bitmap size only before offscreen takeover (or if forced before starting session)
  if (!canvasLocked || forceBitmap) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  // Always keep CSS size in sync (safe after lock)
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
    // Set bitmap size ONCE before OffscreenCanvas takeover
    resizeCanvasToContainer(true);

    session = await cameraKit.createSession({ liveRenderTarget: canvas });
    canvasLocked = true;

    await setCameraStream(currentFacing);
    await session.play();
  }
}

async function loadLens(groupId: string, lensId: string) {
  await initCamera();
  const lens = await cameraKit.lensRepository.loadLens(groupId, lensId);
  await session.applyLens(lens);
}

/** ---------- Facing / Aspect controls ---------- */
function applyAspect(aspect: Aspect) {
  currentAspect = aspect;
  // Only change the container aspect ratio (CSS). Do NOT touch canvas bitmap here.
  container.style.aspectRatio = aspect === '16:9' ? '16 / 9' : '3 / 4';
  if (btnToggleAspect) btnToggleAspect.textContent = aspect === '3:4' ? '16:9' : '3:4';
  // Let the CSS sizing update; keep bitmap unchanged after lock.
  resizeCanvasToContainer();
}

// Stop old tracks and set a new stream with desired facing
async function setCameraStream(facing: Facing) {
  currentFacing = facing;

  try {
    currentStream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing } },
      audio: false,
    });
  } catch (e) {
    console.warn('facingMode not supported, falling back to default camera', e);
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }

  currentStream = stream;
  await session.setSource(stream!);

  if (btnSwitchCam) btnSwitchCam.textContent = currentFacing === 'user' ? 'Rear' : 'Front';
}

async function toggleFacing() {
  const next: Facing = currentFacing === 'user' ? 'environment' : 'user';
  try {
    await setCameraStream(next);
  } catch (e) {
    console.error('Failed to switch camera', e);
  }
}

function toggleAspect() {
  const next: Aspect = currentAspect === '3:4' ? '16:9' : '3:4';
  applyAspect(next);
}

/** ---------- Tabs & Views ---------- */
type Tab = 'bayou' | 'photo' | 'bag' | 'settings';

function showOnly(el: HTMLElement) {
  [cameraView, backpackView, settingsView].forEach((v) => v.classList.add('hidden'));
  el.classList.remove('hidden');
}

function setActive(tab: Tab) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  const el = document.querySelector(`[data-tab="${tab}"]`);
  el?.classList.add('active');
}

async function switchTab(tab: Tab) {
  setActive(tab);

  if (tab === 'bayou') {
    viewTitle.textContent = 'Bayou';
    showOnly(cameraView);
    applyAspect(isDesktop() ? '16:9' : '3:4');
    await loadLens('6f32833b-0365-4e96-8861-bb2b332a82ec', '1d5338a5-2299-44e8-b41d-e69573824971');
  } else if (tab === 'photo') {
    viewTitle.textContent = 'Photo Booth';
    showOnly(cameraView);
    applyAspect(isDesktop() ? '16:9' : '3:4');
    // replace with your Photo Booth IDs
    await loadLens('1d5338a5-2299-44e8-b41d-e69573824971', '4a0ae680-1f29-4d6f-8964-ef46faa7530f');
  } else if (tab === 'bag') {
    renderBackpack();
    showOnly(backpackView);
  } else {
    showOnly(settingsView);
  }
}

/** ---------- Simple Backpack stores ---------- */
// Existing simple list of named images (from /images folder)
const store = {
  key: 'collected-animals',
  get(): string[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  },
  set(list: string[]) {
    localStorage.setItem(this.key, JSON.stringify(list));
  },
};

// New: captured photos (data URLs)
type CapturedPhoto = { id: string; ts: number; dataUrl: string };

const photoStore = {
  key: 'bag-photos',
  get(): CapturedPhoto[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]') as CapturedPhoto[];
    } catch {
      return [];
    }
  },
  set(list: CapturedPhoto[]) {
    localStorage.setItem(this.key, JSON.stringify(list));
  },
  add(dataUrl: string) {
    const list = this.get();
    const id =
      (crypto && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    list.unshift({ id, ts: Date.now(), dataUrl });
    this.set(list);
  },
  clear() {
    this.set([]);
  },
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

  // 1) Captured photos (new)
  photos.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'bag-item';
    item.innerHTML = `
      <div class="bag-thumb" style="background-image:url('${p.dataUrl}')"></div>
      <div>Photo • ${new Date(p.ts).toLocaleDateString()}</div>
    `;
    grid.appendChild(item);
  });

  // 2) Any pre-seeded "collected" items (use RELATIVE path)
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

/** ---------- Reset App (clear & reload) ---------- */
async function resetApp() {
  try {
    // Clear app data
    photoStore.clear();
    store.set([]);

    // Stop media tracks
    try {
      currentStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }

    // Optional: pause session if available
    try {
      if (session && typeof session.pause === 'function') {
        await session.pause();
      }
    } catch {
      /* ignore */
    }

    // Reflect empty UI immediately (in case reload is blocked)
    const grid = document.getElementById('bag-grid');
    const empty = document.getElementById('bag-empty');
    if (grid) grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
  } finally {
    // Full restart
    window.location.reload();
  }
}

/** ---------- UI wiring ---------- */
function wireNav() {
  const tabBayou = document.getElementById('tab-bayou') as HTMLButtonElement | null;
  const tabPhoto = document.getElementById('tab-photo') as HTMLButtonElement | null;
  const tabBag = document.getElementById('tab-bag') as HTMLButtonElement | null;
  const tabSettings = document.getElementById('tab-settings') as HTMLButtonElement | null;

  tabBayou?.addEventListener('click', () => switchTab('bayou'));
  tabPhoto?.addEventListener('click', () => switchTab('photo'));
  tabBag?.addEventListener('click', () => switchTab('bag'));
  tabSettings?.addEventListener('click', () => switchTab('settings'));

  // Top-bar tools
  btnSwitchCam?.addEventListener('click', () => toggleFacing());
  btnToggleAspect?.addEventListener('click', () => toggleAspect());

  // Capture still: download AND save to Backpack
  const captureBtn = document.getElementById('capture-button');
  captureBtn?.addEventListener('click', () => {
    // Prefer JPEG to keep size smaller for localStorage
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // 1) Download
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'capture.jpg';
    a.click();

    // 2) Save to Backpack (localStorage)
    photoStore.add(dataUrl);

    // 3) Update grid if Backpack is open
    renderBackpack();
  });

  // Settings → Reset App button
  const resetBtn = document.getElementById('btn-reset-app') as HTMLButtonElement | null;
  resetBtn?.addEventListener('click', () => {
    const ok = window.confirm('Reset the app and clear your gallery?');
    if (ok) resetApp();
  });
}

/** ---------- Observers (safe after lock) ---------- */
const ro = new ResizeObserver(() => resizeCanvasToContainer());
if (container) ro.observe(container);
window.addEventListener('resize', () => resizeCanvasToContainer());
window.addEventListener('orientationchange', () => resizeCanvasToContainer());

/** ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  if (btnToggleAspect) btnToggleAspect.textContent = currentAspect === '3:4' ? '16:9' : '3:4';
  if (btnSwitchCam) btnSwitchCam.textContent = currentFacing === 'user' ? 'Rear' : 'Front';

  wireNav();
  // Default tab: start on Bayou (will prompt for camera permission)
  switchTab('bayou');
});
