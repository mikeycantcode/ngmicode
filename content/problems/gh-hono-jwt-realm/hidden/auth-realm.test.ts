import * as test_keys from '../../src/middleware/jwk/keys.test.json'
import { jwk } from '../../src/middleware/jwk'
import { jwt } from '../../src/middleware/jwt'
import { Hono } from '../../src/hono'

const verify_keys = test_keys.public_keys

// From honojs/hono#5141
describe('JWT: WWW-Authenticate realm', () => {
  it('Should use the configured realm', async () => {
    const app = new Hono()
    app.use('/auth/*', jwt({ secret: 'a-secret', alg: 'HS256', realm: 'my-api' }))
    app.get('/auth/*', (c) => c.text('ok'))

    const res = await app.request('http://localhost/auth/page?a=1')

    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="my-api",error="invalid_request",error_description="no authorization included in request"'
    )
  })

  it('Should use the configured realm for an invalid token', async () => {
    const app = new Hono()
    app.use('/auth/*', jwt({ secret: 'a-secret', alg: 'HS256', realm: 'my-api' }))
    app.get('/auth/*', (c) => c.text('ok'))

    const req = new Request('http://localhost/auth/page')
    req.headers.set('Authorization', 'Bearer invalid-token')
    const res = await app.request(req)

    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="my-api",error="invalid_token",error_description="token verification failure"'
    )
  })

  it('Should escape double quotes in the realm', async () => {
    const app = new Hono()
    app.use('/auth/*', jwt({ secret: 'a-secret', alg: 'HS256', realm: 'my "quoted" api' }))
    app.get('/auth/*', (c) => c.text('ok'))

    const res = await app.request('http://localhost/auth/page')

    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="my \\"quoted\\" api",error="invalid_request",error_description="no authorization included in request"'
    )
  })
})

describe('JWK: WWW-Authenticate realm', () => {
  it('Should default to the request URL', async () => {
    const app = new Hono()
    app.use('/auth/*', jwk({ keys: verify_keys, alg: ['RS256'] }))
    app.get('/auth/*', (c) => c.text('ok'))

    const res = await app.request('http://localhost/auth/page?a=1')

    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="http://localhost/auth/page?a=1",error="invalid_request",error_description="no authorization included in request"'
    )
  })

  it('Should use the configured realm for an invalid token', async () => {
    const app = new Hono()
    app.use('/auth/*', jwk({ keys: verify_keys, alg: ['RS256'], realm: 'my-api' }))
    app.get('/auth/*', (c) => c.text('ok'))

    const req = new Request('http://localhost/auth/page')
    req.headers.set('Authorization', 'Bearer invalid-token')
    const res = await app.request(req)

    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="my-api",error="invalid_token",error_description="token verification failure"'
    )
  })

  it('Should escape double quotes in the realm', async () => {
    const app = new Hono()
    app.use('/auth/*', jwk({ keys: verify_keys, alg: ['RS256'], realm: 'my "quoted" api' }))
    app.get('/auth/*', (c) => c.text('ok'))

    const res = await app.request('http://localhost/auth/page')

    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(
      'Bearer realm="my \\"quoted\\" api",error="invalid_request",error_description="no authorization included in request"'
    )
  })
})
