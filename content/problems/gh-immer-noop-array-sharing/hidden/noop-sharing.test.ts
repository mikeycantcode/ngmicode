// From immerjs/immer#1289 (__tests__/base.js array-methods suite, __tests__/map-set.js)
import {describe, it, expect, beforeEach} from "vitest"
import {
	Immer,
	isDraft,
	enablePatches,
	enableMapSet,
	enableArrayMethods
} from "../../src/immer"

enablePatches()
enableMapSet()
const {produce, produceWithPatches} = new Immer({
	autoFreeze: true,
	useStrictShallowCopy: false
})

describe("no-op calls preserve structural sharing (array-methods plugin)", () => {
	beforeEach(() => {
		enableArrayMethods()
	})

	it("push()/unshift() with no arguments return the base", () => {
		const base = {list: [1, 2, 3], keep: {x: 1}}
		const [next, patches] = produceWithPatches(base, (d: any) => {
			d.list.push(...[])
			d.list.unshift()
		})
		expect(next).toBe(base)
		expect(next.keep).toBe(base.keep)
		expect(patches).toHaveLength(0)
	})

	it("splice() that removes and inserts nothing returns the base", () => {
		const base = {list: [1, 2, 3]}
		const [next, patches] = produceWithPatches(base, (d: any) => {
			d.list.splice(1, 0)
		})
		expect(next).toBe(base)
		expect(patches).toHaveLength(0)
	})

	it("pop()/shift() on an empty array, sort()/reverse() on short arrays return the base", () => {
		const base = {popped: [], shifted: [], empty: [], single: [1]}
		const next = produce(base, (d: any) => {
			d.popped.pop()
			d.shifted.shift()
			d.empty.sort()
			d.empty.reverse()
			d.single.sort((a: number, b: number) => a - b)
			d.single.reverse()
		})
		expect(next).toBe(base)
	})

	it("no-op push()/splice() on arrays inside a Set preserve the arrays' identity", () => {
		const a1 = [1, 2, 3]
		const a2 = [4, 5, 6]
		const base = new Set<any>([a1, a2, {x: 1}])
		const next = produce(base, (d: any) => {
			for (const v of d) {
				if (Array.isArray(v) && v[0] === 1) v.push(...[])
				else if (Array.isArray(v)) v.splice(1, 0)
				else v.x = 2
			}
		})
		expect(next).not.toBe(base)
		const arrays = [...next].filter(Array.isArray)
		expect(arrays[0]).toBe(a1)
		expect(arrays[1]).toBe(a2)
	})

	it("reading (but not modifying) a nested object inside a Set does not leak the copy", () => {
		const untouched = {nested: {a: 1}}
		const base = new Set<any>([untouched, {x: 1}])
		const next = produce(base, (draft: any) => {
			for (const v of draft) {
				if (v.nested) {
					// Read only - creates a child draft (and a stray copy_
					// on the parent) but modifies nothing
					expect(v.nested.a).toBe(1)
				} else {
					v.x = 2
				}
			}
		})
		expect(next).not.toBe(base)
		const finalUntouched: any = Array.from(next).find((v: any) => v.nested)
		expect(finalUntouched).toBe(untouched)
		expect(finalUntouched.nested.a).toBe(1)
		expect(isDraft(finalUntouched.nested)).toBe(false)
	})
})
