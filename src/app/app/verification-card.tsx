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
      <div className="py-2">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <ShieldCheck className="h-5 w-5 text-green-soft" aria-hidden /> Verified
        </p>
        <p className="mt-1 text-sm text-muted">Your identity has been verified.</p>
      </div>
    );
  }

  if (request?.status === "pending") {
    return (
      <div className="py-2">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
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
      <div className="py-2">
        <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <XCircle className="h-5 w-5 text-orange-deep" aria-hidden /> Verification rejected
        </p>
        <p className="mt-1 text-sm text-muted">
          Your last submission was rejected. Submit a clearer ID photo.
        </p>
        <Link
          href="/app/verify"
          className="mt-3 inline-block rounded-full border border-cream-deep px-4 py-2 text-sm font-medium text-green-deep transition hover:bg-cream/40"
        >
          Re-submit
        </Link>
      </div>
    );
  }

  return (
    <div className="py-2">
      <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <ShieldCheck className="h-5 w-5 text-green-soft" aria-hidden /> Runner verification
      </p>
      <p className="mt-1 text-sm text-muted">
        Upload your Ghana Card and a selfie. An admin will review it and activate your runner account.
      </p>
      <Link
        href="/app/verify"
        className="mt-3 inline-block rounded-full bg-green px-4 py-2 text-sm font-medium text-cream transition hover:bg-green-deep"
      >
        Verify now
      </Link>
    </div>
  );
}
