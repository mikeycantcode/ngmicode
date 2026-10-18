import { describe, expect, test } from 'vitest';
// Imported through the public entry point: the action must be exported from the package.
import * as v from '../../src/index.ts';
import {
  expectActionIssue,
  expectNoActionIssue,
} from '../../src/vitest/index.ts';

// Cases from open-circle/valibot#1370 (src/actions/ksuid/ksuid.test.ts).
describe('ksuid', () => {
  test('should return action object', () => {
    const message = () => 'message';
    expect(v.ksuid(message)).toStrictEqual({
      kind: 'validation',
      type: 'ksuid',
      reference: v.ksuid,
      expects: null,
      requirement: v.KSUID_REGEX,
      async: false,
      message,
      '~run': expect.any(Function),
    });
    expect(v.ksuid()).toStrictEqual({
      kind: 'validation',
      type: 'ksuid',
      reference: v.ksuid,
      expects: null,
      requirement: v.KSUID_REGEX,
      async: false,
      message: undefined,
      '~run': expect.any(Function),
    });
  });

  test('should return dataset without issues for valid KSUIDs', () => {
    expectNoActionIssue(v.ksuid(), [
      '0ujsswThIGTUYm2K8FjOOfXtY1K',
      '2EbKL0J9w8vLcK7BDmFnRQy0w1p',
      '1srOrx2ZWZBpBUvZwXKQmoEYga2',
      '36QGvpFmeYRDTH3mI14XJz31xUs',
    ]);
  });

  test('should return dataset with issues for invalid KSUIDs', () => {
    const baseIssue = {
      kind: 'validation' as const,
      type: 'ksuid' as const,
      expected: null,
      message: 'message',
      requirement: v.KSUID_REGEX,
    };
    expectActionIssue(v.ksuid('message'), baseIssue, [
      '',
      ' ',
      '\n',
      ' 0ujsswThIGTUYm2K8FjOOfXtY1K',
      '0ujsswThIGTUYm2K8FjOOfXtY1K ',
      '0ujsswThIGTUYm2K8FjOOfXtY1',
      '2EbKL0J9w8vLcK7B',
      '0ujsswThIGTUYm2K8FjOOfXtY1Ka',
      '2EbKL0J9w8vLcK7BDmFnRQy0w1p123456',
      '!ujsswThIGTUYm2K8FjOOfXtY1K',
      '0ujsswThIGTUYm2K8FjOOfXtY@1',
    ]);
  });

  test('should use the KSUID label in the default message', () => {
    const result = v.safeParse(v.pipe(v.string(), v.ksuid()), 'nope');
    expect(result.success).toBe(false);
    expect(result.issues?.[0].message).toBe('Invalid KSUID: Received "nope"');
  });
});
