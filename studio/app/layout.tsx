import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "DropBeat — direct the beat", description: "Direct AI music videos by dropping pictures into a live scene." };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
