import { cn } from "@/lib/cn";

/** Original RideKmer mark: a road curve inside a rounded badge, with the wordmark. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <rect width="64" height="64" rx="16" fill="#136843" />
        <path
          d="M14 46c10-4 14-14 18-22s10-14 18-10"
          stroke="#f9bc45"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="46" cy="44" r="6" fill="#ffffff" />
        <circle cx="20" cy="20" r="4" fill="#ffffff" />
      </svg>
      {!compact ? (
        <span className="text-xl font-extrabold tracking-tight text-brand-800">
          Ride<span className="text-accent-600">Kmer</span>
        </span>
      ) : null}
    </span>
  );
}
