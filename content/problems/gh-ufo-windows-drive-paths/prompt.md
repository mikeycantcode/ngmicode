# Paths with a colon lose their leading slash

You maintain **ufo**, a URL-utilities library. A user filed this issue:

> We build asset URLs like `https://test.com/t:est` and
> `https://cdn.example.com/users/u:42/avatar.png`. After `normalizeURL` (and
> anything else that parses and re-stringifies), they come back broken:
> `https://test.comt:est`, and `https://cdn.example.com/usersu:42/avatar.png`.
> URLs without a colon in the path are fine.

Nobody on the team knows this part of the parser well. You have a smaller agent
that only sees a few files at a time.

## The ask

Reproduce the bug, find the root cause, and fix it.

## Acceptance criteria

- For `http(s)` and other non-`file:` URLs, the pathname keeps every slash.
  `parseURL("https://test.com/t:est").pathname` is `"/t:est"`.
- Windows `file://` URLs keep their current behavior.
  `parseURL("file:///C:/home/user").pathname` is still `"C:/home/user"`.
- All existing tests pass. Add a regression test for the reported case.

## Constraints

Keep the change small and in the library's parsing layer. Don't change the shape
of `ParsedURL`.
