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
  /** Real-world problems: the pull request this problem replays. */
  source?: { pr: number; url: string; title: string };
}

/** content/bases/<id>/ngmicode.json for real-repo bases. */
export interface BaseManifest {
  source?: { repo: string; commit: string; license: string; url: string };
  alias?: Record<string, string>;
}

export interface ProblemMeta extends ProblemSpec {
  repo?: BaseManifest["source"];
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
