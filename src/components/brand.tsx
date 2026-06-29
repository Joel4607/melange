import Link from "next/link";
import { ShoppingBasket } from "lucide-react";

/** Mélange wordmark. Links home unless `asLink` is false. */
export function Logo({ asLink = true }: { asLink?: boolean }) {
  const inner = (
    <span className="inline-flex items-baseline gap-1 font-display text-2xl font-semibold tracking-tight text-green-deep">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-green text-cream">
        <ShoppingBasket className="h-4 w-4" aria-hidden />
      </span>
      Mélange
    </span>
  );
  return asLink ? (
    <Link href="/" aria-label="Mélange home">
      {inner}
    </Link>
  ) : (
    inner
  );
}
