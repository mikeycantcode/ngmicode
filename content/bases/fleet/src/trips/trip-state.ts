import { InvalidTransitionError } from "../shared/errors";
import type { TripStatus } from "./trip";

const TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  requested: ["matched", "cancelled"],
  matched: ["driver_arrived", "cancelled"],
  driver_arrived: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError("trip", from, to);
}

export function isTerminal(status: TripStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
