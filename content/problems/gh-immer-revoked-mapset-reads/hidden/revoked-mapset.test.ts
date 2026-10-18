// From immerjs/immer#1298 (__tests__/base.js)
import {describe, it, expect} from "vitest"
import {Immer, enableMapSet} from "../../src/immer"

enableMapSet()

const createBaseState = () => ({
	aMap: new Map<string, any>([
		["jedi", {name: "Luke", skill: 10}],
		["jediTotal", 42],
		["force", true]
	]),
	aSet: new Set<any>(["Luke", 42, {jedi: "Yoda"}])
})

for (const autoFreeze of [true, false]) {
	describe(`revoked map/set drafts - auto-freeze=${autoFreeze}`, () => {
		const {produce} = new Immer({autoFreeze})

		it("revokes map proxies for reads that do not go through get", () => {
			let m: any
			produce(createBaseState(), s => {
				m = s.aMap
			})
			const revoked = /has been revoked|minified error nr: 3/
			expect(() => m.has("jedi")).toThrow(revoked)
			expect(() => m.size).toThrow(revoked)
			expect(() => m.keys()).toThrow(revoked)
			expect(() => m.forEach(() => {})).toThrow(revoked)
		})

		it("revokes set size reads", () => {
			let m: any
			produce(createBaseState(), s => {
				m = s.aSet
			})
			expect(() => m.size).toThrow(/has been revoked|minified error nr: 3/)
		})
	})
}
