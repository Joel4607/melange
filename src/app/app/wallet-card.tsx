import Link from "next/link";
import { Wallet, ArrowUpRight, Plus } from "lucide-react";

export function WalletCard({
  wallet,
  name,
  className = "",
}: {
  wallet: { balance: string; held: string } | null;
  name?: string | null;
  className?: string;
}) {
  const balance = wallet ? Number(wallet.balance).toFixed(2) : "0.00";
  const held = wallet ? Number(wallet.held).toFixed(2) : "0.00";

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-green-deep via-green to-green-soft p-6 text-cream shadow-xl ${className}`}
    >
      <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5" />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
            <Wallet className="h-4 w-4 text-cream" aria-hidden />
          </span>
          <span className="text-sm font-medium tracking-wider text-cream/80">MÉLANGE WALLET</span>
        </div>
        <span className="rounded bg-white/15 px-2 py-1 text-xs font-semibold tracking-widest text-cream/90">
          VISA
        </span>
      </div>

      <div className="relative mt-6">
        <div className="flex items-center gap-1.5">
          <span className="h-8 w-10 rounded-md bg-gradient-to-r from-yellow-200 to-yellow-500 opacity-80" />
          <span className="h-6 w-8 rounded-sm border border-cream/30" />
        </div>
        <p className="mt-4 font-mono text-lg tracking-widest text-cream/90">**** **** **** 4242</p>
      </div>

      <div className="relative mt-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-cream/60">Available</p>
          <p className="font-display text-3xl font-semibold text-cream">GHS {balance}</p>
          <p className="mt-1 text-xs text-cream/60">GHS {held} in escrow</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-cream/60">Holder</p>
          <p className="text-sm font-medium text-cream">{name?.split(" ")[0] ?? "You"}</p>
        </div>
      </div>

      <div className="relative mt-5 flex gap-2">
        <Link
          href="/app/wallet"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cream px-3 py-2 text-sm font-semibold text-green-deep transition hover:bg-white"
        >
          <Plus className="h-4 w-4" aria-hidden /> Top up
        </Link>
        <Link
          href="/app/wallet"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cream/30 px-3 py-2 text-sm font-semibold text-cream transition hover:bg-white/10"
        >
          Wallet <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
