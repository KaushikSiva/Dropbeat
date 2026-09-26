"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { Package } from "@revenuecat/purchases-js";
import { useDialogFocus } from "./dialog-focus";
import { revenueCat } from "../_lib/billing";
import type { StudioStatus } from "../_lib/types";
export function StudioAccess({ status, onClose, onAdvanced }: { status?: StudioStatus; onClose: () => void; onAdvanced: () => void }) {
  const [packages,setPackages]=useState<Package[]>([]); const [active,setActive]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  useDialogFocus(true, busy);
  const refresh = useCallback(async () => {
    if (!status?.billingConfigured) return;
    setBusy(true);
    try { const client=await revenueCat(status); const [info,offers]=await Promise.all([client.getCustomerInfo(),client.getOfferings()]); setActive(Boolean(info.entitlements.active[status.entitlement])); setPackages(offers.current?.availablePackages || []); if (!offers.current) setMessage("No purchasable plan is available. Check the current offering and product prices in RevenueCat."); }
    catch(e) { setMessage(e instanceof Error ? e.message : "Could not load plans."); } finally { setBusy(false); }
  }, [status]);
  useEffect(()=>{void refresh();},[refresh]);
  async function purchase(item: Package) {
    if(!status)return; setBusy(true);setMessage("");
    try { const client=await revenueCat(status); await client.purchase({rcPackage:item}); await refresh(); }
    catch(e) { setMessage(e instanceof Error ? e.message : "Purchase was not completed."); } finally { setBusy(false); }
  }
  return <div className="mv-modal-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="mv-access-title" className="mv-modal" onClick={e=>e.stopPropagation()}><header><div><span className="mv-eyebrow">KRIYA ADD-ON</span><h2 id="mv-access-title">Studio access</h2></div><button className="mv-icon" onClick={onClose} aria-label="Close Studio access"><X size={19}/></button></header>
    <p className="mv-muted">Explore rehearsal for free. Music Video Pro unlocks hosted generation; local owners can use their own provider keys.</p>
    <div className="mv-access-feature"><Check size={17}/> Image-directed visuals and music</div><div className="mv-access-feature"><Check size={17}/> Record takes and finish them in Kriya</div>
    {!status?.billingConfigured ? <><p className="mv-notice">RevenueCat is not connected yet. No payment or subscription is required for rehearsal.</p><button className="mv-secondary" onClick={onAdvanced}>Open Advanced</button></> : active ? <p className="mv-notice"><Check size={16}/> Music Video Pro is active.</p> : packages.map(item=><button className="mv-plan" key={item.identifier} disabled={busy} onClick={()=>void purchase(item)}><span>{item.webBillingProduct.title}</span><strong>{item.webBillingProduct.price.formattedPrice}</strong></button>)}
    {busy && <p className="mv-muted"><Loader2 size={16} className="mv-spin"/> Connecting to RevenueCat…</p>}{message && <p role="status" className="mv-notice">{message}</p>}
    {status?.billingConfigured && <button className="mv-text-button" disabled={busy} onClick={()=>void refresh()}>Refresh purchases</button>}
    <footer className="mv-muted">{status?.billingPublicKey.startsWith("test_") ? "RevenueCat Test Store · test purchases only, no real charges." : "Plans and checkout powered by RevenueCat."}</footer>
  </section></div>;
}
