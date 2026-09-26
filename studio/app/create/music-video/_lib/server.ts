import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sameOriginRequest } from "@/lib/local-request";
import { ADDON } from "./types";

export interface AddonSettings { reactorApiKey?: string; geminiApiKey?: string; revenuecatPublicKey?: string; revenuecatSecretKey?: string; }
const configFile = () => path.join(process.env.REPROCLIP_DATA_ROOT || process.cwd(), "data", "music-video-settings.json");
export async function settings() {
  let saved: AddonSettings = {};
  try { saved = JSON.parse(await fs.readFile(configFile(), "utf8")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  return {
    reactorApiKey: saved.reactorApiKey || process.env.REACTOR_API_KEY || "",
    geminiApiKey: saved.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
    revenuecatPublicKey: saved.revenuecatPublicKey || process.env.REVENUECAT_PUBLIC_API_KEY || "",
    revenuecatSecretKey: saved.revenuecatSecretKey || process.env.REVENUECAT_SECRET_API_KEY || "",
  };
}
export function isLocal(request: Request) {
  const host = (request.headers.get("host") || "").split(":")[0];
  return ["localhost", "127.0.0.1"].includes(host) && !process.env.RENDER;
}
export function authorizedSettings(request: Request) {
  const secret = process.env.REPROCLIP_SETTINGS_TOKEN;
  if (!secret) return isLocal(request);
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return supplied.length === secret.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}
export function assertOrigin(request: Request) {
  if (!sameOriginRequest(request)) throw new Error("This request must come from Kriya.");
  if (process.env.KRIYA_MUSIC_VIDEO_ENABLED === "0") throw new Error("Music Video is disabled.");
}
export async function saveSettings(body: Record<string, unknown>) {
  const previous = await settings();
  const next: AddonSettings = {};
  for (const key of ["reactorApiKey", "geminiApiKey", "revenuecatPublicKey", "revenuecatSecretKey"] as const) {
    if (typeof body[key] === "string" && body[key].length > 4096) throw new Error("Invalid key length.");
    next[key] = typeof body[key] === "string" && body[key].trim() ? body[key].trim() : previous[key];
  }
  await fs.mkdir(path.dirname(configFile()), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify(next), { mode: 0o600 });
  await fs.chmod(configFile(), 0o600);
}
const globalSession = globalThis as typeof globalThis & { musicVideoCookieKey?: Promise<string> };
function signingKey() {
  return globalSession.musicVideoCookieKey ||= (async () => {
    if (process.env.MUSIC_VIDEO_SESSION_SECRET) return process.env.MUSIC_VIDEO_SESSION_SECRET;
    const file = path.join(path.dirname(configFile()), "music-video-session.key");
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { await fs.writeFile(file, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return (await fs.readFile(file, "utf8")).trim();
  })();
}
async function sign(id: string) { return createHmac("sha256", await signingKey()).update(id).digest("hex"); }
export async function customer(create = false) {
  const jar = await cookies();
  const raw = jar.get("kriya-music-session")?.value || "";
  const [id, mac] = raw.split(".");
  if (id && /^[a-f0-9-]{36}$/.test(id) && mac?.length === 64 && timingSafeEqual(Buffer.from(mac), Buffer.from(await sign(id)))) return id;
  if (!create) throw new Error("Open Music Video again to start a session.");
  const next = crypto.randomUUID();
  jar.set("kriya-music-session", `${next}.${await sign(next)}`, { httpOnly: true, sameSite: "strict", secure: process.env.RENDER === "true", path: "/create/music-video", maxAge: 31536000 });
  return next;
}
export async function requireGeneration(request: Request) {
  assertOrigin(request);
  const owner = await customer();
  const config = await settings();
  // Local bring-your-own-key access is intentionally separate from a paid entitlement.
  if (isLocal(request)) return owner;
  if (!config.revenuecatSecretKey) throw new Error("Live generation is not enabled for this installation. Connect RevenueCat in Advanced.");
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(owner)}`, { headers: { Authorization: `Bearer ${config.revenuecatSecretKey}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Could not verify Music Video access. Try again.");
  const body = await response.json();
  const entitlement = body.subscriber?.entitlements?.[ADDON.entitlement];
  if (!entitlement || (entitlement.expires_date && Date.parse(entitlement.expires_date) <= Date.now())) throw new Error("Music Video Pro is required for live generation. Open Studio access to view your plan.");
  return owner;
}
export function boundedText(value: unknown, max = 1800) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Please enter a shorter direction.");
  return value.trim();
}
