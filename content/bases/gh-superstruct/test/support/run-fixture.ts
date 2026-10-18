// ngmicode sandbox adapter (not part of upstream superstruct).
//
// Upstream `test/index.test.ts` discovers the fixtures in `test/validation/**`
// at runtime with `fs.readdirSync` and dynamic `import()`, and uses lodash's
// `pick`. Neither works in the sandbox, so the per-fixture assertion logic
// lives here verbatim and `test/validation.test.ts` imports every fixture
// explicitly.

import { expect, it } from 'vitest'
import { assert as assertValue, create as createValue, StructError } from '../../src'

export type Fixture = {
  Struct: any
  data: unknown
  create?: boolean
  only?: boolean
  skip?: boolean
  output?: unknown
  failures?: any[]
}

function pick(obj: any, ...props: string[]) {
  const out: Record<string, unknown> = {}
  for (const p of props) if (obj != null && p in obj) out[p] = obj[p]
  return out
}

export function checkFixture(name: string, module: Fixture) {
  const { Struct, data, create } = module
  let actual
  let err

  try {
    if (create) {
      actual = createValue(data, Struct)
    } else {
      assertValue(data, Struct)
      actual = data
    }
  } catch (e) {
    if (!(e instanceof StructError)) {
      throw e
    }

    err = e
  }

  if ('output' in module) {
    if (err) {
      throw new Error(
        `Expected "${name}" fixture not to throw an error but it did:\n\n${err}`
      )
    }

    expect(actual).toStrictEqual(module.output)
  } else if ('failures' in module) {
    if (!err) {
      throw new Error(
        `Expected "${name}" fixture to throw an error but it did not.`
      )
    }

    const props = ['type', 'path', 'refinement', 'value', 'branch']
    const actualFailures = err
      .failures()
      .map((failure: any) => pick(failure, ...props))

    expect(actualFailures).toStrictEqual(module.failures)
    expect(pick(err, ...props)).toStrictEqual(module.failures![0])
  } else {
    throw new Error(
      `The "${name}" fixture did not define an \`output\` or \`failures\` export.`
    )
  }
}

export function runFixture(name: string, module: Fixture) {
  const run = module.only ? it.only : module.skip ? it.skip : it
  run(name, () => checkFixture(name, module))
}
