"use client";
import { useEffect, useRef } from "react";
import { StudioEngine, api } from "../_lib/engine";
import { openingCue } from "../_lib/lyrics";
import { buildDirection, type StudioStatus, type VisualCue, type CueEvent } from "../_lib/types";
import { listTakes, saveTake, type SavedTake } from "../_lib/storage";

type Host = Window & { webkit?: { messageHandlers?: { studio?: { postMessage: (message: unknown) => void } } }; kriyaNative?: { start: (idea: string, style: string, openingImage?: string) => Promise<void>; stop: () => void; retry: () => Promise<void>; cue: (cue: VisualCue) => Promise<void>; refine: (direction: string) => Promise<void> } };
export default function NativeStage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const host = window as Host;
    const send = (value: unknown) => host.webkit?.messageHandlers?.studio?.postMessage(value);
    let idea = "", style = "", setting = "", cues: CueEvent[] = [], status: StudioStatus | undefined, exportId = localStorage.getItem("nativeExportId") || "";
    let busy = false;
    let pending: SavedTake | undefined;
    const failure = (error: unknown) => send({ error: error instanceof Error ? error.message : "Please try again.", busy: false, canRetry: Boolean(pending || localStorage.getItem("nativePendingTake")) });
    const request = async (url: string, init: RequestInit) => {
      const response = await fetch(url, init); const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not finish this video."); return result;
    };
    async function refine(direction: string) {
      if (!exportId || busy) return;
      busy = true; send({ busy: true, message: "AI and Blender are polishing your video…" });
      try {
        const result = await request("/create/music-video/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: exportId, direction }) });
        localStorage.setItem("nativeFinishedURL", result.url);
        send({ finished: result.url, message: result.summary, completionNote: "", busy: true });
      } catch (e) { failure(e); } finally { busy = false; }
    }
    async function finish(take: SavedTake) {
      if (busy) return;
      busy = true;
      send({ busy: true, canRetry: false, message: "Saving your recording…" });
      let saved = false;
      try {
        await saveTake(take);
        saved = true;
        localStorage.setItem("nativePendingTake", take.id);
        // Keep a second copy on the Mac; a backup failure must not block the song.
        if (status?.desktop) {
          try {
            const { blob: media, ...metadata } = take;
            const backup = new FormData(); backup.set("metadata", JSON.stringify(metadata)); backup.set("media", media, "live-take.webm");
            await request("/create/music-video/api/takes", { method: "POST", body: backup });
          } catch { /* The committed local take remains available for retry. */ }
        }
        let result: { id: string; url: string } | undefined;
        for (let attempt = 1; attempt <= 3; attempt++) {
          send({ busy: true, message: `Recording saved. Creating your song — attempt ${attempt} of 3…` });
          try {
            const form = new FormData(); form.set("video", take.blob, "take.webm"); form.set("idea", take.prompt || take.title); form.set("style", take.style || "High-energy rap");
            form.set("directions", JSON.stringify(take.cues.map(cue => ({ at: cue.at, description: cue.description }))));
            result = await request("/create/music-video/api/finalize", { method: "POST", body: form });
            break;
          } catch {
            if (attempt === 3) throw new Error("Song generation failed after 3 attempts. Your recording is saved. Tap Retry song; you don’t need to record again.");
            send({ message: "Recording saved. The song failed; retrying automatically…" });
            await new Promise(resolve => setTimeout(resolve, attempt * 3000));
          }
        }
        if (!result) throw new Error("Could not finish your song.");
        exportId = result.id; localStorage.setItem("nativeExportId", exportId);
        let finalURL = result.url;
        let note = "";
        if (status?.blender) {
          send({ message: "Song ready. AI and Blender are polishing your video…" });
          try {
            const polished = await request("/create/music-video/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: exportId, direction: "Punchy colour, subtle glow, gentle zooms on the beat and readable English lyric captions. Keep it tasteful." }) });
            finalURL = polished.url;
          } catch { note = "Blender polish failed. Your video with the finished song is ready."; }
        }
        // Retain the download URL across app restarts and failed transfers.
        localStorage.setItem("nativeFinishedURL", finalURL);
        localStorage.removeItem("nativePendingTake"); pending = undefined;
        send({ finished: finalURL, busy: true, canRetry: false, message: note || "Video ready. Saving it to this device…", completionNote: note });
      } catch (error) {
        send({ busy: false, canRetry: true, error: saved ? (error instanceof Error ? error.message : "Your recording is saved. Tap Retry song.") : "Could not save the recording. Keep the app open and tap Retry song." });
      } finally { busy = false; }
    }
    const engine = new StudioEngine(canvas.current!, send, (blob, duration) => {
      pending = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), title: idea.slice(0, 80), prompt: idea, style, mode: "live", cues: [...cues], duration, blob };
      void finish(pending);
    });
    host.kriyaNative = {
      async start(prompt, genre, openingImage) {
        if (busy || engine.active) return;
        try {
          status = await api<StudioStatus>("status");
          if (!status.reactor || !status.gemini) throw new Error("Connect Orbis and Gemini in Kriya’s Advanced settings on your Mac.");
          localStorage.removeItem("nativeFinishedURL"); localStorage.removeItem("nativePendingTake"); pending = undefined;
          idea = prompt; style = genre; cues = []; setting = prompt; exportId = "";
          await engine.start("live", undefined, { ...openingCue(prompt), ...(openingImage ? { image: openingImage } : {}), music: `${genre}, punchy drums, strong bass, memorable hook` });
        } catch (e) { failure(e); }
      },
      stop() { void engine.stop(); },
      async retry() {
        if (busy || engine.active) return;
        try {
          if (!pending) {
            const id = localStorage.getItem("nativePendingTake");
            pending = (await listTakes()).find(take => take.id === id);
          }
          if (!pending) throw new Error("No unfinished recording was found on this device.");
          status = await api<StudioStatus>("status");
          await finish(pending);
        } catch (error) { failure(error); }
      },
      async cue(cue: VisualCue & { requestId?: string }) {
        const requestId = cue.requestId;
        const feedback = (cueState: string, cueMessage: string) => send({ requestId, cueState, cueMessage });
        if (!engine.active || busy) { feedback("failed", "The video is no longer playing. Start another take."); return; }
        feedback("pending", `${cue.name} received — sending to the scene…`);
        try {
          if (cue.image.startsWith("data:")) {
            const interpreted = await api<Partial<VisualCue>>("interpret", { image: cue.image, name: cue.name });
            cue = { ...cue, ...interpreted, id: cue.id, name: cue.name, description: `${cue.name}: ${interpreted.description || cue.description}`.slice(0, 1200), image: cue.image };
          }
          if (!engine.active || busy) { feedback("failed", "The video finished before this picture could be added."); return; }
          const direction = buildDirection(setting, cue);
          await engine.cue(cue, direction);
          cues.push({ ...cue, at: engine.elapsed, direction, status: "accepted" });
          if (cue.kind === "location") setting = cue.description;
          else if (cue.kind === "subject") setting = `${setting}. ${cue.description}`.slice(-1200);
          feedback("accepted", `${cue.name} accepted — watch the next moments.`);
          send({ message: `${cue.name} added to your video.` });
        } catch (e) { feedback("failed", `Could not add ${cue.name}. Try again.`); send({ message: e instanceof Error ? e.message : "Could not send this direction." }); }
      }, refine,
    };
    let disposed = false;
    void (async () => {
      const finishedURL = localStorage.getItem("nativeFinishedURL");
      // Recover recordings made before retry support was added, too.
      if (!finishedURL && !localStorage.getItem("nativePendingTake")) {
        try {
          const latest = (await listTakes())[0];
          if (latest && !disposed) localStorage.setItem("nativePendingTake", latest.id);
        } catch { /* A fresh library has nothing to recover. */ }
      }
      if (disposed) return;
      const unfinished = Boolean(localStorage.getItem("nativePendingTake"));
      send({ ready: true, canRetry: unfinished, message: unfinished ? "Your recording is saved. Tap Retry song to finish it." : "1. Enter an idea. 2. Start and drop pictures. 3. Finish, then watch or export." });
      if (!unfinished && finishedURL) send({ finished: finishedURL, busy: true, message: "Restoring your saved video…" });
    })();
    return () => { disposed = true; delete host.kriyaNative; engine.destroy(); };
  }, []);
  return <canvas ref={canvas} aria-label="Live video" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#101412" }} />;
}
