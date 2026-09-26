import { GoogleGenAI, type LiveMusicSession } from "@google/genai";

type Active = { owner: string; prompt: string; session: LiveMusicSession; close: () => void };
const globals = globalThis as typeof globalThis & { kriyaMusicSessions?: Map<string, Active> };
const sessions = globals.kriyaMusicSessions ||= new Map<string, Active>();
export async function steerMusic(id: string, owner: string, prompt: string) {
  const active = sessions.get(id);
  if (!active || active.owner !== owner) throw new Error("Music session expired. Start a new take.");
  await active.session.setWeightedPrompts({ weightedPrompts: [{ text: active.prompt, weight: 0.35 }, { text: prompt, weight: 0.65 }] });
}
export function stopMusic(id: string, owner: string) { const active = sessions.get(id); if (active?.owner === owner) active.close(); }
export function musicResponse(apiKey: string, owner: string, prompt: string, signal: AbortSignal) {
  for (const active of sessions.values()) if (active.owner === owner) active.close();
  if (sessions.size >= 4) throw new Error("Music sessions are busy. Please try again shortly.");
  let cleanup = () => {};
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let session: LiveMusicSession | undefined;
      const id = crypto.randomUUID();
      const send = (event: string, data: unknown) => { if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
      const close = () => {
        if (closed) return;
        closed = true; clearTimeout(timeout); clearInterval(heartbeat); signal.removeEventListener("abort", close);
        session?.close(); sessions.delete(id); try { controller.close(); } catch { /* disconnected */ }
      };
      cleanup = close;
      const timeout = setTimeout(() => { send("ended", { message: "One-minute take complete." }); close(); }, 70000);
      const heartbeat = setInterval(() => send("ping", {}), 15000);
      signal.addEventListener("abort", close, { once: true });
      send("connecting", {});
      void (async () => {
        try {
          const client = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
          session = await client.live.music.connect({ model: process.env.KRIYA_MUSIC_LIVE_MODEL || "models/lyria-realtime-exp", callbacks: {
            onmessage(message) { for (const chunk of message.serverContent?.audioChunks || []) send("audio", { data: chunk.data, mimeType: chunk.mimeType || "audio/pcm;rate=48000" }); },
            onerror() { send("error", { message: "Lyria could not stream music. Check your Gemini key and model access in Advanced." }); close(); },
            onclose() { if (!closed) { send("ended", {}); close(); } },
          } });
          if (closed || signal.aborted) { session.close(); close(); return; }
          sessions.set(id, { owner, prompt, session, close });
          await session.setWeightedPrompts({ weightedPrompts: [{ text: prompt, weight: 1 }] });
          await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: /trap/i.test(prompt) ? 144 : /rap/i.test(prompt) ? 104 : 110, density: 0.7, brightness: 0.55 } });
          await session.play(); send("ready", { id });
        } catch { send("error", { message: "Lyria is unavailable. Check your Gemini key and access, then start a new video." }); close(); }
      })();
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
