import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/admin/actions";

export default async function LegacyAdminPage() {
  await requireAdmin();
  redirect("/admin");
}
