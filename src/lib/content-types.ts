import type { Difficulty, TrackId } from "./taxonomy";

export type FileMap = Record<string, string>;

/** Shape of content/problems/<slug>/problem.json */
export interface ProblemSpec {
  slug: string;
  title: string;
  base: string;
  track: TrackId;
  category: string;
  difficulty: Difficulty;
  timeLimit: number;
  summary: string;
  tags?: string[];
  /** Base files deleted from the starter. */
  remove?: string[];
  /** Hidden tests are allowed to pass on the starter (pure explanation/review tasks). */
  starterPasses?: boolean;
}

export interface ProblemMeta extends ProblemSpec {
  order: number;
  fileCount: number;
  loc: number;
  hiddenTestCount: number;
}

/** Full compiled problem — server only. */
export interface ProblemBundle extends ProblemMeta {
  prompt: string;
  rubric: string;
  starter: FileMap;
  hidden: FileMap;
  solution: FileMap;
}
