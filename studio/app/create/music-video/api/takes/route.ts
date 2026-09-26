import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { assertOrigin, isLocal } from "../../_lib/server";
import { privateRecordingStorageEnabled } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const root = () => path.join(process.env.REPROCLIP_DATA_ROOT || process.cwd(), "data", "music-video-takes");
function authorize(request: Request) {
  assertOrigin(request);
  if (!isLocal(request) || !privateRecordingStorageEnabled()) throw new Error("Desktop take storage requires a local installation.");
}
function takeId(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value)) throw new Error("Invalid take.");
  return value;
}
export async function GET(request: Request) {
  try {
    authorize(request);
    await fs.mkdir(root(), { recursive: true });
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const bytes = await fs.readFile(path.join(root(), `${takeId(id)}.media`));
      return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
    }
    const files = (await fs.readdir(root())).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
    const takes = await Promise.all(files.map(async name => JSON.parse(await fs.readFile(path.join(root(), name), "utf8"))));
    return NextResponse.json(takes, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Local takes are unavailable." }, { status: 400 }); }
}
export async function POST(request: Request) {
  try {
    authorize(request);
    if (Number(request.headers.get("content-length")) > 180 * 1024 * 1024) throw new Error("Take is too large.");
    const form = await request.formData(), media = form.get("media"), raw = form.get("metadata");
    if (!(media instanceof File) || !media.size || media.size > 170 * 1024 * 1024 || typeof raw !== "string" || raw.length > 8 * 1024 * 1024) throw new Error("Invalid take.");
    const metadata = JSON.parse(raw), id = takeId(metadata.id);
    if (typeof metadata.title !== "string" || metadata.title.length > 80 || !Array.isArray(metadata.cues) || !["rehearsal", "live"].includes(metadata.mode) || !Number.isFinite(metadata.duration)) throw new Error("Invalid take metadata.");
    await fs.mkdir(root(), { recursive: true });
    // The metadata is the commit marker: a failed media write never appears in the library.
    await fs.writeFile(path.join(root(), `${id}.media`), Buffer.from(await media.arrayBuffer()), { mode: 0o600 });
    const temporary = path.join(root(), `${id}.partial`);
    await fs.writeFile(temporary, JSON.stringify({ ...metadata, mimeType: media.type }), { mode: 0o600 });
    await fs.rename(temporary, path.join(root(), `${id}.json`));
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not save this local take. Download it to keep a copy." }, { status: 400 }); }
}
export async function DELETE(request: Request) {
  try {
    authorize(request);
    const id = takeId(new URL(request.url).searchParams.get("id"));
    await fs.rm(path.join(root(), `${id}.json`), { force: true });
    await fs.rm(path.join(root(), `${id}.media`), { force: true });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not delete this local take." }, { status: 400 }); }
}
