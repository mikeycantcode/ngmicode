import { ValidationError } from "../util/errors";

export const MAX_CHANNEL_NAME = 80;

const RESERVED = new Set(["here", "channel", "everyone"]);

/** Normalizes a user-supplied channel name (Slack-style rules). */
export function normalizeChannelName(raw: string): string {
  let name = raw
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (name.length > MAX_CHANNEL_NAME) name = name.slice(0, MAX_CHANNEL_NAME).replace(/-+$/, "");
  if (!name) throw new ValidationError("channel name must contain a letter or digit", "name");
  if (RESERVED.has(name)) throw new ValidationError(`"${name}" is a reserved name`, "name");
  return name;
}
