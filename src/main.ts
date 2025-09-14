import { bootstrapCameraKit } from '@snap/camera-kit';

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

type Facing = 'user' | 'environment';
type Aspect = '3:4' | '16:9';

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches;
}

// Defaults: desktop = rear + 16:9, mobile/tablet = front + 3:4
let currentFacing: Facing = isDesktop() ? 'environment' : 'user';
let currentAspect: Aspect = isDesktop() ? '16:9' : '3:4';

async function initCamera() {
  if (!cameraKit) {
    cameraKit = await bootstrapCameraKit({
      apiToken:
        'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU2MDg0MjEwLCJzdWIiOiJmODFlYmJhMC1iZWIwLTRjZjItOWJlMC03MzVhMTJkNGQxMWR-U1RBR0lOR345ZWY5YTc2Mi0zMTIwLTRiOTQtOTUwMy04NWFmZjc0MWU5YmIifQ.UR2iAXnhuNEOmPuk7-qsu8vD09mrRio3vNtUo0BNz8M',
    });
  }
  if (!session) {
    session = await cameraKit.createSession({ liveRenderTarget: canvas });
    await setCameraStream(currentFacing); // start with chosen facing
    await session.play();
    // Ensure canvas bitmap matches CSS size
    resizeCanvasToContainer();
  }
}

async function loadLens(groupId: string, lensId: string) {
  await initCamera();
  const lens = await cameraKit.lensRepository.loadLens(groupId, lensId);
  await session.applyLens(lens);
}

