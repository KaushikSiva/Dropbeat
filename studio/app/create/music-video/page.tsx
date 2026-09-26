import { notFound } from "next/navigation";
import MusicVideoStudio from "./_components/studio";
export const metadata = { title: "Music Video · Kriya", description: "Direct music and moving worlds with pictures." };
export default function MusicVideoPage() {
  if (process.env.KRIYA_MUSIC_VIDEO_ENABLED === "0") notFound();
  return <MusicVideoStudio />;
}
