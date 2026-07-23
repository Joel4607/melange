import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireTelegramAdmin } from "@/lib/telegram/admin-auth";

export async function GET(request: Request) {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) {
    return NextResponse.json({ error: "Missing initData" }, { status: 400 });
  }

  const admin = await requireTelegramAdmin(initData);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: requests, error } = await db
    .from("verification_requests")
    .select(
      "id, user_id, front_photo_path, back_photo_path, phone, email, status, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        user_id: string;
        front_photo_path: string | null;
        back_photo_path: string | null;
        phone: string | null;
        email: string | null;
        status: string;
        created_at: string;
      }[]
    >();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((requests ?? []).map((r) => r.user_id))];
  const { data: profiles } = await db
    .from("profiles")
    .select("id, name")
    .in("id", userIds)
    .returns<{ id: string; name: string }[]>();
  const nameById = new Map(profiles?.map((p) => [p.id, p.name]) ?? []);

  const result = await Promise.all(
    (requests ?? []).map(async (r) => {
      const frontUrl = r.front_photo_path
        ? await signedStorageUrl(db, "verification", r.front_photo_path)
        : null;
      const backUrl = r.back_photo_path
        ? await signedStorageUrl(db, "verification", r.back_photo_path)
        : null;
      return {
        id: r.id,
        userId: r.user_id,
        name: nameById.get(r.user_id) ?? "Unknown",
        phone: r.phone,
        email: r.email,
        frontUrl,
        backUrl,
        createdAt: r.created_at,
      };
    }),
  );

  return NextResponse.json({ requests: result });
}

async function signedStorageUrl(
  db: ReturnType<typeof getServiceClient>,
  bucket: string,
  path: string,
): Promise<string | null> {
  if (path.startsWith("http")) return path;
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 60 * 5);
  if (error || !data) return null;
  return data.signedUrl;
}
