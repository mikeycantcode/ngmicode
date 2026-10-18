# Disappearing reactions

Support has escalated a bug from two enterprise customers. Their wording:

> "Reactions randomly disappear in our busy channels. I put a :white_check_mark:
> on a deploy message and a minute later it's gone. I never removed it.
> Someone else's reaction was there too."

> "The reaction counts on desktop drift. They sometimes show one fewer than
> mobile until you reload."

Mobile engineering adds one detail. On flaky networks the iOS client can send
`reactions.remove` twice when a user double-taps to un-react. It also sometimes
sends a remove for a reaction the user never added: the optimistic UI state
was wrong. Both are valid requests, and the server should handle them.

Last sprint, someone changed the reaction code for performance.

## Your task

1. Reproduce the bug with a failing test.
2. Find the root cause and fix it. Explain the *mechanism* to your interviewer: why does *another* user's reaction disappear?
3. Explain the second symptom, the count drift on other clients, and make sure your fix covers it.

## Acceptance criteria

- Removing a reaction the actor doesn't have is a no-op. Nothing changes, `reactions.remove` returns `changed: false`, and no `reaction.removed` event or frame goes out.
- Other users' reactions are never affected by someone else's remove.
- Removing the last reaction for an emoji removes that emoji from the message entirely.
- Visible tests still pass.
