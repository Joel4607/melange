"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, ArrowUpRight, Wallet as WalletIcon } from "lucide-react";
import { CreditCard } from "@/components/shared-assets/credit-card/credit-card";

export function WalletCreditCard({
  wallet,
  name,
}: {
  wallet: { balance: string; held: string } | null;
  name?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(316);

  useEffect(() => {
    function update() {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect();
        // Keep the card within a comfortable min/max range.
        setWidth(Math.min(Math.max(Math.floor(rect.width), 260), 420));
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const balance = wallet ? Number(wallet.balance).toFixed(2) : "0.00";
  const held = wallet ? Number(wallet.held).toFixed(2) : "0.00";
  const holder = (name ?? "You").toUpperCase();

  return (
    <div className="rounded-2xl border border-cream-deep bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-display font-semibold text-green-deep">
          <WalletIcon className="h-5 w-5 text-orange-deep" aria-hidden /> Wallet
        </p>
        <Link
          href="/app/wallet"
          className="text-xs font-medium text-green-deep hover:underline"
        >
          Details
        </Link>
      </div>

      <div ref={ref} className="mt-4 flex justify-center">
        <CreditCard
          type="brand-dark"
          company="Mélange"
          cardNumber="**** **** **** 4242"
          cardHolder={holder}
          cardExpiration="12/30"
          width={width}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted">Available</p>
          <p className="font-display text-xl font-semibold text-ink">GHS {balance}</p>
        </div>
        <div>
          <p className="text-xs text-muted">In escrow</p>
          <p className="font-display text-xl font-semibold text-ink">GHS {held}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          href="/app/wallet"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-green px-3 py-2 text-sm font-semibold text-cream transition hover:bg-green-deep"
        >
          <Plus className="h-4 w-4" aria-hidden /> Top up
        </Link>
        <Link
          href="/app/wallet"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-cream-deep px-3 py-2 text-sm font-semibold text-green-deep transition hover:bg-cream/40"
        >
          Wallet <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
