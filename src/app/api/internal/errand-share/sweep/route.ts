import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDueShareWindows } from "@/lib/server/errand-share";

function authorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const presented = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export async function GET(request: Request) {
  const secret = process.env.ERRAND_SHARE_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Errand-Share scheduler is not configured" }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await processDueShareWindows(25));
}
