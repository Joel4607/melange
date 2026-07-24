import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminLoginForm } from "./admin-login-form";

export const metadata: Metadata = {
  title: "Admin sign-in — Mélange",
  description: "Restricted sign-in for Mélange administrators.",
};

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
