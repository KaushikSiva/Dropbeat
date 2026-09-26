export const dynamic = "force-dynamic";
export function GET() { return Response.json({ app: "dropbeat", simulator: process.env.KRIYA_IOS_SIMULATOR === "1" && !process.env.RENDER }, {headers:{"Cache-Control":"no-store"}}); }
