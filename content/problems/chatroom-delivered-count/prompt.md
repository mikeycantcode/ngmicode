# Trace a message: `deliveredTo`

You're new on the chat backend team. Before you touch anything bigger, your
lead wants you to understand how a message travels from `chat.postMessage` to
everyone's open clients. Along the way, ship a small feature the desktop team
asked for.

## Part 1: explain (talk your interviewer through it)

Starting at `app.api.handle({ command: "chat.postMessage", ... })`, walk through
every step until frames reach `Connection.send()`. Cover at least:

- Which layer validates and rate-limits, and where authorization happens.
- What happens synchronously and what happens asynchronously.
- Everything else that reacts to a new message besides real-time delivery.
- How per-connection ordering is guaranteed.

## Part 2: build

The desktop client wants a "delivered to N devices" hint. Add a `deliveredTo`
field to a successful `chat.postMessage` response. It is the number of client
**connections** that the new message's `message.created` frame was queued on.

- Count every connection of every channel member. A user with two tabs counts twice. Members with no open connection count zero.
- The sender's own connections count too.
- Thread replies get `deliveredTo` as well.
- Failed posts don't get the field. They are error responses as before.
- Clients must still receive each message exactly once.

Visible tests must keep passing.
