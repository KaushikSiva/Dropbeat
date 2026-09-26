import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
export function blenderPath() {
  return [process.env.BLENDER_PATH, "/Applications/Blender.app/Contents/MacOS/Blender", "/opt/homebrew/bin/blender", "/usr/local/bin/blender"].find((file): file is string => Boolean(file && existsSync(file)));
}
export async function renderWithBlender(script: string, job: string, signal: AbortSignal) {
  const binary = blenderPath(); if (!binary) throw new Error("Blender is not installed on this Mac.");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ binary, ["--background", "--factory-startup", "--disable-autoexec", "--threads", "4", "--python-exit-code", "1", "--python", script, "--", job], { stdio: ["ignore", "pipe", "pipe"], timeout: 240000, signal });
    let detail = "";
    const collect = (chunk: Buffer) => { detail = (detail + chunk.toString()).slice(-1800); };
    child.stdout.on("data", collect); child.stderr.on("data", collect); child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Blender could not finish this edit. ${detail.slice(-500)}`)));
  });
}
