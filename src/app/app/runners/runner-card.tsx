import Link from "next/link";
import { MapPin, Star, User, ShieldCheck, Bike } from "lucide-react";

interface RunnerCardProps {
  runner: {
    user_id: string;
    profiles: { name: string | null; verified: boolean } | null;
    trust_score: number;
    capabilities: string[] | null;
    completed: number;
    distanceKm: number | null;
  };
}

export function RunnerCard({ runner }: RunnerCardProps) {
  const name = runner.profiles?.name ?? "A trusted runner";
  const trustStars = (runner.trust_score * 5).toFixed(1);
  const category = runner.capabilities?.[0] ?? "Any Other Errand";

  return (
    <div className="flex flex-col rounded-2xl border border-cream-deep bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-green text-cream">
            <User className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-green-deep">{name}</p>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1 text-green-soft">
                <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
                {trustStars}
              </span>
              <span>· {runner.completed} errands</span>
            </p>
          </div>
        </div>
        {runner.profiles?.verified ? (
          <ShieldCheck className="h-5 w-5 shrink-0 text-green-deep" aria-label="Verified" />
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-1 text-xs font-medium text-green-deep">
          <Bike className="h-3 w-3" aria-hidden />
          {category}
        </span>
        {runner.capabilities?.slice(1, 3).map((cap) => (
          <span
            key={cap}
            className="rounded-full bg-cream/60 px-2.5 py-1 text-xs font-medium text-muted"
          >
            {cap}
          </span>
        ))}
      </div>

      {runner.distanceKm != null ? (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="h-4 w-4 text-green-soft" aria-hidden />
          {runner.distanceKm.toFixed(1)} km away
        </p>
      ) : null}

      <Link
        href={`/app/post?runner=${runner.user_id}&category=${encodeURIComponent(category)}`}
        className="mt-auto flex w-full items-center justify-center rounded-full bg-orange py-2.5 text-sm font-semibold text-white transition hover:bg-orange-deep"
      >
        Request {name.split(" ")[0]}
      </Link>
    </div>
  );
}
