// From immerjs/immer#1295 (__tests__/patch.js)
import {describe, it, expect} from "vitest"
import {produce, applyPatches, enablePatches} from "../../src/immer"

enablePatches()

function check(
	base: any,
	producer: (d: any) => void,
	expectedPatches: any[],
	expectedInversePatches: any[],
	expectedResult: any
) {
	let patches: any, inversePatches: any
	const result = produce(base, producer, (p, ip) => {
		patches = p
		inversePatches = ip
	})
	expect(result).toEqual(expectedResult)
	expect(patches).toEqual(expectedPatches)
	expect(inversePatches).toEqual(expectedInversePatches)
	expect(applyPatches(base, patches)).toEqual(result)
	expect(applyPatches(result, inversePatches)).toEqual(base)
}

describe("assigning a base value back over its own draft", () => {
	// Reading a property drafts it; writing the base value back leaves the
	// property untouched, so it must not show up in the patches at all.
	it("root level", () => {
		const rootChild = {id: 1}
		check(
			{child: rootChild, other: 0},
			d => {
				d.child
				d.child = rootChild
				d.other = 1
			},
			[{op: "replace", path: ["other"], value: 1}],
			[{op: "replace", path: ["other"], value: 0}],
			{child: {id: 1}, other: 1}
		)
	})

	it("nested", () => {
		const nestedChild = {id: 1}
		check(
			{a: {child: nestedChild, other: 0}},
			d => {
				d.a.child
				d.a.child = nestedChild
				d.a.other = 1
			},
			[{op: "replace", path: ["a", "other"], value: 1}],
			[{op: "replace", path: ["a", "other"], value: 0}],
			{a: {child: {id: 1}, other: 1}}
		)
	})
})
