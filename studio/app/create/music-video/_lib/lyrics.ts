import { PRESETS, type VisualCue } from "./types";

export function openingCue(prompt: string): VisualCue {
  const text = prompt.toLowerCase();
  if (/san francisco|golden gate/.test(text)) return { ...PRESETS[3], id: "san-francisco", name: "San Francisco", image: /rapper|performs/.test(text) ? "/create/music-video/san-francisco-rapper.png" : "/create/music-video/san-francisco.png", description: prompt, music: `Cinematic instrumental music inspired by: ${prompt}` };
  const preset = /city|street|neon/.test(text) ? PRESETS[3] : /sunset|golden/.test(text) ? PRESETS[2] : PRESETS[0];
  return { ...preset, description: prompt, music: `Cinematic instrumental music inspired by: ${prompt}` };
}

/** Original caption drafts remain available when the lyric service is disconnected. */
export function draftLyrics(direction: string): string[] {
  const text = direction.toLowerCase();
  if (/tiger|wild|stripe/.test(text)) return ["Wild stripes awaken in the blue", "A fearless heart comes swimming through"];
  if (/city|neon|street/.test(text)) return ["Neon rivers light the street", "The city moves beneath our feet"];
  if (/sunset|golden|amber/.test(text)) return ["The golden sky begins to glow", "We follow where the warm winds go"];
  if (/rain|storm/.test(text)) return ["The rain keeps time against the sea", "Each silver drop is calling me"];
  if (/ocean|water|wave|sea/.test(text)) return ["We ride the rhythm of the blue", "The open water carries you"];
  return ["A new world opens in the light", "We find our rhythm through the night"];
}

export function lyricLines(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== 2 || value.some(line => typeof line !== "string" || !line.trim() || line.length > 90)) throw new Error("The lyric service returned an incomplete verse.");
  return value.map(line => (line as string).replace(/[\r\n]/g, " ").trim());
}
