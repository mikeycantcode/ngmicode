import { parse, parseDocument } from '../../src/index.ts'

const now = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

function timed<T>(fn: () => T): { value: T; ms: number } {
  const t0 = now()
  const value = fn()
  return { value, ms: now() - t0 }
}

describe('folding of multi-line quoted scalars', () => {
  test('long whitespace run on a continuation line is linear', () => {
    const n = 30_000
    const spaces = ' '.repeat(n)
    const dq = timed(() => parse(`"a\n${spaces}b"`))
    expect(dq.value).toBe('a b')
    expect(dq.ms).toBeLessThan(300)

    const sq = timed(() => parse(`'a\n${spaces}b'`))
    expect(sq.value).toBe('a b')
    expect(sq.ms).toBeLessThan(300)
  })

  test('many lines with leading and trailing whitespace', () => {
    const lines = Array.from({ length: 20_000 }, (_, i) => `  \t w${i} \t`)
    const src = `key: "${lines.join('\n')}"\n`
    const { value, ms } = timed(() => parse(src))
    expect(value.key.startsWith('  \t w0 w1 w2')).toBe(true)
    expect(value.key.endsWith('w19998 w19999 \t')).toBe(true)
    expect(ms).toBeLessThan(1000)
  })

  test('folding semantics are unchanged', () => {
    expect(parse('"a  \n  b"')).toBe('a b')
    expect(parse('"a \t\r\n\t b"')).toBe('a b')
    expect(parse('"a\n\n  b"')).toBe('a\nb')
    expect(parse('"a\n\n\n b\n  "')).toBe('a\n\nb ')
    expect(parse("'it''s  \n  \n  fine'")).toBe("it's\nfine")
    expect(parse('"  lead\n trail  "')).toBe('  lead trail  ')
    const doc = parseDocument('"x\r\n\r\n  y"')
    expect(doc.errors).toHaveLength(0)
    expect(doc.toJS()).toBe('x\ny')
  })
})
