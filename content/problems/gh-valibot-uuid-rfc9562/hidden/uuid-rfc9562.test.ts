import { describe, test } from 'vitest';
import { uuid, type UuidIssue } from '../../src/actions/uuid/uuid.ts';
import { UUID_REGEX } from '../../src/regex.ts';
import {
  expectActionIssue,
  expectNoActionIssue,
} from '../../src/vitest/index.ts';

// Cases added by open-circle/valibot#1643.
describe('uuid (RFC 9562)', () => {
  describe('should return dataset without issues', () => {
    const action = uuid();

    test('for valid UUID v3, v5, v6 and v8, uppercase input, and the Nil and Max UUIDs', () => {
      expectNoActionIssue(action, [
        '5df41881-3aed-3515-88a7-2f4a814cf09e',
        '2ed6657d-e927-568b-95e1-2665a8aea6a2',
        '1ec9414c-232a-6b00-b3c8-9f6bdeced846',
        '2489e9ad-2ee2-8e00-8ec9-32d5f69181c0',
        'C1E12793-2E77-4611-874D-A4F9CC727E1E',
        '018F4F48-1658-7538-8AA9-E3B64526BB43',
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
      ]);
    });
  });

  describe('should return dataset with issues', () => {
    const action = uuid('message');
    const baseIssue: Omit<UuidIssue<string>, 'input' | 'received'> = {
      kind: 'validation',
      type: 'uuid',
      expected: null,
      message: 'message',
      requirement: UUID_REGEX,
    };

    test('for invalid versions', () => {
      expectActionIssue(action, baseIssue, [
        'c1e12793-2e77-0611-874d-a4f9cc727e1e',
        'c1e12793-2e77-9611-874d-a4f9cc727e1e',
        'c1e12793-2e77-a611-874d-a4f9cc727e1e',
        'c1e12793-2e77-f611-874d-a4f9cc727e1e',
      ]);
    });

    test('for invalid variants', () => {
      expectActionIssue(action, baseIssue, [
        'c1e12793-2e77-4611-074d-a4f9cc727e1e',
        'c1e12793-2e77-4611-774d-a4f9cc727e1e',
        'c1e12793-2e77-4611-c74d-a4f9cc727e1e',
        'c1e12793-2e77-4611-f74d-a4f9cc727e1e',
      ]);
    });

    test('for almost nil and max UUIDs', () => {
      expectActionIssue(action, baseIssue, [
        '00000000-0000-0000-0000-000000000001',
        'ffffffff-ffff-ffff-ffff-fffffffffffe',
        '00000000-0000-0000-ffff-ffffffffffff',
      ]);
    });
  });
});
