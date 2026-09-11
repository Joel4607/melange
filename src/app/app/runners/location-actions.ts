"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isRunnerLocation, RUNNER_LOCATION_COOKIE } from "./runner-location";

export async function setRunnerSearchLocation(location: unknown): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Please sign in to use location search." };
  if (location !== null && !isRunnerLocation(location)) {
    return { error: "Invalid location. Please try again." };
  }

  // Search preference only, never evidence of identity or authorization.
  // Keep GPS out of URLs and avoid retaining it in the account database.
  (await cookies()).set(RUNNER_LOCATION_COOKIE,
    location === null ? "" : JSON.stringify({ userId: user.id, lat: location.lat, lng: location.lng }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/app/runners",
      maxAge: location === null ? 0 : 1800,
    });
  return {};
}
