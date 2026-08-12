const video = document.querySelector("#video");
const hoverSurface = document.querySelector("#hoverSurface");
const progress = document.querySelector("#progress");
const markers = document.querySelector("#markers");
const frameReadout = document.querySelector("#frameReadout");
const timeReadout = document.querySelector("#timeReadout");
const stillReadout = document.querySelector("#stillReadout");
const previousFrame = document.querySelector("#previousFrame");
const playPause = document.querySelector("#playPause");
const playPauseIcon = document.querySelector("#playPauseIcon");
const nextFrame = document.querySelector("#nextFrame");
const previousStill = document.querySelector("#previousStill");
const nextStill = document.querySelector("#nextStill");
const canvas = document.querySelector("#stillCanvas");
const context = canvas.getContext("2d");
const TIMELINE_FPS = 32.5;
const FRAME_BOUNDARY_EPSILON = 0.01;
const FRAME_CALIBRATION = [
  { content: 0, video: 0 },
  { content: 96, video: 96 },
  { content: 97, video: 97 },
  { content: 213, video: 262 },
  { content: 219, video: 270 },
  { content: 234, video: 291 },
  { content: 280, video: 356 },
  { content: 430, video: 568 },
];

let manifest;
let entries = [];
let pendingProgress = null;
let stillRequest = 0;
let displayedStillFrame = null;
let activeMarkerFrame = null;
const markerElements = new Map();
const sheetCache = new Map();

function interpolate(value, fromKey, toKey) {
  let start = FRAME_CALIBRATION[0];
  let end = FRAME_CALIBRATION[1];

  for (let index = 1; index < FRAME_CALIBRATION.length; index += 1) {
    start = FRAME_CALIBRATION[index - 1];
    end = FRAME_CALIBRATION[index];
    if (value <= end[fromKey]) break;
  }

  const ratio = (value - start[fromKey]) / (end[fromKey] - start[fromKey]);
  return start[toKey] + ratio * (end[toKey] - start[toKey]);
}

function videoFrameToContentFrame(videoFrame) {
  return interpolate(videoFrame, "video", "content");
}

function contentFrameToVideoFrame(contentFrame) {
  return interpolate(contentFrame, "content", "video");
}

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

