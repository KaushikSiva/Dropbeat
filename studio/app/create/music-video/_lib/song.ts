import { spawn } from "node:child_process";
import { resolveFfmpegPath } from "@/lib/ffmpeg";

export async function composeSong(key: string, prompt: string, seconds: number, signal: AbortSignal) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.KRIYA_MUSIC_SONG_MODEL || "lyria-3.5", input: `Create an original ${seconds}-second song with English vocals. Finish with a clean musical ending at ${seconds} seconds. ${prompt}` }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(240000)]),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Vocal generation unavailable (${response.status}). ${String(error.error?.message || "Check Gemini model access and billing in Advanced.").slice(0, 300)}`);
  }
  const result = await response.json();
  const blocks = (result.steps || []).filter((step: { type?: string }) => step.type === "model_output").flatMap((step: { content?: unknown[] }) => step.content || []);
  const audio = result.output_audio || blocks.findLast((block: { type?: string }) => block.type === "audio");
  if (!audio?.data) throw new Error("Lyria did not return a song. Your original video is still saved.");
  const lyrics = result.output_text || blocks.filter((block: { type?: string }) => block.type === "text").map((block: { text?: string }) => block.text || "").join("\n");
  return { audio: Buffer.from(audio.data, "base64"), lyrics: String(lyrics) };
}

export async function encode(args: string[], signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ resolveFfmpegPath(), ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: 180000, signal });
    let detail = "";
    child.stderr.on("data", chunk => { detail = (detail + chunk.toString()).slice(-1500); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Could not assemble the video (${code}). ${detail.slice(-250)}`)));
  });
}
