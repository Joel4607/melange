import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/admin/actions";

export default async function LegacyTelegramLinkPage() {
  await requireAdmin();
  redirect("/admin/telegram-link");
}
