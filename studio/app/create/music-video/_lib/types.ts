export type CueKind = "subject" | "atmosphere" | "location";
export type StudioMode = "rehearsal" | "live";
export interface VisualCue {
  id: string;
  name: string;
  image: string;
  kind: CueKind;
  description: string;
  music: string;
}
export interface CueEvent extends VisualCue {
  at: number;
  status: "sent" | "accepted" | "failed";
  direction: string;
}
export interface StudioStatus {
  enabled: boolean;
  reactor: boolean;
  gemini: boolean;
  vision: boolean;
  desktop: boolean;
  blender?: boolean;
  billingConfigured: boolean;
  billingPublicKey: string;
  customerId: string;
  entitlement: string;
  settingsLocked: boolean;
}
export const ADDON = { id: "music-video", title: "Music Video", route: "/create/music-video", entitlement: "music_video_pro" } as const;
export const PRESETS: VisualCue[] = [
  { id: "ocean", name: "Open water", kind: "location", image: "/create/music-video/ocean.jpg", description: "An endless deep-blue ocean, white foam rolling in turquoise waves, an aerial camera gliding slowly above the water", music: "Dreamy ambient electronica, soft warm pads, deep rounded bass, gentle arpeggios" },
  { id: "tiger", name: "Wild instinct", kind: "subject", image: "/create/music-video/tiger.jpg", description: "A large orange Bengal tiger with black stripes is swimming in the ocean foreground. Its wet head, striped shoulders, and paddling front paws are clearly visible above the water, looking toward the camera", music: "Cinematic electronic music, low pulsing bass, organic hand percussion, mysterious atmosphere" },
  { id: "sunset", name: "Golden hour", kind: "atmosphere", image: "/create/music-video/sunset.jpg", description: "Warm amber sunset light, a glowing coral sky, soft golden reflections and dreamy cinematic haze", music: "Warm uplifting electronica, shimmering synths, mellow chords, relaxed steady groove" },
  { id: "city", name: "After dark", kind: "location", image: "/create/music-video/city.jpg", description: "A cinematic neon-lit city at night, luminous signs reflected in rain-soaked streets, a slow forward camera movement", music: "Nocturnal synthwave, analog bass, crisp electronic drums, neon atmosphere" },
];
export function buildDirection(setting: string, cue: Pick<VisualCue, "kind" | "description">) {
  const continuity = "One continuous cinematic music-video shot. Preserve the camera movement and visual continuity. No text, logos, or split screens.";
  if (cue.kind === "location") return `${continuity} Transition gradually from ${setting} into ${cue.description}.`;
  if (cue.kind === "subject") return `${continuity} Keep the current setting: ${setting}. Introduce this subject: ${cue.description}. Keep the surroundings recognizable.`;
  return `${continuity} Keep the current setting and subjects: ${setting}. Change only the atmosphere: ${cue.description}.`;
}
export function clock(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`; }
