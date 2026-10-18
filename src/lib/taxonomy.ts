export type Difficulty = "easy" | "medium" | "hard";
export type TrackId = "sprint" | "weak" | "precision" | "review";

export interface Track {
  id: TrackId;
  name: string;
  short: string;
  description: string;
  agent: "strong" | "weak";
  /** Accent color token (catppuccin name) */
  color: string;
}

export const TRACKS: Record<TrackId, Track> = {
  sprint: {
    id: "sprint",
    name: "Codebase Sprint",
    short: "Sprint",
    description:
      "A large unfamiliar codebase and a frontier coding agent. Ship a real feature in 30–60 minutes. Scored on orientation speed, task decomposition, and verification.",
    agent: "strong",
    color: "mauve",
  },
  weak: {
    id: "weak",
    name: "Weak Agent",
    short: "Weak",
    description:
      "A smaller, older model with a short attention span on a moderate codebase. You must decompose, feed the right context, and catch its mistakes.",
    agent: "weak",
    color: "peach",
  },
  precision: {
    id: "precision",
    name: "Precision Spec",
    short: "Precision",
    description:
      "A small, sharply scoped task with a strong agent. Scored on how precisely you specify behavior: names, edge cases, ordering, errors.",
    agent: "strong",
    color: "teal",
  },
  review: {
    id: "review",
    name: "Debug & Review",
    short: "Review",
    description:
      "Read, debug, and optimize existing code with an AI pair. Mirrors the code-comprehension rounds now run at large tech companies.",
    agent: "strong",
    color: "blue",
  },
};

export interface Category {
  id: string;
  name: string;
  blurb: string;
  parents: string[];
}

/** Ordered roughly top-to-bottom for the roadmap tree. */
export const CATEGORIES: Category[] = [
  { id: "fundamentals", name: "Agent Fundamentals", blurb: "Prompting, reading agent output, and the basic loop.", parents: [] },
  { id: "comprehension", name: "Codebase Comprehension", blurb: "Orient fast in unfamiliar code.", parents: ["fundamentals"] },
  { id: "specs", name: "Spec Writing", blurb: "Turn fuzzy asks into unambiguous instructions.", parents: ["fundamentals"] },
  { id: "debugging", name: "Debugging", blurb: "Reproduce, isolate, and fix with an agent.", parents: ["comprehension"] },
  { id: "features", name: "Feature Building", blurb: "Extend real systems end to end.", parents: ["comprehension"] },
  { id: "delegation", name: "Precise Delegation", blurb: "Constrain the agent so it cannot go wrong.", parents: ["specs"] },
  { id: "refactoring", name: "Refactoring", blurb: "Change structure without changing behavior.", parents: ["features"] },
  { id: "data-api", name: "Data & API Design", blurb: "Model data and design interfaces that last.", parents: ["features"] },
  { id: "performance", name: "Performance", blurb: "Find the hot path and fix complexity.", parents: ["debugging"] },
  { id: "async", name: "Concurrency & Async", blurb: "Races, retries, ordering, and backpressure.", parents: ["debugging"] },
  { id: "testing", name: "Testing & Verification", blurb: "Prove the agent's code is right.", parents: ["refactoring", "delegation"] },
  { id: "security", name: "Security & Robustness", blurb: "Validation, authz, and failure modes.", parents: ["data-api", "async"] },
  { id: "integration", name: "System Integration", blurb: "Multi-module changes under time pressure.", parents: ["testing", "security", "performance"] },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export const MODELS = {
  strong: process.env.AGENT_MODEL_STRONG || "deepseek/deepseek-v4.1-flash",
  weak: process.env.AGENT_MODEL_WEAK || "openai/gpt-5.6-luna",
  grader: process.env.GRADER_MODEL || "deepseek/deepseek-v4-pro",
};

export const MODEL_LABELS: Record<string, string> = {
  "deepseek/deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "openai/gpt-5.6-luna": "GPT-5.6 Luna",
  "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
};
