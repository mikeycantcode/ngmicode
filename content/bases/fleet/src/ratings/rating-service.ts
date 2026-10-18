import type { Clock } from "../shared/clock";
import { ConflictError, ForbiddenError, ValidationError } from "../shared/errors";
import type { EventBus } from "../shared/events";
import type { IdGenerator } from "../shared/ids";
import type { TripService } from "../trips/trip-service";

export interface Rating {
  id: string;
  tripId: string;
  /** who is being rated */
  subjectId: string;
  authorId: string;
  stars: number;
  comment: string | null;
  at: number;
}

const WINDOW = 100; // average over the most recent N ratings
const MAX_COMMENT = 500;

export class RatingService {
  private readonly byTripAndAuthor = new Map<string, Rating>();
  private readonly bySubject = new Map<string, Rating[]>();

  constructor(private readonly deps: { trips: TripService; bus: EventBus; clock: Clock; ids: IdGenerator }) {}

  /** Rider rates the driver of a completed trip. One rating per trip. */
  rateDriver(tripId: string, riderId: string, stars: number, comment?: string | null): Rating {
    const trip = this.deps.trips.get(tripId);
    if (trip.riderId !== riderId) throw new ForbiddenError("not your trip");
    if (trip.status !== "completed" || !trip.driverId) throw new ConflictError("trip_not_completed", "only completed trips can be rated");
    return this.add(tripId, trip.driverId, riderId, stars, comment ?? null);
  }

  /** Driver rates the rider of a completed trip. */
  rateRider(tripId: string, driverId: string, stars: number, comment?: string | null): Rating {
    const trip = this.deps.trips.get(tripId);
    if (trip.driverId !== driverId) throw new ForbiddenError("not your trip");
    if (trip.status !== "completed") throw new ConflictError("trip_not_completed", "only completed trips can be rated");
    return this.add(tripId, trip.riderId, driverId, stars, comment ?? null);
  }

  /** Mean of the most recent 100 ratings, rounded to 2dp; null if unrated. */
  average(subjectId: string): { average: number | null; count: number } {
    const all = this.bySubject.get(subjectId) ?? [];
    const recent = all.slice(-WINDOW);
    if (!recent.length) return { average: null, count: 0 };
    const sum = recent.reduce((s, r) => s + r.stars, 0);
    return { average: Math.round((sum / recent.length) * 100) / 100, count: all.length };
  }

  private add(tripId: string, subjectId: string, authorId: string, stars: number, comment: string | null): Rating {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new ValidationError("stars must be an integer 1..5");
    if (comment !== null && comment.length > MAX_COMMENT) throw new ValidationError(`comment must be <= ${MAX_COMMENT} chars`);
    const key = `${tripId}:${authorId}`;
    if (this.byTripAndAuthor.has(key)) throw new ConflictError("already_rated", "trip already rated");
    const rating: Rating = { id: this.deps.ids.next("rat"), tripId, subjectId, authorId, stars, comment, at: this.deps.clock.now() };
    this.byTripAndAuthor.set(key, rating);
    const list = this.bySubject.get(subjectId) ?? [];
    list.push(rating);
    this.bySubject.set(subjectId, list);
    this.deps.bus.emit({ type: "rating.submitted", at: rating.at, entityId: tripId, data: { subjectId, authorId, stars } });
    return rating;
  }
}
