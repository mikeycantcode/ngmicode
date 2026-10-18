import type { ParamIndexMap, Params, Router } from '../../src/router'
import { LinearRouter } from '../../src/router/linear-router'
import { PatternRouter } from '../../src/router/pattern-router'
import { RegExpRouter } from '../../src/router/reg-exp-router'
import { TrieRouter } from '../../src/router/trie-router'

// From honojs/hono#5252 (cases added to src/router/common.case.test.ts).
// Every router must agree on suffix and trailing wildcards.
const routers: [string, () => Router<string>][] = [
  ['LinearRouter', () => new LinearRouter<string>()],
  ['PatternRouter', () => new PatternRouter<string>()],
  ['RegExpRouter', () => new RegExpRouter<string>()],
  ['TrieRouter', () => new TrieRouter<string>()],
]

const matcher = (router: Router<string>) => (method: string, path: string) => {
  const [matchRes, stash] = router.match(method, path)
  return matchRes.map((r) =>
    stash
      ? {
          handler: r[0],
          params: Object.keys(r[1]).reduce(
            (acc, key) => {
              acc[key] = stash[(r[1] as ParamIndexMap)[key]]
              return acc
            },
            Object.create(null) as Params
          ),
        }
      : { handler: r[0], params: r[1] as Params }
  )
}

describe('Wildcard routes do not over-match a prefix', () => {
  it('Suffix wildcard: /assets* matches /assets, /assets-v2, /assets/app.js but not /asset', () => {
    for (const [name, newRouter] of routers) {
      const router = newRouter()
      router.add('GET', '/assets*', 'assets')
      const match = matcher(router)

      for (const path of ['/assets', '/assets-v2', '/assets/app.js']) {
        const res = match('GET', path)
        expect({ name, path, length: res.length }).toEqual({ name, path, length: 1 })
        expect(res[0].handler).toEqual('assets')
      }
      expect({ name, length: match('GET', '/asset').length }).toEqual({ name, length: 0 })
    }
  })

  it('Trailing wildcard: /path/* matches /path and /path/to/file but not /pathfoo', () => {
    for (const [name, newRouter] of routers) {
      const router = newRouter()
      router.add('GET', '/path/*', 'path')
      const match = matcher(router)

      for (const path of ['/path', '/path/to/file']) {
        const res = match('GET', path)
        expect({ name, path, length: res.length }).toEqual({ name, path, length: 1 })
        expect(res[0].handler).toEqual('path')
      }
      expect({ name, length: match('GET', '/pathfoo').length }).toEqual({ name, length: 0 })
    }
  })

  it('Trailing wildcard after a middle wildcard: /a/*/b/* matches /a/x/b and /a/x/b/c but not /a/x/bz', () => {
    for (const [name, newRouter] of routers) {
      const router = newRouter()
      router.add('GET', '/a/*/b/*', 'b')
      const match = matcher(router)

      for (const path of ['/a/x/b', '/a/x/b/c']) {
        const res = match('GET', path)
        expect({ name, path, length: res.length }).toEqual({ name, path, length: 1 })
        expect(res[0].handler).toEqual('b')
      }
      expect({ name, length: match('GET', '/a/x/bz').length }).toEqual({ name, length: 0 })
    }
  })
})
