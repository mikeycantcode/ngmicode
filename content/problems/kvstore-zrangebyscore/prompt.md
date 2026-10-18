# Spec out ZRANGEBYSCORE

The leaderboard team wants to page through a sorted set by score. Their ticket
is below, together with the excerpt from the Redis docs they pasted. Your
instructions to the agent are graded for precision.
Your job is to turn this ticket into a spec the agent cannot misread, then
verify what it produced.

Sorted-set commands live in `src/commands/zsets.ts`. The data structure is
`src/datatypes/sorted-set.ts`.

---

> **TICKET LB-212: need ZRANGEBYSCORE**
>
> We call `ZRANGEBYSCORE board (100 +inf WITHSCORES LIMIT 0 50` to get the next
> page of players strictly above a score. It should behave like Redis. Players
> with the same score need a stable order, or the pages jump around. We print the
> scores straight from the reply, so they have to look like what `ZSCORE`
> returns (no `100.0`). Sets can have ~1M members and we page a lot, so please
> don't scan the whole set per call.
>
> We also hit an annoying case: our client sometimes sends `LIMIT 0 -1` to mean
> "no limit". And if someone fat-fingers a bound, we'd like the same error that
> `ZCOUNT` gives.

> **Redis docs (excerpt)**
>
> `ZRANGEBYSCORE key min max [WITHSCORES] [LIMIT offset count]`
>
> Returns all the elements in the sorted set at key with a score between min and
> max (including elements with score equal to min or max). The elements are
> considered to be ordered from low to high scores. Elements with the same score
> are returned in lexicographical order.
>
> The optional LIMIT argument can be used to only get a range of the matching
> elements (similar to SELECT LIMIT offset, count in SQL). A negative count
> returns all elements from the offset. A negative offset returns an empty list.
>
> min and max can be -inf and +inf. By default, the interval specified by min
> and max is closed (inclusive). It is possible to specify an open interval
> (exclusive) by prefixing the score with the character `(`.

---

## Acceptance criteria (from the interviewer)

- Same option handling as the rest of this codebase: options are case-insensitive,
  may come in any order, and anything unrecognized (including `LIMIT` with
  fewer than two values after it) is `ERR syntax error`.
- A missing key returns an empty array. A non-zset key returns the standard WRONGTYPE error.
- Non-integer LIMIT values return the standard integer error.
- The command is read-only (never WAL-logged) and counts as a keyspace hit or miss like other reads.
- If min is greater than max, or nothing matches, return an empty array (not an error).
- Not a full scan per call. The rubric checks the complexity.

Out of scope: `ZREVRANGEBYSCORE`, `ZRANGE ... BYSCORE`, `ZRANGEBYLEX`.
