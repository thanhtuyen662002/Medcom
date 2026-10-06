import { decodeQrFrame, MAX_FRAME_SIDE, type QrFrameResult } from "./qr-decoder";

export type QrCameraState = "starting" | "scanning" | "found" | "denied" | "unavailable" | "failed" | "invalid";
type CameraDependencies = {
  acquire: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  schedule: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  canvas: () => HTMLCanvasElement;
  decode: (data: Uint8ClampedArray, width: number, height: number) => Promise<QrFrameResult>;
  active: () => boolean;
};
const defaults: CameraDependencies = {
  acquire: constraints => navigator.mediaDevices.getUserMedia(constraints),
  schedule: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id),
  canvas: () => document.createElement("canvas"),
  decode: decodeQrFrame,
  active: () => !document.hidden,
};
const release = (stream: MediaStream) => {
  for (const track of stream.getTracks()) { try { track.stop(); } catch { /* Release all remaining tracks. */ } }
};
export function cameraFailure(error: unknown): QrCameraState {
  const name = typeof error === "object" && error !== null && "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (["NotFoundError", "NotReadableError", "OverconstrainedError", "NotSupportedError"].includes(name)) return "unavailable";
  return "failed";
}

// One scanner owns one stream. Generation fencing handles permission and decode
// promises that cannot be cancelled by the browser.
export class QrCamera {
  private generation = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frame: number | null = null;
  private surface: HTMLCanvasElement | null = null;
  private dependencies: CameraDependencies;

  constructor(dependencies: Partial<CameraDependencies> = {}) { this.dependencies = { ...defaults, ...dependencies }; }

  stop() {
    this.generation++;
    if (this.frame !== null) this.dependencies.cancel(this.frame);
    this.frame = null;
    if (this.stream) release(this.stream);
    this.stream = null;
    if (this.video) {
      try { this.video.pause(); } catch { /* Detach even if a preview failed. */ }
      this.video.srcObject = null;
    }
    this.video = null;
    if (this.surface) { this.surface.width = 0; this.surface.height = 0; }
    this.surface = null;
  }

  async start(video: HTMLVideoElement, onState: (state: QrCameraState) => void, onFound: (text: string) => void) {
    this.stop();
    const generation = this.generation;
    const current = () => generation === this.generation && this.dependencies.active();
    if (!this.dependencies.active()) return;
    onState("starting");
    try {
      const stream = await this.dependencies.acquire({ audio: false, video: {
        facingMode: { ideal: "environment" }, width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 10 },
      } });
      if (!current()) { release(stream); return; }
      this.stream = stream;
      this.video = video;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (!current()) { if (generation === this.generation) this.stop(); return; }
      const surface = this.dependencies.canvas();
      this.surface = surface;
      const context = surface.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Preview unavailable");
      onState("scanning");
      let lastScan = -Infinity;
      const next = () => { if (current()) this.frame = this.dependencies.schedule(scan); };
      const scan: FrameRequestCallback = async time => {
        this.frame = null;
        if (!current()) { if (generation === this.generation) this.stop(); return; }
        if (time - lastScan < 250 || video.readyState < 2 || !video.videoWidth || !video.videoHeight) { next(); return; }
        lastScan = time;
        try {
          const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight));
          surface.width = Math.max(1, Math.floor(video.videoWidth * scale));
          surface.height = Math.max(1, Math.floor(video.videoHeight * scale));
          context.drawImage(video, 0, 0, surface.width, surface.height);
          const pixels = context.getImageData(0, 0, surface.width, surface.height);
          const result = await this.dependencies.decode(pixels.data, surface.width, surface.height);
          if (!current()) { if (generation === this.generation) this.stop(); return; }
          if (result.kind !== "none") {
            this.stop();
            if (result.kind === "found") { onState("found"); onFound(result.text); }
            else onState("invalid");
            return;
          }
          next();
        } catch {
          if (current()) { this.stop(); onState("failed"); }
          else if (generation === this.generation) this.stop();
        }
      };
      next();
    } catch (error) {
      if (current()) { this.stop(); onState(cameraFailure(error)); }
      else if (generation === this.generation) this.stop();
    }
  }
}
