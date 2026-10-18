// From immerjs/immer#1255 (__tests__/base.js, array-methods plugin suite)
import {describe, it, expect, beforeEach} from "vitest"
import {
	Immer,
	isDraft,
	applyPatches,
	enablePatches,
	enableArrayMethods
} from "../../src/immer"

enablePatches()
const {produce, produceWithPatches} = new Immer({
	autoFreeze: true,
	useStrictShallowCopy: false
})

describe("reordering array methods (array-methods plugin)", () => {
	beforeEach(() => {
		enableArrayMethods()
	})

	it("mutating an element after reverse() does not mutate the base", () => {
		const reordered = {id: 3}
		const baseState = [{id: 1}, {id: 2}, reordered]
		const nextState = produce(baseState, (s: any) => {
			s.reverse()
			// After reverse, the element at index 0 is the relocated base
			// object. It must be drafted, otherwise writing to it mutates base.
			expect(isDraft(s[0])).toBe(true)
			s[0].id = 99
		})
		expect(baseState).toEqual([{id: 1}, {id: 2}, {id: 3}])
		expect(reordered).toEqual({id: 3})
		expect(nextState).toEqual([{id: 99}, {id: 2}, {id: 1}])
	})

	it("mutating an element after sort() does not mutate the base", () => {
		const baseState = [{value: 3}, {value: 1}, {value: 2}]
		const [nextState, patches, inverse] = produceWithPatches(
			baseState,
			(s: any) => {
				s.sort((a: any, b: any) => a.value - b.value)
				expect(isDraft(s[0])).toBe(true)
				s[0].value = 99
			}
		)
		expect(baseState).toEqual([{value: 3}, {value: 1}, {value: 2}])
		expect(nextState).toEqual([{value: 99}, {value: 2}, {value: 3}])
		expect(applyPatches(baseState, patches)).toEqual(nextState)
		expect(applyPatches(nextState, inverse)).toEqual(baseState)
	})
})
