# Security report: guest account sees internal messages

This report came in through the bug bounty program:

> I'm a **guest** in the Acme workspace. Acme's partner team invited me to
> exactly one channel. When I use search, results include messages from
> channels I was never added to, such as their #general. I could read
> roadmap discussion. I also noticed that message ids are sequential
> (`m_000123`), so I may be able to pull more data through other endpoints.

Read the security model in the README and `src/policy/`. Guests may only
read channels they were explicitly added to.

## Your task

1. Confirm the reported leak with a test.
2. Fix it.
3. The reporter hints at other endpoints. **Audit every read path that takes an id or returns message content.** Fix any path with the same class of bug. Tell your interviewer which paths you checked and what you found.
4. Explain why the bug got in, and what structural change would stop it from coming back.

## Acceptance criteria

- Search returns only messages from channels the actor can read under the policy. This applies to guests, non-members of private channels, and DMs.
- No endpoint returns message content from a channel the actor can't read, even when the actor guesses a valid id.
- A private channel's existence is not revealed to outsiders. Follow the codebase's existing convention.
- Legitimate access keeps working. Members of public channels still find messages in channels they haven't joined. Visible tests pass.
