"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { api } from "../_lib/engine";
import type { StudioStatus } from "../_lib/types";

export function MusicVideoAdvanced({ onClose, onSaved, onAccess }: { onClose: () => void; onSaved: () => void; onAccess: () => void }) {
  const [status, setStatus] = useState<StudioStatus>();
  const [fields, setFields] = useState({ reactorApiKey: "", geminiApiKey: "", revenuecatPublicKey: "", revenuecatSecretKey: "" });
  const [token, setToken] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { void api<StudioStatus>("status").then(setStatus).catch(() => setMessage("Connection status is unavailable.")); }, []);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/create/music-video/api/settings", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(fields) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setFields({ reactorApiKey: "", geminiApiKey: "", revenuecatPublicKey: "", revenuecatSecretKey: "" });
      setStatus(await api<StudioStatus>("status")); setMessage("Connections saved securely on this installation."); onSaved();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save connections."); } finally { setBusy(false); }
  }
  return <div className="mv-modal-backdrop" onClick={onClose}><section className="mv-modal" role="dialog" aria-modal="true" aria-labelledby="mv-advanced-title" onClick={e => e.stopPropagation()}>
    <header><div><span className="mv-eyebrow">MUSIC VIDEO</span><h2 id="mv-advanced-title">Advanced</h2></div><button className="mv-icon" onClick={onClose} aria-label="Close Advanced"><X size={19} /></button></header>
    <p className="mv-muted">Connect AI for generated video, instrumental music and English lyric captions. Without connections, Start video plays a local picture preview.</p>
    {status?.settingsLocked && <label>Administrator token<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} /></label>}
    {([['reactorApiKey','Orbis · live visuals',status?.reactor],['geminiApiKey','Gemini · music, pictures & English lyrics',status?.gemini]] as const).map(([field,label,connected])=><label key={field}><span className="mv-field-label">{label}{connected && <small><Check size={12}/> Connected</small>}</span><input type="password" autoComplete="off" value={fields[field]} onChange={e=>setFields({...fields,[field]:e.target.value})} placeholder={connected ? 'Leave blank to keep saved key' : 'API key'} /></label>)}
    <details className="mv-billing-settings"><summary>RevenueCat <span>{status?.billingConfigured ? 'Connected' : 'Optional · Studio access'}</span></summary><p className="mv-muted">Use a Test Store or Web Billing SDK key and a server secret. The entitlement is <code>music_video_pro</code>. Pricing comes from your RevenueCat offering.</p><label>Public SDK key<input type="password" autoComplete="off" value={fields.revenuecatPublicKey} onChange={e=>setFields({...fields,revenuecatPublicKey:e.target.value})} placeholder="Web Billing public key" /></label><label>Secret API key<input type="password" autoComplete="off" value={fields.revenuecatSecretKey} onChange={e=>setFields({...fields,revenuecatSecretKey:e.target.value})} placeholder="Server-side entitlement verification" /></label></details>
    <p className="mv-muted">AI generation sends images for interpretation and directions to Orbis and Google. Provider usage charges apply. Keys stay on the server; takes stay on this device, in browser storage or the desktop app’s local library.</p>
    <button className="mv-text-button" onClick={onAccess}>Manage Studio access</button>
    {message && <p role="status" className="mv-notice">{message}</p>}
    <button className="mv-primary" disabled={busy} onClick={()=>void save()}>{busy ? <Loader2 size={16} className="mv-spin"/> : <Check size={16}/>} Save connections</button>
  </section></div>;
}
