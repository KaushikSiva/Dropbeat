import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export function resolveFfmpegPath() {
  const configured = process.env.FFMPEG_PATH;
  // Prefer the self-contained binary shipped with Kriya. A Homebrew
  // executable can exist while still being unusable after one of its dylibs
  // is upgraded or removed (for example libx265).
  const candidates = [configured, ffmpegStatic, "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"].filter((item): item is string => Boolean(item));
  return candidates.find((candidate) => existsSync(candidate)) || configured || "ffmpeg";
}

export function resolveFfprobePath() {
  const configured = process.env.FFPROBE_PATH;
  // Prefer a native FFprobe installation; the npm macOS arm64 payload can require Rosetta.
  const candidates = [configured, "/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", ffprobeStatic.path].filter((item): item is string => Boolean(item));
  return candidates.find((candidate) => existsSync(candidate)) || configured || "ffprobe";
}

export async function extractCaptionAudio(input: string, output: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ resolveFfmpegPath(), ["-y", "-i", input, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", output], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"], timeout: 300000 });
    let error = "";
    child.stderr.on("data", chunk => { error = (error + chunk.toString()).slice(-1000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Could not prepare audio for captions. Check that the video has sound. ${error.slice(-200)}`)));
  });
}

export async function probeMedia(input: string) {
  const probe = resolveFfprobePath();
  return await new Promise<{ duration?: number; width?: number; height?: number; hasVideo: boolean; hasAudio: boolean }>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ probe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", input], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) { reject(new Error(`Could not inspect media. ${stderr.slice(-400)}`)); return; }
      try {
        const parsed = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>; format?: { duration?: string } };
        const video = parsed.streams?.find((stream) => stream.codec_type === "video");
        resolve({ duration: Number(parsed.format?.duration || video?.duration) || undefined, width: video?.width, height: video?.height, hasVideo: Boolean(video), hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === "audio")) });
      } catch { reject(new Error("FFprobe returned invalid media metadata.")); }
    });
  });
}
