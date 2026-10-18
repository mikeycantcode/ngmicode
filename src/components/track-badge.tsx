import { TRACKS, type Difficulty, type TrackId } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const TRACK_CLASS: Record<TrackId, string> = {
  sprint: "text-ctp-mauve bg-ctp-mauve/10 ring-ctp-mauve/25",
  weak: "text-ctp-peach bg-ctp-peach/10 ring-ctp-peach/25",
  precision: "text-ctp-teal bg-ctp-teal/10 ring-ctp-teal/25",
  review: "text-ctp-blue bg-ctp-blue/10 ring-ctp-blue/25",
};

export const TRACK_TEXT: Record<TrackId, string> = {
  sprint: "text-ctp-mauve",
  weak: "text-ctp-peach",
  precision: "text-ctp-teal",
  review: "text-ctp-blue",
};

export function TrackBadge({ track, className }: { track: TrackId; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", TRACK_CLASS[track], className)}>
      {TRACKS[track].short}
    </span>
  );
}

const DIFF_CLASS: Record<Difficulty, string> = {
  easy: "text-ctp-green",
  medium: "text-ctp-yellow",
  hard: "text-ctp-red",
};

export function DifficultyLabel({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  return <span className={cn("text-xs font-medium capitalize", DIFF_CLASS[difficulty], className)}>{difficulty}</span>;
}
