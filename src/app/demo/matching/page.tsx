import Link from "next/link";
import { rankRunners } from "@/lib/algorithm";
import type { RunnerCandidate, TaskRequest } from "@/lib/algorithm";

// A small seeded scenario near the University of Ghana, Legon, to demonstrate
// the matching algorithm producing an explainable ranking with no backend.
const task: TaskRequest = {
  pickup: { lat: 5.6505, lng: -0.187 },
  urgency: "express",
};

const candidates: RunnerCandidate[] = [
  { runnerId: "Ama (close, mid-trust)", location: { lat: 5.6512, lng: -0.1875 }, trust: 0.6, activeLoad: 1, available: true },
  { runnerId: "Kofi (far, high-trust)", location: { lat: 5.668, lng: -0.196 }, trust: 0.95, activeLoad: 0, available: true },
  { runnerId: "Yaa (close, low-trust)", location: { lat: 5.6508, lng: -0.1869 }, trust: 0.2, activeLoad: 0, available: true },
  { runnerId: "Kwesi (mid, busy)", location: { lat: 5.658, lng: -0.19 }, trust: 0.8, activeLoad: 4, available: true },
  { runnerId: "Esi (offline)", location: { lat: 5.651, lng: -0.187 }, trust: 0.9, activeLoad: 0, available: false },
];

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

export default function MatchingDemo() {
  const ranked = rankRunners(task, candidates);

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Home
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Matching demo</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Express task at Legon. Each runner is scored on proximity, trust,
          availability and urgency-fit (all normalized to 0–1), then ranked.
          Offline runners are filtered out.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Runner</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Dist</th>
              <th className="px-3 py-2">Prox</th>
              <th className="px-3 py-2">Trust</th>
              <th className="px-3 py-2">Avail</th>
              <th className="px-3 py-2">Urg</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr
                key={r.runnerId}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="px-3 py-2 font-medium">{r.rank}</td>
                <td className="px-3 py-2">{r.runnerId}</td>
                <td className="px-3 py-2 font-semibold">
                  {r.matchScore.toFixed(3)}
                </td>
                <td className="px-3 py-2">
                  {r.components.distanceKm.toFixed(2)}km
                </td>
                <td className="px-3 py-2">{pct(r.components.proximity)}</td>
                <td className="px-3 py-2">{pct(r.components.trust)}</td>
                <td className="px-3 py-2">{pct(r.components.availability)}</td>
                <td className="px-3 py-2">{pct(r.components.urgencyFit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
