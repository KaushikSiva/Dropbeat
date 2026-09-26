"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, Play, Plus, Settings2, Square, Trash2, X } from "lucide-react";
import { MusicVideoAdvanced } from "./advanced";
import { useDialogFocus } from "./dialog-focus";
import { StudioAccess } from "./billing";
import { api, imageData, StudioEngine } from "../_lib/engine";
import { draftLyrics, openingCue } from "../_lib/lyrics";
import { deleteTake, listTakes, saveTake, listPictures, savePicture, type SavedTake } from "../_lib/storage";
import { buildDirection, clock, PRESETS, type CueEvent, type StudioMode, type StudioStatus, type VisualCue } from "../_lib/types";
import "./studio.css";

export default function MusicVideoStudio() {
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<StudioEngine | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<StudioStatus>();
  const [phase, setPhase] = useState("stopped"), [elapsed, setElapsed] = useState(0);
  const [prompt, setPrompt] = useState("Create a one-minute, high-energy English rap music video. An original rapper performs on a San Francisco waterfront promenade, with the Golden Gate Bridge behind him in warm morning light. The song celebrates YC founders: bold ideas, building fast, learning from failure, and making something people want. Use punchy drums, deep bass, clever original rhymes, and a catchy “build, launch, repeat” hook. Keep the rapper visible as the camera moves smoothly around him");
  const [style, setStyle] = useState("High-energy rap"), styleRef = useRef("High-energy rap"), promptRef = useRef("");
  const [finalizing, setFinalizing] = useState(false);
  const [refineText, setRefineText] = useState("");
  const finishAutomatically = useRef<(take: SavedTake) => void>(() => {});
  const [direction, setDirection] = useState(""), [notice, setNotice] = useState("");
  const [cueFeedback, setCueFeedback] = useState<{ state: string; text: string; id?: string }>();
  const [library, setLibrary] = useState<VisualCue[]>(PRESETS);
  const [advanced, setAdvanced] = useState(false), [access, setAccess] = useState(false);
  const [dragging, setDragging] = useState(false), [sending, setSending] = useState(false), [loadingImage, setLoadingImage] = useState(false);
  const [events, setEvents] = useState<CueEvent[]>([]), eventsRef = useRef<CueEvent[]>([]);
  const [lyrics, setLyrics] = useState<string[]>([]), lyricsVersion = useRef(0), lyricRequest = useRef<AbortController | null>(null);
  const [takes, setTakes] = useState<SavedTake[]>([]), [selected, setSelected] = useState<SavedTake>();
  const [playback, setPlayback] = useState(""), [sample, setSample] = useState(false), [saving, setSaving] = useState(false);
  const mode = useRef<StudioMode>("rehearsal"), setting = useRef(""), currentImage = useRef(PRESETS[0].image), title = useRef("Music video");
  const busy = phase === "connecting" || phase === "playing" || finalizing, playing = phase === "playing";
  const connected = Boolean(status?.reactor && status?.gemini);
  useDialogFocus(advanced);
  const cancelLyrics = useCallback(() => { lyricsVersion.current++; lyricRequest.current?.abort(); }, []);
  const refresh = useCallback(() => { void api<StudioStatus>("status").then(setStatus).catch(() => setNotice("Could not check AI connections. Open Advanced to retry.")); }, []);
  useEffect(() => {
    refresh(); void listPictures().then(items => setLibrary([...PRESETS, ...items])).catch(() => {});
    void listTakes().then(setTakes).catch(() => setNotice("Device storage is unavailable. Download finished videos to keep them."));
    if (!canvas.current) return;
    const current = engine.current = new StudioEngine(canvas.current, event => {
      if (event.vocalLyrics) setLyrics(event.vocalLyrics);
      if (event.phase) setPhase(event.phase);
      if (event.time !== undefined) setElapsed(event.time);
      if (event.message) setNotice(event.message);
    }, (blob, duration) => {
      const take: SavedTake = { id: crypto.randomUUID(), title: title.current, createdAt: new Date().toISOString(), duration, mode: mode.current, cues: [...eventsRef.current], blob, prompt: promptRef.current, style: styleRef.current };
      setSelected(take); setTakes(previous => [take, ...previous]);
      void saveTake(take).then(() => { setNotice("Your recording is saved."); finishAutomatically.current(take); }).catch(() => setNotice("Storage is full. Download this video now to keep it."));
    });
    return () => { cancelLyrics(); current.destroy(); engine.current = null; };
  }, [refresh, cancelLyrics]);
  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => {
    if (!selected) { setPlayback(""); return; }
    const url = URL.createObjectURL(selected.blob); setPlayback(url); return () => URL.revokeObjectURL(url);
  }, [selected]);
  useEffect(() => {
    if (!busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect);
  }, [busy]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setAdvanced(false); setAccess(false); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, []);

  async function updateLyrics(scene: string) {
    const version = ++lyricsVersion.current;
    lyricRequest.current?.abort(); const request = lyricRequest.current = new AbortController();
    const draft = draftLyrics(scene.split(". Current scene:")[0]); setLyrics(draft);
    if (!status?.gemini) return;
    try {
      const result = await api<{ lines: string[] }>("lyrics", { direction: `${styleRef.current}. ${scene}`.slice(0, 1800) }, request.signal);
      if (version === lyricsVersion.current) { setLyrics(result.lines); }
    } catch {
      if (!request.signal.aborted && version === lyricsVersion.current) setNotice("The lyric service is unavailable. Original draft captions are still visible.");
    }
  }
  async function start() {
    if (!engine.current || !prompt.trim() || !status || busy) return;
    setSelected(undefined); setSample(false); setEvents([]); eventsRef.current = []; setElapsed(0);
    const opening = openingCue(prompt.trim()); setting.current = opening.description; currentImage.current = opening.image;
    promptRef.current = prompt.trim(); styleRef.current = style;
    opening.music = `${style}. Punchy drums, strong bass, a memorable instrumental groove.`;
    title.current = prompt.trim().split(/[.!?]/)[0].slice(0, 70) || "Music video";
    mode.current = connected ? "live" : "rehearsal";
    setCueFeedback(undefined); setPhase("connecting"); setNotice(connected ? "Starting your video. First AI frames can take a few minutes." : "Starting a local picture preview. Connect AI in Advanced for generated footage.");
    setLyrics([]); if (!connected) void updateLyrics(opening.description);
    try { await engine.current.setImage(opening.image); await engine.current.start(mode.current, undefined, opening); }
    catch (error) { if ((error as Error).name !== "AbortError") setNotice(error instanceof Error ? error.message : "Could not start the video."); setPhase("stopped"); }
  }
  async function finish() { cancelLyrics(); await engine.current?.stop(); }
  async function send(cue: VisualCue) {
    if (!playing) { const text = "Start your video, then drag a picture onto it or tap a picture to steer."; setNotice(text); setCueFeedback({ state: "failed", text }); return; }
    if (sending) return;
    setSending(true);
    setCueFeedback({ state: "pending", text: `${cue.name} received — sending to the scene…`, id: cue.id });
    const id = crypto.randomUUID(), text = buildDirection(setting.current, cue);
    const event: CueEvent = { ...cue, id, at: engine.current?.elapsed || 0, status: "sent", direction: text };
    setEvents(previous => [...previous, event]);
    try {
      await engine.current?.cue(cue, text); currentImage.current = cue.image;
      if (cue.kind === "location") setting.current = cue.description;
      else if (cue.kind === "subject") setting.current = `${setting.current}. ${cue.description}`.slice(-1200);
      setEvents(previous => previous.map(item => item.id === id ? { ...item, status: "accepted" } : item));
      setCueFeedback({ state: "accepted", text: `${cue.name} accepted — watch the next moments.`, id: cue.id });
      setNotice(`“${cue.name}” sent. The next moments and English lyrics follow your direction.`);
      if (mode.current !== "live") void updateLyrics(`New direction: ${cue.description}. Current scene: ${setting.current}`);
    } catch (error) {
      setEvents(previous => previous.map(item => item.id === id ? { ...item, status: "failed" } : item));
      setCueFeedback({ state: "failed", text: `Could not add ${cue.name}. Try again.`, id: cue.id });
      setNotice(error instanceof Error ? error.message : "Could not send that direction. Try again.");
    } finally { setSending(false); }
  }
  function sendText(text: string) {
    const value = text.trim().slice(0, 1200); if (!value) return;
    void send({ id: crypto.randomUUID(), name: value.slice(0, 45), description: value, kind: "atmosphere", image: currentImage.current, music: `Cinematic instrumental music reflecting: ${value}` });
    setDirection("");
  }
  async function upload(file?: File) {
    if (!file) return;
    setLoadingImage(true);
    try {
      const image = await imageData(file);
      const cue: VisualCue = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, "").slice(0, 45), image, kind: "subject", description: file.name.replace(/\.[^.]+$/, " "), music: "Cinematic electronic instrumental, steady groove" };
      await savePicture(cue); setLibrary(items => [...items, cue]); setNotice("Picture loaded. Drag it onto the video whenever you want it to appear.");
      if (status?.vision) void api<{ name: string; description: string; music: string }>("interpret", { image }).then(async result => { const interpreted = { ...cue, ...result }; await savePicture(interpreted); setLibrary(items => items.map(item => item.id === cue.id ? interpreted : item)); }).catch(() => {});
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load this picture. The preloaded pictures are ready to use."); }
    finally { setLoadingImage(false); }
  }
  function drop(event: React.DragEvent) {
    event.preventDefault(); setDragging(false);
    const cue = library.find(item => item.id === event.dataTransfer.getData("application/x-kriya-cue"));
    if (cue) void send(cue);
    else if (event.dataTransfer.files[0]) void upload(event.dataTransfer.files[0]);
    else sendText(event.dataTransfer.getData("text/plain"));
  }
  function download(take: SavedTake) {
    const url = URL.createObjectURL(take.blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${take.title.replace(/[^a-zA-Z0-9 -]/g, "") || "DropBeat"}.${take.blob.type.includes("mp4") ? "mp4" : "webm"}`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function toEditor(take: SavedTake) {
    setSaving(true);
    try {
      const form = new FormData(); form.set("id", crypto.randomUUID()); form.set("video", take.blob, "music-video.webm");
      form.set("metadata", JSON.stringify({ title: take.title, duration: take.duration, width: 1280, height: 720, mimeType: take.blob.type, interactions: [] }));
      const response = await fetch("/api/recordings", { method: "POST", body: form }), result = await response.json();
      if (!response.ok) throw new Error(result.error); window.location.assign(result.url);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open the editor."); }
    finally { setSaving(false); }
  }
  async function finalize(take: SavedTake) {
    setFinalizing(true); setNotice("Creating the English vocal track and assembling your final video. This can take a few minutes.");
    try {
      const form = new FormData(); form.set("video", take.blob, "take.webm");
      form.set("idea", take.prompt || take.title); form.set("style", take.style || style);
      form.set("directions", JSON.stringify(take.cues.map(cue => ({ at: cue.at, description: cue.description }))));
      const response = await fetch("/create/music-video/api/finalize", { method: "POST", body: form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      const media = await fetch(result.url); if (!media.ok) throw new Error("The final video could not be downloaded. Please retry.");
      const completed: SavedTake = { ...take, blob: await media.blob(), exportId: result.id, duration: result.duration };
      await saveTake(completed); setSelected(completed); setTakes(items => items.map(item => item.id === take.id ? completed : item));
      setNotice("Your video and English vocals are ready.");
      if (status?.blender) await refine(completed, "Make this music video punchier: richer colour, subtle highlight glow, gentle zooms on the beat, and readable English lyric captions. Keep it tasteful.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not finish the vocals. Your original video is safe."); }
    finally { setFinalizing(false); }
  }
  async function refine(take: SavedTake, instruction: string) {
    if (!take.exportId) return;
    setFinalizing(true); setNotice("AI is planning your edit. Blender will polish the video and add English captions. Your original stays safe.");
    try {
      const response = await fetch("/create/music-video/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: take.exportId, direction: instruction }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      const media = await fetch(result.url); if (!media.ok) throw new Error("Could not load the Blender preview.");
      const refined: SavedTake = { ...take, blob: await media.blob(), refinementId: result.id, refinementSummary: result.summary };
      await saveTake(refined); setSelected(refined); setTakes(items => items.map(item => item.id === take.id ? refined : item));
      setNotice(`Your video is ready. ${result.summary}`); setRefineText("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The edit could not finish. Your original video is still ready to watch."); }
    finally { setFinalizing(false); }
  }
  async function showVersion(take: SavedTake, original: boolean) {
    const url = `/create/music-video/api/finalize?id=${take.exportId}&asset=${original ? "video" : "refined"}&refinement=${take.refinementId}`;
    try { const response = await fetch(url); if (!response.ok) throw new Error(); setSelected({ ...take, blob: await response.blob() }); }
    catch { setNotice("Could not open that version. Please retry."); }
  }
  async function openBlender(take: SavedTake) {
    try { const response = await fetch("/create/music-video/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", id: take.exportId, refinement: take.refinementId }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setNotice("Opened the editable project in Blender on your Mac."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not open Blender."); }
  }
  useEffect(() => {
    finishAutomatically.current = take => { if (connected && status?.desktop) void finalize(take); };
  });
  async function remove(take: SavedTake) {
    try { await deleteTake(take.id); setTakes(items => items.filter(item => item.id !== take.id)); if (selected?.id === take.id) setSelected(undefined); }
    catch { setNotice("Could not remove this video. Please retry."); }
  }

  return <main className="mv-studio mv-simple">
    <header className="mv-topbar"><div className="mv-brand"><Link href="/" className="mv-logo" aria-label="DropBeat studio">DropBeat<span>✳︎</span></Link><span className="mv-breadcrumb">/</span><strong>Music Video</strong></div><button className="mv-icon" aria-label="Advanced" onClick={() => setAdvanced(true)}><Settings2 size={18}/></button></header>
    <section className="mv-workspace">
      <div className="mv-heading"><div><h1>Your idea. <em>In motion.</em></h1><p className="mv-subtitle">Start a video. Drop pictures or send words to change what happens next.</p></div></div>
      <div className="mv-idea-row"><label className="mv-opening">Starting idea<textarea aria-label="Starting idea" value={prompt} maxLength={1200} disabled={busy} onChange={event => setPrompt(event.target.value)} rows={2}/></label><label className="mv-style">Sound<select aria-label="Music style" value={style} disabled={busy} onChange={event => setStyle(event.target.value)}>{["High-energy rap", "Trap", "Electronic", "Cinematic"].map(value => <option key={value}>{value}</option>)}</select><span>One minute · English lyrics</span></label></div>
      <div className="mv-desk">
        <section className="mv-player-column" aria-label="Video studio">
          <div className="mv-stage" onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={drop}>
            <canvas ref={canvas} aria-label="Music video canvas" className={(playback || sample) && !playing && phase !== "connecting" ? "mv-hidden" : ""}/>
            {(playback || sample) && !playing && phase !== "connecting" && <video className="mv-take-preview" aria-label="Saved music video" src={sample ? "/create/music-video/rap-demo.mp4" : playback} controls autoPlay={sample} playsInline/>}
            {playing && lyrics.length > 0 && <div className="mv-live-lyrics" aria-hidden="true">{lyrics.map((line, i) => <span key={i}>{line}</span>)}</div>}
            {!playback && !sample && !busy && <div className="mv-idle-caption">Your video starts here.</div>}
            {phase === "connecting" && <div className="mv-connecting"><Loader2 size={26} className="mv-spin"/><strong>Creating the opening scene…</strong><span>You can get your pictures ready below. First AI frames can take a few minutes.</span></div>}
            {cueFeedback && !dragging && <div className={`mv-cue-feedback ${cueFeedback.state}`} role="status">{cueFeedback.state === "pending" ? <Loader2 size={18} className="mv-spin"/> : cueFeedback.state === "accepted" ? <Check size={18}/> : <X size={18}/>}<span>{cueFeedback.text}</span></div>}
            {dragging && <div className="mv-drop-target"><ImagePlus size={28}/><strong>{playing ? "Drop to change the scene" : "Start your video first"}</strong></div>}
          </div>
          <div className="mv-transport"><div className="mv-transport-left"><button className={busy ? "mv-stop" : "mv-primary"} disabled={finalizing || (!busy && (!status || !prompt.trim()))} onClick={() => void ((playing || phase === "connecting") ? finish() : start())}>{busy ? <Square size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}{finalizing ? "Finishing…" : phase === "connecting" ? "Cancel" : playing ? "Finish video" : "Start video"}</button><span className="mv-time">{clock(selected && !playing ? selected.duration : elapsed)} / 01:00</span>{playing && <span className="mv-recording-dot"/>}</div>{selected && !busy ? <button className="mv-secondary" onClick={() => download(selected)}><ArrowDownToLine size={15}/> Save video</button> : <span className="mv-engine-label">{connected ? "1 minute · music included" : status ? "Local preview · AI not connected" : "Connecting…"}</span>}</div>
          <form className="mv-steer" onSubmit={event => { event.preventDefault(); sendText(direction); }}><input aria-label="Steer with words" placeholder="Or type a change: make it sunset…" value={direction} onChange={event => setDirection(event.target.value)} maxLength={1200} disabled={!playing}/><button aria-label="Send direction" disabled={!playing || sending || !direction.trim()}>{sending ? <Loader2 size={17} className="mv-spin"/> : <ArrowRight size={19}/>}</button></form>
          <p className="mv-lyric-note">Your pictures and words shape the video, music and English lyrics.</p>
          {lyrics.length > 0 && <p className="mv-lyrics-readable" aria-live="polite" aria-label="English lyrics">{lyrics.join(" / ")}</p>}
          {events.length > 0 && <div className="mv-directions" aria-label="Directions sent">{events.slice(-4).map(cue => <span key={cue.id}><img src={cue.image} alt=""/>{cue.name}{cue.status === "sent" ? <Loader2 size={12} className="mv-spin"/> : cue.status === "failed" ? <X size={12}/> : <Check size={12}/>}</span>)}</div>}
        </section>
        <aside className="mv-director"><div className="mv-section-label"><h2>Pictures, ready to drop</h2><span>{library.length}</span></div><p className="mv-muted">Drag onto the playing video.<br/>On your phone, tap a picture.</p><div className="mv-library">{library.map(cue => <button className={`mv-image-card ${cueFeedback?.id === cue.id ? "mv-cue-selected" : ""}`} key={cue.id} draggable disabled={sending} onDragStart={event => event.dataTransfer.setData("application/x-kriya-cue", cue.id)} onClick={() => void send(cue)} aria-label={`Use ${cue.name} picture`}><img src={cue.image} alt={cue.name}/><span className="mv-image-card-name">{cue.name}{cueFeedback?.id === cue.id && cueFeedback.state === "accepted" ? <Check size={14}/> : <Plus size={14}/>}</span></button>)}</div><button className="mv-upload" disabled={loadingImage} onClick={() => input.current?.click()}>{loadingImage ? <Loader2 size={18} className="mv-spin"/> : <ImagePlus size={18}/>}<span>Load more pictures<small>Ready now. Use whenever you like.</small></span></button><button className="mv-example" disabled={busy} onClick={() => { setSelected(undefined); setSample(true); setNotice("Recorded AI example: ocean → tiger. Start your own video to steer it live."); }}><Play size={15}/><span>Watch an example</span><ArrowRight size={14}/></button></aside>
      </div>
      {selected && !playing && phase !== "connecting" && <section className="mv-complete">
        {finalizing ? <p className="mv-finishing"><Loader2 className="mv-spin" size={18}/> Finishing your video. You can relax—this takes a few minutes.</p> : selected.exportId ? <>
          {status?.blender && <form className="mv-steer" onSubmit={event => { event.preventDefault(); if (refineText.trim()) void refine(selected, refineText); }}><input aria-label="Describe your edit" value={refineText} onChange={event => setRefineText(event.target.value)} maxLength={1200} placeholder="Want a change? Try “warmer colours, less glow”…"/><button disabled={!refineText.trim()} aria-label="Refine video"><ArrowRight size={18}/></button></form>}
          {selected.refinementId && <div className="mv-version-switch"><button onClick={() => void showVersion(selected, true)}>Original</button><button onClick={() => void showVersion(selected, false)}>Refined</button></div>}
          <details className="mv-export-files"><summary>Files for editing</summary><a href={`/create/music-video/api/finalize?id=${selected.exportId}&asset=video`} download>Clean MP4</a><a href={`/create/music-video/api/finalize?id=${selected.exportId}&asset=audio`} download>WAV soundtrack</a><a href={`/create/music-video/api/finalize?id=${selected.exportId}&asset=lyrics`} download>English lyrics</a><a href={`/create/music-video/api/finalize?id=${selected.exportId}&asset=cues`} download>Scene directions</a>{selected.refinementId && <button className="mv-text-button" onClick={() => void openBlender(selected)}>Open project in Blender</button>}</details>
        </> : <button className="mv-secondary" disabled={!status?.gemini || !status?.desktop} onClick={() => void finalize(selected)}>Finish with vocals</button>}
      </section>}
      <p className="mv-simple-status" role="status">{notice || "The pictures are already loaded. You decide when they enter the video."}</p>
      {takes.length > 0 && <details className="mv-saved"><summary>Saved videos <span>{takes.length}</span></summary><div className="mv-take-list">{takes.map(take => <article key={take.id}><button className="mv-take-select" disabled={busy} onClick={() => { setSample(false); setSelected(take); }}><Play size={16}/><span><strong>{take.title}</strong><small>{clock(take.duration)}</small></span></button><div><button className="mv-icon" aria-label={`Download ${take.title}`} onClick={() => download(take)}><ArrowDownToLine size={16}/></button>{status?.desktop && <button className="mv-text-button" disabled={saving || busy} onClick={() => void toEditor(take)}>Open in editor</button>}<button className="mv-icon" aria-label={`Delete ${take.title}`} onClick={() => { if (window.confirm("Delete this saved video?")) void remove(take); }}><Trash2 size={15}/></button></div></article>)}</div></details>}
      <footer className="mv-footer"><Link href="/"><ArrowLeft size={13}/> DropBeat studio</Link></footer>
    </section>
    <input ref={input} hidden multiple type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Upload reference image" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; void (async () => { for (const file of files) await upload(file); })(); }}/>
    {advanced && <MusicVideoAdvanced onClose={() => setAdvanced(false)} onSaved={refresh} onAccess={() => { setAdvanced(false); setAccess(true); }}/>}
    {access && <StudioAccess status={status} onClose={() => setAccess(false)} onAdvanced={() => { setAccess(false); setAdvanced(true); }}/>}
  </main>;
}
