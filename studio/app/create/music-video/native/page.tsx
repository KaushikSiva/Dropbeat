import { notFound } from "next/navigation";
import NativeStage from "./stage";
export default function Page() {
  if (process.env.KRIYA_MUSIC_VIDEO_ENABLED === "0") notFound();
  return <NativeStage />;
}
