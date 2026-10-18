# 405 Method Not Allowed

This is **Hono**, the small web framework for Web-standard runtimes. Today, a request to a
path that exists under a *different* HTTP method gets `404 Not Found`. API clients cannot tell
"no such resource" apart from "wrong verb". Several users have asked for proper `405` handling
(honojs/hono#4633). It must be **opt-in**: some teams return 404 on purpose.

## The ask

Add a new built-in middleware, following the layout and conventions of the existing ones:

```ts
import { methodNotAllowed } from 'hono/method-not-allowed' // i.e. src/middleware/method-not-allowed/index.ts

const app = new Hono()
app.use(methodNotAllowed({ app }))
app.get('/hello', (c) => c.text('Hello!'))
app.post('/hello', (c) => c.text('Posted!'))
// PUT /hello -> 405, Allow: GET, HEAD, POST
```

Options: `{ app, onMethodNotAllowed?: (c, allowedMethods: string[]) => Response | Promise<Response> }`.

## Behavior

- The middleware only acts when the downstream result is a **404** and the request **path is
  registered under some other method**. Then it responds `405` with body `Method Not Allowed`
  and an `Allow` header. Otherwise it leaves the response alone.
- `Allow` lists methods in route-registration order, comma + space separated, no duplicates.
  A `GET` route also allows `HEAD`, listed right after `GET`. Parameterized routes count:
  `GET /users/:id` makes `POST /users/me` a 405.
- `app.all()` / `app.use()` registrations are not methods. Ignore them when building `Allow`.
- A handler that *deliberately* returns 404 for a method it does handle keeps its 404.
- It must work with sub-apps: routes composed via `app.route('/api', api)`, and the middleware
  installed *inside* a sub-app (which may have its own `basePath`) that is then mounted.
- Produce the 405 as a normal response, not a thrown exception: `onError` must not fire, and
  outer middleware must see the final `405` status.
- With `onMethodNotAllowed`, its return value is the response (it receives the allowed methods).

## Non-goals

Changing default routing behavior. Answering `OPTIONS` requests specially.
