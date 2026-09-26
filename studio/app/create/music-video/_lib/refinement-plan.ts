export interface RefinementPlan {
  summary: string; saturation: number; brightness: number; contrast: number;
  warmth: number; zoom: number; pulse: number; bpm: number; glow: number;
  captions: { start: number; end: number; text: string }[];
}
export function refinementPlan(input: unknown, duration: number): RefinementPlan {
  if (!input || typeof input !== "object") throw new Error("AI did not return an edit plan.");
  const plan = input as Record<string, unknown>;
  const number = (key: string, fallback: number, min: number, max: number) => typeof plan[key] === "number" && Number.isFinite(plan[key]) ? Math.min(max, Math.max(min, plan[key] as number)) : fallback;
  let lastEnd = 0;
  const captions: RefinementPlan["captions"] = [];
  for (const item of (Array.isArray(plan.captions) ? plan.captions : []).slice(0, 50)) {
    if (!item || typeof item.text !== "string" || !Number.isFinite(item.start) || !Number.isFinite(item.end)) continue;
    const start = Math.max(lastEnd, 0, Math.min(duration, item.start));
    const end = Math.min(duration, item.end);
    const text = item.text.replace(/[\r\n]/g, " ").trim().slice(0, 80);
    if (end > start && text) { captions.push({ start, end, text }); lastEnd = end; }
  }
  return { summary: typeof plan.summary === "string" ? plan.summary.slice(0, 300) : "AI colour, motion and lyric refinement.", saturation: number("saturation", 1.12, .7, 1.5), brightness: number("brightness", 0, -10, 10), contrast: number("contrast", 8, -15, 25), warmth: number("warmth", 0, -.25, .25), zoom: number("zoom", 1.02, 1, 1.08), pulse: number("pulse", .008, 0, .025), bpm: number("bpm", 104, 60, 160), glow: number("glow", .08, 0, .2), captions };
}
