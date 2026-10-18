import { methodNotAllowed } from '../../src/middleware/method-not-allowed'
import { Hono } from '../../src/hono'

// From honojs/hono#5132 (src/middleware/method-not-allowed/index.test.ts)
describe('Method Not Allowed Middleware', () => {
  it('returns 405 with every allowed method for an existing path', async () => {
    const app = new Hono()
    app.use(methodNotAllowed({ app }))
    app.get('/resource', (c) => c.text('GET'))
    app.post('/resource', (c) => c.text('POST'))
    app.delete('/resource', (c) => c.text('DELETE'))

    const res = await app.request('/resource', { method: 'PUT' })

    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, POST, DELETE')
    expect(await res.text()).toBe('Method Not Allowed')

    const resUsingCachedRouter = await app.request('/resource', { method: 'OPTIONS' })
    expect(resUsingCachedRouter.status).toBe(405)
    expect(resUsingCachedRouter.headers.get('Allow')).toBe('GET, HEAD, POST, DELETE')

    const missing = await app.request('/missing', { method: 'POST' })
    expect(missing.status).toBe(404)
    expect(missing.headers.has('Allow')).toBe(false)
  })

  it('matches parameterized and overlapping routes without duplicate methods', async () => {
    const app = new Hono()
    app.use(methodNotAllowed({ app }))
    app.get('/users/:id', (_c, next) => next())
    app.get('/users/me', (c) => c.text('me'))
    app.patch('/users/:id', (c) => c.text(c.req.param('id')))

    const res = await app.request('/users/me', { method: 'POST' })

    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, PATCH')
  })

  it('preserves an intentional 404 from a handler registered for the request method', async () => {
    const app = new Hono()
    app.use(methodNotAllowed({ app }))
    app.get('/users/:id', (c) => c.notFound())
    app.post('/users/:id', (c) => c.text('Created'))

    const res = await app.request('/users/123')

    expect(res.status).toBe(404)
    expect(res.headers.has('Allow')).toBe(false)
  })

  it('works with routes mounted using app.route()', async () => {
    const api = new Hono()
    api.get('/resource', (c) => c.text('GET'))
    api.post('/resource', (c) => c.text('POST'))

    const app = new Hono()
    app.use(methodNotAllowed({ app }))
    app.route('/api', api)

    const res = await app.request('/api/resource', { method: 'DELETE' })

    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, POST')
  })

  it('works when installed in an app mounted using app.route()', async () => {
    const api = new Hono().basePath('/v1')
    api.use(methodNotAllowed({ app: api }))
    api.get('/resource', (c) => c.text('GET'))
    api.post('/resource', (c) => c.text('POST'))

    const app = new Hono()
    app.route('/api', api)

    const res = await app.request('/api/v1/resource', { method: 'DELETE' })

    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD, POST')
  })

  it('lets outer middleware observe the 405 and supports a custom response', async () => {
    const onError = vi.fn(() => new Response('error', { status: 500 }))
    const app = new Hono()
    let observedStatus: number | undefined
    app.onError(onError)
    app.use(async (c, next) => {
      await next()
      observedStatus = c.res.status
    })
    app.use(
      methodNotAllowed({
        app,
        onMethodNotAllowed: (c, allowedMethods) =>
          c.json({ error: 'Method Not Allowed', allowedMethods }, 405, {
            Allow: allowedMethods.join(', '),
          }),
      })
    )
    app.get('/resource', (c) => c.text('GET'))
    app.post('/resource', (c) => c.text('POST'))

    const res = await app.request('/resource', { method: 'PUT' })

    expect(res.status).toBe(405)
    expect(observedStatus).toBe(405)
    expect(onError).not.toHaveBeenCalled()
    expect(res.headers.get('Allow')).toBe('GET, HEAD, POST')
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/)
    expect(await res.json()).toEqual({
      error: 'Method Not Allowed',
      allowedMethods: ['GET', 'HEAD', 'POST'],
    })
  })
})
