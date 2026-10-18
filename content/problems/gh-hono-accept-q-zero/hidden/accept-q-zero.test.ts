import { accepts } from '../../src/helper/accepts/accepts'
import { languageDetector } from '../../src/middleware/language'
import { Hono } from '../../src/hono'

// From honojs/hono#5311
describe('accepts: q=0 entries', () => {
  test('should not match entries explicitly rejected with q=0', () => {
    const c = {
      req: {
        header: () => 'application/json;q=0',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const options = {
      header: 'Accept' as const,
      supports: ['application/json'],
      default: 'text/html',
    }
    const result = accepts(c, options)
    expect(result).toBe('text/html')
  })

  test('should not match a subtype wildcard the client rejected with q=0', () => {
    const c = {
      req: {
        header: () => 'application/*;q=0',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const options = {
      header: 'Accept' as const,
      supports: ['application/json'],
      default: 'text/html',
    }
    const result = accepts(c, options)
    expect(result).toBe('text/html')
  })
})

describe('languageDetector: q=0 entries', () => {
  const createTestApp = (options = {}) => {
    const app = new Hono()
    app.use('/*', languageDetector(options))
    app.get('/*', (c) => c.text(c.get('language')))
    return app
  }

  it('should skip q=0 languages before falling back to the default', async () => {
    const app = createTestApp({
      supportedLanguages: ['fr', 'en'],
      fallbackLanguage: 'en',
      order: ['header'],
    })

    const res = await app.request('/', {
      headers: {
        'accept-language': 'fr;q=0,de;q=0.8',
      },
    })
    expect(await res.text()).toBe('en')
  })

  it('should continue to the next detector after a zero-quality language', async () => {
    const app = createTestApp({
      supportedLanguages: ['fr', 'en', 'ja'],
      fallbackLanguage: 'en',
      order: ['header', 'querystring'],
    })

    const res = await app.request('/?lang=ja', {
      headers: { 'accept-language': 'fr;q=0' },
    })
    expect(await res.text()).toBe('ja')
    expect(res.headers.get('set-cookie')).toContain('language=ja')
  })
})
