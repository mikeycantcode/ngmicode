import { describe, expect, test, vi } from "vitest";
import { sleep } from "../../test/sleep";
import { funnel } from "../../src/funnel";

// From remeda/remeda#1115.
const UT = 16;

describe("without a reducer", () => {
  test("still calls the executor", () => {
    const mockFn = vi.fn<() => void>();
    const foo = funnel(mockFn, { triggerAt: "start" });
    foo.call();

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenLastCalledWith();
  });

  test("handles multiple calls", async () => {
    const mockFn = vi.fn<() => void>();
    const foo = funnel(mockFn, { triggerAt: "both", minQuietPeriodMs: UT });
    foo.call();
    foo.call();
    foo.call();

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenLastCalledWith();

    await sleep(2 * UT);

    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(mockFn).toHaveBeenLastCalledWith();
  });
});
