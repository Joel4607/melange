import Link from "next/link";
import { Wallet, ArrowRight } from "lucide-react";

export function WalletCard({
  wallet,
  className = "",
}: {
  wallet: { balance: string; held: string } | null;
  className?: string;
}) {
  const balance = wallet ? Number(wallet.balance).toFixed(2) : "0.00";
  const held = wallet ? Number(wallet.held).toFixed(2) : "0.00";

  return (
    <Link
      href="/app/wallet"
      className={`group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-green-deep to-green p-6 text-cream shadow-xl transition hover:shadow-2xl ${className}`}
    >
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-cream/80" aria-hidden />
            <span className="text-sm font-medium tracking-wide text-cream/80">MÉLANGE</span>
          </div>
          <ArrowRight className="h-5 w-5 -rotate-45 text-cream/60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-cream" aria-hidden />
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-cream/70">Available</p>
          <p className="font-display text-3xl font-semibold text-cream">GHS {balance}</p>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-cream/70">In escrow</p>
            <p className="font-display text-lg font-semibold text-cream">GHS {held}</p>
          </div>
          <div className="text-right">
            <p className="text-xs tracking-widest text-cream/60">•••• 4242</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
