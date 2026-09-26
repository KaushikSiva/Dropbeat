import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const run = promisify(execFile);
type Ticket = { path: string; expires: number };
const state = globalThis as typeof globalThis & { kriyaSimulatorFiles?: Map<string, Ticket>; kriyaSimulatorPicker?: boolean };
const tickets = state.kriyaSimulatorFiles ||= new Map<string, Ticket>();
function allowed(request: Request) {
  const host = new URL(request.url).hostname;
  return process.platform === "darwin" && process.env.KRIYA_IOS_SIMULATOR === "1" && !process.env.RENDER &&
    ["localhost", "127.0.0.1"].includes(host) && !request.headers.has("origin") && request.headers.get("x-kriya-simulator") === "1";
}
export async function POST(request: Request) {
  if (!allowed(request)) return Response.json({ error: "Mac import is available only in the local simulator." }, { status: 403 });
  if (state.kriyaSimulatorPicker) return Response.json({ error: "Finish the open Mac file picker first." }, { status: 409 });
  state.kriyaSimulatorPicker = true;
  try {
    // Only a file explicitly selected in the Mac picker is exposed; clients cannot supply paths.
    const { stdout } = await run("/usr/bin/osascript", ["-e", 'POSIX path of (choose file with prompt "Choose a file for Kriya in iPhone Simulator")'], { timeout: 180000 });
    const selected = stdout.replace(/\r?\n$/, "");
    const info = await stat(selected);
    if (!info.isFile() || info.size > 500 * 1024 * 1024) return Response.json({ error: "Choose a file smaller than 500 MB." }, { status: 400 });
    for (const [id, ticket] of tickets) if (ticket.expires < Date.now()) tickets.delete(id);
    const id = crypto.randomUUID(); tickets.set(id, { path: selected, expires: Date.now() + 300000 });
    return Response.json({ id, name: path.basename(selected), size: info.size }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (String((error as { stderr?: string }).stderr).includes("-128")) return Response.json({ cancelled: true });
    return Response.json({ error: "The Mac file picker could not open. Use iOS Files or try again." }, { status: 400 });
  } finally { state.kriyaSimulatorPicker = false; }
}
export async function GET(request: Request) {
  if (!allowed(request)) return new Response(null, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "", ticket = tickets.get(id);
  if (!ticket || ticket.expires < Date.now()) { tickets.delete(id); return new Response(null, { status: 404 }); }
  tickets.delete(id);
  return new Response(Readable.toWeb(createReadStream(ticket.path)) as ReadableStream, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
}
