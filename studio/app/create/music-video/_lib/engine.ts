import type { Reactor } from "@reactor-team/js-sdk";
import { PRESETS, type StudioMode, type VisualCue } from "./types";

export async function api<T = Record<string, unknown>>(action: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/create/music-video/api/${action}`, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not complete the request.");
  return result as T;
}
export async function imageData(file: File): Promise<string> {
  if ((!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) || file.size > 12 * 1024 * 1024) throw new Error("Choose a picture under 12 MB (JPG, PNG or WebP works everywhere).");
  const canvas = document.createElement("canvas");
  let source: ImageBitmap | HTMLImageElement;
  let url = "";
  try {
    try { source = await createImageBitmap(file); }
    catch { const image = new Image(); url = URL.createObjectURL(file); image.src = url; await image.decode(); source = image; }
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const scale = Math.min(1, 1200 / Math.max(width, height));
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ("close" in source) source.close();
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch { throw new Error("This picture could not be decoded. Export it as JPG or PNG, or use a preloaded picture."); }
  finally { if (url) URL.revokeObjectURL(url); }
}
export type EngineEvent = { vocalLyrics?: string[]; phase?: "connecting" | "playing" | "stopped"; message?: string; time?: number; audioReady?: boolean; };
export class StudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private vocalScene = "";
  private voiceAt = 0;
  private vocalRevision = 0;
  private destination?: MediaStreamAudioDestinationNode;
  private reactor?: Reactor;
  private abort?: AbortController;
  private musicId?: string;
  private video = document.createElement("video");
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private animation = 0;
  private timer?: ReturnType<typeof setInterval>;
  private timeout?: ReturnType<typeof setTimeout>;
  private startedAt = 0;
  private nextNote = 0;
  private beat = 0;
  private pcmAt = 0;
  private playing = false;
  private closing = false;
  private image?: HTMLImageElement;
  private previousImage?: HTMLImageElement;
  private changedAt = 0;
  private mood = "ocean";
  private mode: StudioMode = "rehearsal";
  private track?: AudioBufferSourceNode;
  private previewWindow?: Window;
  private imageGeneration = 0;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private tick = 0;
  constructor(private canvas: HTMLCanvasElement, private onEvent: (event: EngineEvent) => void, private onFinish: (blob: Blob, seconds: number) => void) {
    canvas.width = 1280; canvas.height = 720;
    this.video.muted = true; this.video.playsInline = true;
    void this.setImage(PRESETS[0].image);
    this.draw();
  }
  get elapsed() { return this.playing ? (performance.now() - this.startedAt) / 1000 : 0; }
  get active() { return this.playing || Boolean(this.abort); }
  setVolume(value: number) { if (this.master && this.context) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.03); }
  async setImage(url: string) {
    const epoch = ++this.imageGeneration;
    const image = new Image(); image.src = url;
    await image.decode();
    if (epoch !== this.imageGeneration) return;
    this.previousImage = this.image; this.image = image; this.changedAt = performance.now();
  }
  private draw = () => {
    const ctx = this.canvas.getContext("2d")!;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.fillStyle = "#111a1c"; ctx.fillRect(0, 0, w, h);
    const drawImage = (source: CanvasImageSource, sw: number, sh: number, alpha = 1) => {
      const drift = this.playing && this.mode === "rehearsal" && !this.reducedMotion ? 1.025 + Math.sin(performance.now() / 9500) * 0.025 : 1;
      const scale = Math.max(w / sw, h / sh) * drift;
      ctx.globalAlpha = alpha; ctx.drawImage(source, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale); ctx.globalAlpha = 1;
    };
    if (this.mode === "live" && this.video.readyState >= 2) drawImage(this.video, this.video.videoWidth, this.video.videoHeight);
    else {
      const fade = this.reducedMotion ? 1 : Math.min(1, (performance.now() - this.changedAt) / 1000);
      if (this.previousImage) drawImage(this.previousImage, this.previousImage.naturalWidth, this.previousImage.naturalHeight);
      if (this.image) drawImage(this.image, this.image.naturalWidth, this.image.naturalHeight, fade);
    }
    if (this.playing && performance.now() - this.tick > 150) { this.tick = performance.now(); this.onEvent({ time: this.elapsed }); }
    this.animation = requestAnimationFrame(this.draw);
  };
  async start(mode: StudioMode, soundtrack?: File, opening: VisualCue = PRESETS[0]) {
    if (this.active) return;
    this.closing = false; this.mode = mode; this.chunks = []; this.beat = 0;
    const abort = this.abort = new AbortController();
    const context = this.context = new AudioContext(); await context.resume();
    if (abort.signal.aborted) return;
    this.master = context.createGain(); this.master.gain.value = 0.7;
    this.musicGain = context.createGain(); this.musicGain.gain.value = 0.55; this.musicGain.connect(this.master);
    this.vocalScene = opening.description; this.voiceAt = 0; this.vocalRevision++;
    this.destination = context.createMediaStreamDestination();
    this.master.connect(context.destination); this.master.connect(this.destination);
    this.onEvent({ phase: "connecting", message: mode === "live" ? "Connecting to Orbis. First frames can take a few minutes…" : "Preparing your preview…" });
    let trackBuffer: AudioBuffer | undefined;
    try {
      if (soundtrack) trackBuffer = await context.decodeAudioData(await soundtrack.arrayBuffer());
      if (abort.signal.aborted) return;
      if (mode === "live") {
        const { jwt } = await api<{ jwt: string }>("token", {}, abort.signal);
        if (abort.signal.aborted) return;
        const { Reactor } = await import("@reactor-team/js-sdk");
        if (abort.signal.aborted) return;
        const client = this.reactor = new Reactor({ modelName: "reactor/visko-orbis-dynamic", jwt, readyTimeoutMs: 240000, controlRequestTimeoutMs: 90000, modelTracks: [{ name: "main_video", kind: "video", direction: "recvonly" }, { name: "main_audio", kind: "audio", direction: "recvonly" }], logLevel: "error" });
        client.on("error", () => { this.onEvent({ message: "Orbis reported a connection error. Your recorded footage is kept when you finish." }); });
        client.on("trackReceived", (name, _track, stream) => { if (name === "main_video") { this.video.srcObject = stream; void this.video.play().catch(() => this.onEvent({ message: "Video playback was blocked. Stop and start the take again." })); } });
        client.on("message", (message) => { if (message.type === "generation_complete" && !this.closing) void this.stop(); });
        await client.connect();
        if (abort.signal.aborted) return;
        const blob = await fetch(opening.image).then(r => r.blob());
        const file = await client.uploadFile(blob, { name: "ocean.jpg" });
        if (abort.signal.aborted) return;
        await client.sendCommand("set_image", { image: file });
        if (abort.signal.aborted) return;
        await client.sendCommand("set_prompt", { prompt: `${opening.description}. Cinematic music video, continuous motion, no cuts or text.` });
        if (abort.signal.aborted) return;
        await client.sendCommand("start", {});
        if (abort.signal.aborted) return;
        await this.waitForVideo(abort.signal);
        if (!soundtrack) void this.startMusic(abort.signal, opening.music);
      }
      if (abort.signal.aborted) return;
      this.playing = true; this.startedAt = performance.now();
      if (trackBuffer) {
        this.track = context.createBufferSource(); this.track.buffer = trackBuffer; this.track.connect(this.master); this.track.start();
        this.track.onended = () => { if (!this.closing) void this.stop(); };
        this.onEvent({ audioReady: true });
      } else if (mode === "rehearsal") {
        this.nextNote = context.currentTime + 0.05;
        this.timer = setInterval(() => this.synth(), 80);
        this.onEvent({ audioReady: true });
      }
      const stream = this.canvas.captureStream(30);
      for (const audio of this.destination.stream.getAudioTracks()) stream.addTrack(audio);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Recording is unavailable in this browser. Try Chrome or the Kriya desktop app.");
      this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5500000 });
      this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      this.recorder.onerror = () => { this.onEvent({ message: "Recording encountered an error. Finish the take to recover available footage." }); };
      this.recorder.start(1000);
      if (mode === "live" && !soundtrack) void this.liveVocals(abort.signal);
      this.timeout = setTimeout(() => { void this.stop(); }, 60000);
      this.onEvent({ phase: "playing", message: mode === "live" ? "Orbis is live. Drop a picture to direct the next moments." : "Local preview playing. Connect AI in Advanced for generated footage." });
    } catch (e) { if (abort.signal.aborted) return; await this.stop(); throw e; }
  }
  private waitForVideo(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const poll = setInterval(() => { if (this.video.readyState >= 2 && this.video.videoWidth) { clearInterval(poll); clearTimeout(timeout); resolve(); } }, 100);
      const timeout = setTimeout(() => { clearInterval(poll); reject(new Error("Orbis did not deliver video. It may be at capacity; try another take.")); }, 240000);
      signal.addEventListener("abort", () => { clearInterval(poll); clearTimeout(timeout); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
    });
  }
  async cue(cue: VisualCue, direction: string) {
    if (!this.playing) { await this.setImage(cue.image); return; }
    this.mood = cue.id;
    if (this.mode === "rehearsal") { await this.setImage(cue.image); return; }
    if (!this.reactor) throw new Error("Orbis is disconnected.");
    await this.reactor.sendCommand("set_prompt", { prompt: direction, passthrough: true });
    this.vocalScene = direction; this.vocalRevision++;
    if (this.musicId) {
      try { await api("music-steer", { id: this.musicId, prompt: cue.music }); }
      catch { this.onEvent({ message: "Visual direction accepted; music direction failed. Finish and retry to reconnect music." }); }
    }
  }
  private async startMusic(signal: AbortSignal, prompt: string) {
    try {
      const response = await fetch("/create/music-video/api/music", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }), signal });
      if (!response.ok || !response.body) { const body = await response.json(); throw new Error(body.error || "Music stream unavailable."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
      while (!signal.aborted) {
        const { done, value } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        let boundary: number;
        while ((boundary = pending.indexOf("\n\n")) >= 0) {
          const event = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
          const kind = event.split("\n").find(l => l.startsWith("event: "))?.slice(7);
          const data = JSON.parse(event.split("\n").find(l => l.startsWith("data: "))?.slice(6) || "{}");
          if (kind === "ready") this.musicId = data.id;
          if (kind === "audio") { this.pcm(data.data, data.mimeType); this.onEvent({ audioReady: true }); }
          if (kind === "error") throw new Error(data.message);
          if (kind === "ended" && !signal.aborted) this.onEvent({ message: "Music stream ended. Finish this take to save the available soundtrack." });
        }
      }
    } catch (e) { if (!signal.aborted) this.onEvent({ message: e instanceof Error ? e.message : "Music unavailable. Import a soundtrack for the next take." }); }
  }
  private async liveVocals(signal: AbortSignal) {
    let previous = "";
    while (this.playing && !signal.aborted) {
      const revision = this.vocalRevision;
      try {
        const response = await fetch("/create/music-video/api/vocals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction: this.vocalScene.slice(0, 1800), previous }), signal });
        if (!response.ok || !response.body) throw new Error("Live voice could not connect. The instrumental will continue.");
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let pending = "", lines: string[] = [], voiced = false;
        while (!signal.aborted) {
          const { done, value } = await reader.read(); if (done) break;
          // Discard an obsolete phrase before its first sound; never interrupt one already speaking.
          if (!voiced && revision !== this.vocalRevision) { await reader.cancel(); break; }
          pending += decoder.decode(value, { stream: true });
          let boundary: number;
          while ((boundary = pending.indexOf("\n\n")) >= 0) {
            const block = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
            const kind = block.match(/^event: (.+)$/m)?.[1];
            const raw = block.match(/^data: (.+)$/m)?.[1]; if (!raw) continue;
            const data = JSON.parse(raw);
            if (kind === "error") throw new Error(data.message);
            if (kind === "lyrics") lines = data.lines;
            if (kind === "audio" && this.context && this.master && this.playing) {
              if (!voiced) { this.onEvent({ vocalLyrics: lines }); previous = lines.join(" "); voiced = true; }
              const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
              const view = new DataView(bytes.buffer), frames = Math.floor(bytes.length / 2);
              if (!frames) continue;
              const buffer = this.context.createBuffer(1, frames, 24000), pcm = buffer.getChannelData(0);
              for (let i = 0; i < frames; i++) pcm[i] = view.getInt16(i * 2, true) / 32768;
              const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.master);
              this.voiceAt = Math.max(this.voiceAt, this.context.currentTime + 0.08);
              source.start(this.voiceAt); this.voiceAt += buffer.duration;
            }
          }
        }
        while (this.context && this.playing && !signal.aborted && this.context.currentTime < this.voiceAt + 0.2) await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        if (!signal.aborted) this.onEvent({ message: error instanceof Error ? error.message : "Live voice unavailable. The instrumental continues." });
        break;
      }
    }
  }
  private pcm(base64: string, mime: string) {
    const context = this.context; if (!context || context.state === "closed" || !this.master) return;
    const raw = atob(base64), view = new DataView(Uint8Array.from(raw, c => c.charCodeAt(0)).buffer);
    const frames = Math.floor(raw.length / 4); if (!frames) return;
    const rate = Number(mime.match(/rate=(\d+)/)?.[1]) || 48000;
    const buffer = context.createBuffer(2, frames, rate);
    for (let ch = 0; ch < 2; ch++) { const data = buffer.getChannelData(ch); for (let i = 0; i < frames; i++) data[i] = view.getInt16((i * 2 + ch) * 2, true) / 32768; }
    const source = context.createBufferSource(); source.buffer = buffer; source.connect(this.musicGain || this.master);
    this.pcmAt = Math.max(this.pcmAt, context.currentTime + 0.08);
    if (this.pcmAt - context.currentTime > 8) this.pcmAt = context.currentTime + 0.1;
    source.start(this.pcmAt); this.pcmAt += buffer.duration;
  }
  private synth() {
    const context = this.context; if (!context || !this.master) return;
    const notes = [130.81, 155.56, 196, 233.08, 261.63, 233.08, 196, 155.56];
    while (this.nextNote < context.currentTime + 0.2) {
      const t = this.nextNote, freq = notes[this.beat % notes.length];
      const tone = context.createOscillator(), gain = context.createGain();
      tone.type = this.mood === "city" ? "triangle" : "sine"; tone.frequency.value = freq * (this.beat % 3 === 0 ? 2 : 1);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.065, t + 0.025); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      tone.connect(gain).connect(this.master); tone.start(t); tone.stop(t + 0.6);
      if (this.beat % 2 === 0) {
        const bass = context.createOscillator(), envelope = context.createGain(); bass.frequency.setValueAtTime(110, t); bass.frequency.exponentialRampToValueAtTime(43, t + 0.18);
        envelope.gain.setValueAtTime(this.mood === "tiger" ? 0.22 : 0.13, t); envelope.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        bass.connect(envelope).connect(this.master); bass.start(t); bass.stop(t + 0.3);
      }
      this.beat++; this.nextNote += 60 / 96 / 2;
    }
  }
  openPreview() {
    const popup = window.open("", "kriya-music-preview", "width=1100,height=700");
    if (!popup) throw new Error("Allow pop-ups to open the second-screen preview.");
    this.previewWindow = popup;
    popup.document.title = "Kriya · Music Video preview";
    popup.document.body.style.cssText = "margin:0;background:#090b0c;display:grid;place-items:center;height:100vh;overflow:hidden";
    popup.document.body.replaceChildren();
    const video = popup.document.createElement("video"); video.autoplay = true; video.muted = true; video.playsInline = true; video.style.cssText = "width:100%;height:100%;object-fit:contain"; video.srcObject = this.canvas.captureStream(24); popup.document.body.append(video);
    popup.onbeforeunload = () => (video.srcObject as MediaStream)?.getTracks().forEach(track => track.stop());
    void video.play(); popup.opener = null;
  }
  async stop() {
    if (this.closing) return;
    this.closing = true;
    const seconds = this.elapsed; this.playing = false;
    clearInterval(this.timer); clearTimeout(this.timeout);
    this.abort?.abort(); this.abort = undefined;
    if (this.musicId) { void api("music-stop", { id: this.musicId }).catch(() => {}); this.musicId = undefined; }
    const reactor = this.reactor; this.reactor = undefined;
    void reactor?.disconnect().catch(() => {});
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>(resolve => { recorder.onstop = () => { const blob = new Blob(this.chunks, { type: recorder.mimeType }); if (blob.size) this.onFinish(blob, seconds); recorder.stream.getTracks().forEach(track => track.stop()); resolve(); }; recorder.stop(); });
    }
    this.recorder = undefined; this.track?.stop(); this.track = undefined;
    this.video.pause(); this.video.srcObject = null;
    await this.context?.close().catch(() => {}); this.context = undefined; this.pcmAt = 0;
    this.onEvent({ phase: "stopped", audioReady: false });
  }
  destroy() { cancelAnimationFrame(this.animation); this.previewWindow?.close(); void this.stop(); }
}
