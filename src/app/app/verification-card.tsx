import Link from "next/link";
import { Clock, ShieldCheck, XCircle } from "lucide-react";

export function VerificationCard({
  verified,
  request,
}: {
  verified: boolean;
  request: { id: string; status: "pending" | "approved" | "rejected"; created_at: string } | null;
}) {
  if (verified) {
    return (
      <div className="rounded-2xl border border-green/30 bg-green/5 p-5">
        <p className="flex items-center gap-2 font-medium text-green-deep">
          <ShieldCheck className="h-5 w-5 text-green-deep" aria-hidden /> Verified
        </p>
        <p className="mt-1 text-sm text-muted">Your identity has been verified.</p>
      </div>
    );
  }

  if (request?.status === "pending") {
    return (
      <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
        <p className="flex items-center gap-2 font-medium text-green-deep">
          <Clock className="h-5 w-5 text-orange-deep" aria-hidden /> Verification pending
        </p>
        <p className="mt-1 text-sm text-muted">
          Submitted {new Date(request.created_at).toLocaleDateString()}. We&apos;ll let you know once
          it&apos;s reviewed.
        </p>
      </div>
    );
  }

  if (request?.status === "rejected") {
    return (
      <div className="rounded-2xl border border-orange/15 bg-orange/5 p-5">
        <p className="flex items-center gap-2 font-medium text-green-deep">
          <XCircle className="h-5 w-5 text-orange-deep" aria-hidden /> Verification rejected
        </p>
        <p className="mt-1 text-sm text-muted">
          Your last submission was rejected. Submit a clearer ID photo.
        </p>
        <Link
          href="/app/verify"
          className="mt-3 inline-block rounded-full border border-cream-deep bg-white px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-cream/40"
        >
          Re-submit
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 font-medium text-green-deep">
        <ShieldCheck className="h-5 w-5 text-orange-deep" aria-hidden /> Identity verification
      </p>
      <p className="mt-1 text-sm text-muted">
        Upload your Ghana Card. An admin will review it and activate your account.
      </p>
      <Link
        href="/app/verify"
        className="mt-3 inline-block rounded-full border border-cream-deep bg-white px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-cream/40"
      >
        Verify now
      </Link>
    </div>
  );
}
