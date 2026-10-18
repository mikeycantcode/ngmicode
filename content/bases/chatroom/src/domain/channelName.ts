import { ValidationError } from "../util/errors";

export const MAX_CHANNEL_NAME = 80;

/**
 * Normalizes a user-supplied channel name.
 * TODO(chat-212): this is too permissive — product wants Slack-style rules.
 */
export function normalizeChannelName(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (!name) throw new ValidationError("channel name is required", "name");
  return name.slice(0, MAX_CHANNEL_NAME);
}
