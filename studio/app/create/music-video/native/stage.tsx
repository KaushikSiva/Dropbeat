"use client";
import { useEffect, useRef } from "react";
import { StudioEngine, api } from "../_lib/engine";
import { openingCue } from "../_lib/lyrics";
import { buildDirection, type StudioStatus, type VisualCue, type CueEvent } from "../_lib/types";
import { saveTake } from "../_lib/storage";

type Host = Window & { webkit?: { messageHandlers?: { studio?: { postMessage: (message: unknown) => void } } }; kriyaNative?: { start: (idea: string, style: string, openingImage?: string) => Promise<void>; stop: () => void; cue: (cue: VisualCue) => Promise<void>; refine: (direction: string) => Promise<void> } };
export default function NativeStage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const host = window as Host;
    const send = (value: unknown) => host.webkit?.messageHandlers?.studio?.postMessage(value);
    let idea = "", style = "", setting = "", cues: CueEvent[] = [], status: StudioStatus | undefined, exportId = localStorage.getItem("nativeExportId") || "";
    let busy = false;
    const failure = (error: unknown) => send({ error: error instanceof Error ? error.message : "Please try again.", busy: false });
    const request = async (url: string, init: RequestInit) => {
      const response = await fetch(url, init); const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not finish this video."); return result;
    };
    async function refine(direction: string) {
      if (!exportId || busy) return;
      busy = true; send({ busy: true, message: "AI and Blender are polishing your video…" });
      try {
        const result = await request("/create/music-video/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: exportId, direction }) });
        send({ finished: result.url, message: result.summary, busy: false });
      } catch (e) { failure(e); } finally { busy = false; }
    }
    const engine = new StudioEngine(canvas.current!, send, (blob, duration) => {
      void (async () => {
        busy = true; send({ busy: true, message: "Creating your English vocal track…" });
        try {
          const take = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), title: idea.slice(0, 80), prompt: idea, style, mode: "live" as const, cues, duration, blob };
          await saveTake(take);
          if (status?.desktop) {
            const { blob: media, ...metadata } = take;
            const backup = new FormData(); backup.set("metadata", JSON.stringify(metadata)); backup.set("media", media, "live-take.webm");
            await request("/create/music-video/api/takes", { method: "POST", body: backup });
          }
          const form = new FormData(); form.set("video", blob, "take.webm"); form.set("idea", idea); form.set("style", style);
          form.set("directions", JSON.stringify(cues.map(cue => ({ at: cue.at, description: cue.description }))));
          const result = await request("/create/music-video/api/finalize", { method: "POST", body: form });
          exportId = result.id; localStorage.setItem("nativeExportId", exportId); send({ finished: result.url, message: "English vocals are ready.", busy: true });
          busy = false;
          if (status?.blender) await refine("Punchy colour, subtle glow, gentle zooms on the beat and readable English lyric captions. Keep it tasteful.");
          else send({ busy: false });
        } catch (e) { failure(e); } finally { busy = false; }
      })();
    });
    host.kriyaNative = {
      async start(prompt, genre, openingImage) {
        if (busy || engine.active) return;
        try {
          status = await api<StudioStatus>("status");
          if (!status.reactor || !status.gemini) throw new Error("Connect Orbis and Gemini in Kriya’s Advanced settings on your Mac.");
          idea = prompt; style = genre; cues = []; setting = prompt; exportId = "";
          await engine.start("live", undefined, { ...openingCue(prompt), ...(openingImage ? { image: openingImage } : {}), music: `${genre}, punchy drums, strong bass, memorable hook` });
        } catch (e) { failure(e); }
      },
      stop() { void engine.stop(); },
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
    send({ ready: true, message: "Ready. Pictures enter only when you tap or drop them during the video." });
    return () => { delete host.kriyaNative; engine.destroy(); };
  }, []);
  return <canvas ref={canvas} aria-label="Live video" style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#101412" }} />;
}