/** ---------- Responsive canvas bitmap ---------- */
function resizeCanvasToContainer() {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for perf
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

const ro = new ResizeObserver(() => resizeCanvasToContainer());
if (container) ro.observe(container);
window.addEventListener('resize', resizeCanvasToContainer);
window.addEventListener('orientationchange', () => {
  // Re-evaluate desktop/mobile and keep user’s current choice otherwise
  resizeCanvasToContainer();
});

/** ---------- Facing / Aspect controls ---------- */
function applyAspect(aspect: Aspect) {
  currentAspect = aspect;
  container.style.aspectRatio = aspect === '16:9' ? '16 / 9' : '3 / 4';
  // Button shows the NEXT aspect to switch to
  if (btnToggleAspect) btnToggleAspect.textContent = aspect === '3:4' ? '16:9' : '3:4';
  resizeCanvasToContainer();
}

// Stop old tracks and set a new stream with desired facing
async function setCameraStream(facing: Facing) {
  currentFacing = facing;

  try {
    // stop previous tracks if any
    const previous = (session as any)?._source as MediaStream | undefined;
    previous?.getTracks().forEach((t) => t.stop());
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

  await session.setSource(stream!);
  // Update switch button label
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
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
}

async function switchTab(tab: Tab) {
  setActive(tab);

  if (tab === 'bayou') {
    viewTitle.textContent = 'Bayou';
    showOnly(cameraView);
    // Ensure initial aspect based on device on first entry
    applyAspect(isDesktop() ? '16:9' : '3:4');
    await loadLens('50502080875', 'acf0388d-3502-43d2-8e7d-6589e6eaceb4');
  } else if (tab === 'photo') {
    viewTitle.textContent = 'Photo Booth';
    showOnly(cameraView);
    applyAspect(isDesktop() ? '16:9' : '3:4');
    await loadLens('1d5338a5-2299-44e8-b41d-e69573824971', '4a0ae680-1f29-4d6f-8964-ef46faa7530f'); // replace with your Photo Booth IDs
  } else if (tab === 'bag') {
    renderBackpack();
    showOnly(backpackView);
  } else {
    showOnly(settingsView);
  }
}

/** ---------- Simple Backpack store ---------- */
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

function renderBackpack() {
  const list = store.get();
  const grid = document.getElementById('bag-grid')!;
  const empty = document.getElementById('bag-empty')!;
  grid.innerHTML = '';

  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((name) => {
    const item = document.createElement('div');
    item.className = 'bag-item';
    item.innerHTML = `
      <div class="bag-thumb" style="background-image:url('/images/${name}.jpg')"></div>
      <div>${name}</div>
    `;
    grid.appendChild(item);
  });
}

/** ---------- UI wiring ---------- */
function wireNav() {
  (document.getElementById('tab-bayou') as HTMLButtonElement)?.addEventListener('click', () =>
    switchTab('bayou'),
  );
  (document.getElementById('tab-photo') as HTMLButtonElement)?.addEventListener('click', () =>
    switchTab('photo'),
  );
  (document.getElementById('tab-bag') as HTMLButtonElement)?.addEventListener('click', () =>
    switchTab('bag'),
  );
  (document.getElementById('tab-settings') as HTMLButtonElement)?.addEventListener('click', () =>
    switchTab('settings'),
  );

  // Top-bar tools
  btnSwitchCam?.addEventListener('click', () => toggleFacing());
  btnToggleAspect?.addEventListener('click', () => toggleAspect());

  // Capture still
  document.getElementById('capture-button')?.addEventListener('click', () => {
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'capture.png';
    a.click();
  });
}

/** ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Initial labels for buttons
  if (btnToggleAspect) btnToggleAspect.textContent = currentAspect === '3:4' ? '16:9' : '3:4';
  if (btnSwitchCam) btnSwitchCam.textContent = currentFacing === 'user' ? 'Rear' : 'Front';

  wireNav();
  // Default tab: start on Bayou (will prompt for camera permission)
  switchTab('bayou');
});





// import { bootstrapCameraKit } from '@snap/camera-kit';

// /** ---------- Camera Kit setup ---------- */
// let cameraKit: any = null;
// let session: any = null;
// const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// async function initCamera() {
//   if (!cameraKit) {
//     cameraKit = await bootstrapCameraKit({
//       apiToken: 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzUyMTc4OTk4LCJzdWIiOiIzM2ZjZWFmOS1mMTE5LTQwZGMtOWVhMC0wOWNlZTZkMDU2OWZ-U1RBR0lOR34yNmI2MzljZi0xODdmLTRmY2EtOGVmOC1hYjU3ZTA4MjFhMmUifQ.siNC63iXQ0E-WQ8lIoowei0k98WLr-ODY34Met3JLXs',
//     });
//   }
//   if (!session) {
//     session = await cameraKit.createSession({ liveRenderTarget: canvas });
//     const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
//     await session.setSource(mediaStream);
//     await session.play();
//   }
// }

// async function loadLens(groupId: string, lensId: string) {
//   await initCamera();
//   const lens = await cameraKit.lensRepository.loadLens(groupId, lensId);
//   await session.applyLens(lens);
// }

// /** ---------- Tabs & Views ---------- */
// type Tab = 'bayou' | 'photo' | 'bag' | 'settings';

// const cameraView = document.getElementById('camera-view')!;
// const backpackView = document.getElementById('backpack-view')!;
// const settingsView = document.getElementById('settings-view')!;
// const viewTitle = document.getElementById('view-title')!;

// function showOnly(el: HTMLElement) {
//   [cameraView, backpackView, settingsView].forEach(v => v.classList.add('hidden'));
//   el.classList.remove('hidden');
// }

// function setActive(tab: Tab) {
//   document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
//   document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
// }

// async function switchTab(tab: Tab) {
//   setActive(tab);

//   if (tab === 'bayou') {
//     viewTitle.textContent = 'Bayou';
//     showOnly(cameraView);
//     await loadLens('50502080875', 'acf0388d-3502-43d2-8e7d-6589e6eaceb4'); // ← your Bayou lens
//   } else if (tab === 'photo') {
//     viewTitle.textContent = 'Photo Booth';
//     showOnly(cameraView);
//     await loadLens('PHOTO_LENS_GROUP_ID', 'PHOTO_LENS_ID'); // ← replace with your Photo Booth lens
//   } else if (tab === 'bag') {
//     renderBackpack();
//     showOnly(backpackView);
//   } else {
//     showOnly(settingsView);
//   }
// }

// /** ---------- Simple Backpack store ---------- */
// const store = {
//   key: 'collected-animals',
//   get(): string[] {
//     try { return JSON.parse(localStorage.getItem(this.key) || '[]'); }
//     catch { return []; }
//   },
//   set(list: string[]) { localStorage.setItem(this.key, JSON.stringify(list)); }
// };

// function renderBackpack() {
//   const list = store.get();
//   const grid = document.getElementById('bag-grid')!;
//   const empty = document.getElementById('bag-empty')!;
//   grid.innerHTML = '';

//   if (list.length === 0) {
//     empty.classList.remove('hidden');
//     return;
//   }
//   empty.classList.add('hidden');

//   list.forEach(name => {
//     const item = document.createElement('div');
//     item.className = 'bag-item';
//     item.innerHTML = `
//       <div class="bag-thumb" style="background-image:url('/images/${name}.jpg')"></div>
//       <div>${name}</div>
//     `;
//     grid.appendChild(item);
//   });
// }

// /** ---------- UI wiring ---------- */
// function wireNav() {
//   (document.getElementById('tab-bayou') as HTMLButtonElement)
//     ?.addEventListener('click', () => switchTab('bayou'));
//   (document.getElementById('tab-photo') as HTMLButtonElement)
//     ?.addEventListener('click', () => switchTab('photo'));
//   (document.getElementById('tab-bag') as HTMLButtonElement)
//     ?.addEventListener('click', () => switchTab('bag'));
//   (document.getElementById('tab-settings') as HTMLButtonElement)
//     ?.addEventListener('click', () => switchTab('settings'));

//   // Capture still
//   document.getElementById('capture-button')?.addEventListener('click', () => {
//     const dataUrl = canvas.toDataURL('image/png');
//     const a = document.createElement('a');
//     a.href = dataUrl;
//     a.download = 'capture.png';
//     a.click();
//   });
// }

// // Start on Backpack (no permissions) or Bayou—your choice:
// document.addEventListener('DOMContentLoaded', () => {
//   wireNav();
//   // Default tab: show Backpack (no camera permission until user taps Bayou/Photo)
//   switchTab('bayou');
// });



// import { bootstrapCameraKit } from '@snap/camera-kit';

// let cameraKit: any = null;
// let session: any = null;

// const homepage = document.getElementById('homepage') as HTMLElement;
// const cameraApp = document.getElementById('camera-app') as HTMLElement;
// const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// function showHome() {
//   cameraApp.classList.add('hidden');
//   homepage.classList.remove('hidden');
// }
// function showCamera() {
//   homepage.classList.add('hidden');
//   cameraApp.classList.remove('hidden');
// }

// async function initCameraKit() {
//   if (!cameraKit) {
//     cameraKit = await bootstrapCameraKit({
//       apiToken: 'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzUyMTc4OTk4LCJzdWIiOiIzM2ZjZWFmOS1mMTE5LTQwZGMtOWVhMC0wOWNlZTZkMDU2OWZ-U1RBR0lOR34yNmI2MzljZi0xODdmLTRmY2EtOGVmOC1hYjU3ZTA4MjFhMmUifQ.siNC63iXQ0E-WQ8lIoowei0k98WLr-ODY34Met3JLXs',
//     });
//   }
//   if (!session) {
//     session = await cameraKit.createSession({ liveRenderTarget: canvas });
//     const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
//     await session.setSource(mediaStream);
//     await session.play();
//   }
// }

// async function loadLens(groupId: string, lensId: string) {
//   await initCameraKit();
//   const lens = await cameraKit.lensRepository.loadLens(groupId, lensId);
//   await session.applyLens(lens);
//   showCamera();
// }

// function wireUI() {

//   document.getElementById('card-bayou')?.addEventListener('click', () => {
//     // Bayou lens
//     loadLens('50502080875', 'acf0388d-3502-43d2-8e7d-6589e6eaceb4');
//   });
//   document.getElementById('card-photo')?.addEventListener('click', () => {
//     // Photo Booth lens
//     loadLens('PHOTO_LENS_GROUP_ID', 'PHOTO_LENS_ID');
//   });

//   // Header buttons
//   document.getElementById('back-home')?.addEventListener('click', () => {
//     showHome();
//   });

//   // Capture
//   document.getElementById('capture-button')?.addEventListener('click', () => {
//     const image = canvas.toDataURL('image/png');
//     const link = document.createElement('a');
//     link.href = image;
//     link.download = 'captured-image.png';
//     link.click();
//   });
// }

// // Ensure DOM exists before wiring
// document.addEventListener('DOMContentLoaded', wireUI);




// import { bootstrapCameraKit } from '@snap/camera-kit';

// let session: any = null;
// let cameraKit: any = null;
// const liveRenderTarget = document.getElementById('canvas') as HTMLCanvasElement;
// const cameraContainer = document.getElementById('camera-container') as HTMLDivElement;

// async function initCameraKit() {
//   if (!cameraKit) {
//     cameraKit = await bootstrapCameraKit({
//       apiToken:'eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0.eyJhdWQiOiJjYW52YXMtY2FudmFzYXBpIiwiaXNzIjoiY2FudmFzLXMyc3Rva2VuIiwibmJmIjoxNzU0NDA1OTAzLCJzdWIiOiJjMzhmNTdiOC05N2ZhLTQ3YTMtYWY3ZC1hNWE2ODIyMmUxNDB-U1RBR0lOR35jMjMzOTFiZS05MDNiLTRlN2QtOGZkMy1hYTQwNjQ3NWZlM2YifQ.QlLvJEtNKpI8B565Nz0rud85Q0xgpVvyUzEVwPUTK-Y',
//     });
//   }
//   if (!session) {
//     session = await cameraKit.createSession({ liveRenderTarget });
//     const mediaStream = await navigator.mediaDevices.getUserMedia({
//       video: true,
//     });
//     await session.setSource(mediaStream);
//     await session.play();
//   }
// }

// async function loadLens(groupId: string, lensId: string) {
//   await initCameraKit();
//   const lens = await cameraKit.lensRepository.loadLens(groupId, lensId);
//   await session.applyLens(lens);
//   cameraContainer.style.display = 'block';
// }

// // Capture button
// document.getElementById('capture-button')?.addEventListener('click', () => {
//   const canvas = document.getElementById('canvas') as HTMLCanvasElement;
//   if (!canvas) return;

//   const image = canvas.toDataURL('image/png');
//   const link = document.createElement('a');
//   link.href = image;
//   link.download = 'captured-image.png';
//   link.click();
// });

// // Bayou button
// document.getElementById('bayou-button')?.addEventListener('click', () => {
//   loadLens('50502080875', 'acf0388d-3502-43d2-8e7d-6589e6eaceb4'); // use your Bayou lens ID
// });

// // Photo Booth button
// document.getElementById('photo-button')?.addEventListener('click', () => {
//   loadLens('082b301b-58bd-4eab-b86e-7c09c28fbe7b', '051021da-8a0f-41ff-b9f5-b2cb1ab7d713'); // replace with your Photo Booth lens info
// });