function formatTimecode(time) {
  const wholeSeconds = Math.floor(time);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const frames = Math.floor((time % 1) * TIMELINE_FPS);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(frames)}`;
}

function loadSheet(src) {
  if (!sheetCache.has(src)) {
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
    sheetCache.set(src, promise);
  }
  return sheetCache.get(src);
}

function findEntry(frame) {
  if (!entries.length || frame < entries[0].frame) return null;
  let low = 0;
  let high = entries.length - 1;
  let match = entries[0];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle].frame <= frame) {
      match = entries[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match;
}

async function showStill(time) {
  if (!manifest || !entries.length) return;
  const videoFrame = time * TIMELINE_FPS;
  const targetFrame = Math.floor(videoFrameToContentFrame(videoFrame));
  const entry = findEntry(targetFrame);
  const requestedFrame = entry?.frame ?? null;
  const request = ++stillRequest;

  if (requestedFrame === displayedStillFrame) return;

  if (!entry) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    stillReadout.value = "Standby";
    displayedStillFrame = null;
    return;
  }
  const image = await loadSheet(entry.sheet);
  if (request !== stillRequest) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    entry.column * manifest.cellWidth,
    entry.row * manifest.cellHeight,
    manifest.cellWidth,
    manifest.cellHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  displayedStillFrame = entry.frame;
  const stillNumber = entries.indexOf(entry) + 1;
  stillReadout.value = `face-${pad(stillNumber, 5)}`;
}

function showPosition(time) {
  const safeTime = Math.max(0, Math.min(time, video.duration || 0));
  const videoFrame = safeTime * TIMELINE_FPS;
  const contentFrame = Math.floor(videoFrameToContentFrame(videoFrame));
  const maximumFrame = Number.isFinite(video.duration)
    ? Math.floor(videoFrameToContentFrame(video.duration * TIMELINE_FPS))
    : 0;
  frameReadout.value = `FRAME-${pad(contentFrame, 5)}`;
  timeReadout.value = formatTimecode(safeTime);
  hoverSurface.setAttribute("aria-valuemax", maximumFrame);
  hoverSurface.setAttribute("aria-valuenow", contentFrame);
  hoverSurface.setAttribute("aria-valuetext", `Frame ${contentFrame}`);
  showActiveMarker(findEntry(contentFrame)?.frame);
  previousStill.disabled = Boolean(entries.length) && contentFrame <= entries[0].frame;
  nextStill.disabled = Boolean(entries.length) && contentFrame >= entries.at(-1).frame;
  progress.style.width = `${video.duration ? (safeTime / video.duration) * 100 : 0}%`;
  showStill(safeTime);
}

function skipToNextStill() {
  if (!entries.length || !Number.isFinite(video.duration)) return;
  const contentFrame = videoFrameToContentFrame(video.currentTime * TIMELINE_FPS);
  const nextEntry = entries.find((entry) => entry.frame > contentFrame + 0.01);
  if (!nextEntry) return;
  video.pause();
  video.currentTime = contentFrameToVideoFrame(nextEntry.frame) / TIMELINE_FPS;
  showPosition(video.currentTime);
}

function skipToPreviousStill() {
  if (!entries.length || !Number.isFinite(video.duration)) return;
  const contentFrame = videoFrameToContentFrame(video.currentTime * TIMELINE_FPS);
  const previousEntry = entries.findLast(
    (entry) => entry.frame < contentFrame - FRAME_BOUNDARY_EPSILON
  );
  if (!previousEntry) return;
  video.pause();
  video.currentTime = contentFrameToVideoFrame(previousEntry.frame) / TIMELINE_FPS;
  showPosition(video.currentTime);
}

previousStill.addEventListener("click", skipToPreviousStill);
nextStill.addEventListener("click", skipToNextStill);

let audioContext;

function playStepClick() {
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(900, now);
  gain.gain.setValueAtTime(0.018, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.012);
}

function stepFrame(direction) {
  if (!manifest || !Number.isFinite(video.duration)) return;
  video.pause();
  const currentVideoFrame = video.currentTime * TIMELINE_FPS;
  const currentFrame = Math.floor(
    videoFrameToContentFrame(currentVideoFrame) + FRAME_BOUNDARY_EPSILON
  );
  const maximumFrame = Math.floor(
    videoFrameToContentFrame(video.duration * TIMELINE_FPS)
  );
  const nextFrame = Math.max(
    0,
    Math.min(maximumFrame, currentFrame + direction)
  );
  if (nextFrame === currentFrame) return;
  const targetTime = Math.min(
    video.duration,
    contentFrameToVideoFrame(nextFrame + FRAME_BOUNDARY_EPSILON) / TIMELINE_FPS
  );
  video.currentTime = targetTime;
  showPosition(targetTime);
  playStepClick();
}

previousFrame.addEventListener("click", () => stepFrame(-1));
nextFrame.addEventListener("click", () => stepFrame(1));

function updatePlayPauseButton() {
  const isPlaying = !video.paused && !video.ended;
  playPauseIcon.textContent = isPlaying ? "Ⅱ" : "▶";
  playPause.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
  playPause.setAttribute("aria-pressed", String(isPlaying));
}

function togglePlayback() {
  if (video.paused || video.ended) {
    video.play().catch((error) => console.error("Unable to play video", error));
  } else {
    video.pause();
  }
}

playPause.addEventListener("click", togglePlayback);
video.addEventListener("play", updatePlayPauseButton);
video.addEventListener("pause", updatePlayPauseButton);
video.addEventListener("ended", updatePlayPauseButton);

document.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  stepFrame(event.key === "ArrowRight" ? 1 : -1);
});

function showMarkers() {
  if (!entries.length || !Number.isFinite(video.duration)) return;
  markerElements.clear();
  activeMarkerFrame = null;
  const markerNodes = entries.map((entry) => {
    const marker = document.createElement("span");
    marker.className = "marker";
    marker.dataset.frame = entry.frame;
    const time = contentFrameToVideoFrame(entry.frame) / TIMELINE_FPS;
    marker.style.left = `${Math.min(100, (time / video.duration) * 100)}%`;
    markerElements.set(entry.frame, marker);
    return marker;
  });
  markers.replaceChildren(...markerNodes);
  const currentFrame = videoFrameToContentFrame(video.currentTime * TIMELINE_FPS);
  showActiveMarker(findEntry(currentFrame)?.frame);
}

function showActiveMarker(activeFrame) {
  const normalizedFrame = activeFrame ?? null;
  if (normalizedFrame === activeMarkerFrame) return;
  markerElements.get(activeMarkerFrame)?.classList.remove("is-active");
  markerElements.get(normalizedFrame)?.classList.add("is-active");
  activeMarkerFrame = normalizedFrame;
}

hoverSurface.addEventListener("pointermove", (event) => {
  if (!Number.isFinite(video.duration)) return;
  const bounds = hoverSurface.getBoundingClientRect();
  pendingProgress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
});

function updateScrub() {
  if (pendingProgress !== null) {
    const time = pendingProgress * video.duration;
    video.currentTime = time;
    showPosition(time);
    pendingProgress = null;
  }
  requestAnimationFrame(updateScrub);
}

hoverSurface.addEventListener("pointerenter", () => video.pause());

video.addEventListener("loadedmetadata", () => {
  showPosition(0);
  showMarkers();
});
video.addEventListener("timeupdate", () => showPosition(video.currentTime));

fetch("manifest.json")
  .then((response) => response.json())
  .then((data) => {
    manifest = data;
    canvas.width = manifest.cellWidth;
    canvas.height = manifest.cellHeight;
    entries = manifest.sheets.flatMap((sheet) =>
      sheet.frames.map((frame) => ({ ...frame, sheet: sheet.src }))
    );
    showStill(video.currentTime);
    showMarkers();
  })
  .catch((error) => {
    console.error(error);
  });

requestAnimationFrame(updateScrub);
