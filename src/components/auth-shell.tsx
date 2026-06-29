import type { ReactNode } from "react";
import { Logo } from "@/components/brand";

/** Centered card layout shared by the sign-up and log-in screens. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-cream">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-5">
        <Logo />
      </header>
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-8">
        <div className="rounded-[1.75rem] border border-cream-deep bg-white p-7 shadow-sm sm:p-8">
          <h1 className="font-display text-3xl font-semibold text-green-deep">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? (
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        ) : null}
      </section>
    </main>
  );
}

/** Brand-styled text input used across the auth forms. */
export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-green-deep">
        {label}
      </span>
      <input
        {...props}
        className="w-full rounded-xl border border-cream-deep bg-cream/40 px-4 py-3 text-ink outline-none transition placeholder:text-muted focus:border-green-soft focus:bg-white"
      />
    </label>
  );
}
