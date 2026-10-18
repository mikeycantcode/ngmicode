// From immerjs/immer#1292 (__tests__/base.js, array-methods plugin suite)
import {describe, test, expect, beforeEach} from "vitest"
import {Immer, enableArrayMethods} from "../../src/immer"

const {produce} = new Immer({autoFreeze: true, useStrictShallowCopy: false})

const createTestData = () => ({
	items: [
		{id: 1, value: 10, nested: {count: 1}},
		{id: 2, value: 20, nested: {count: 2}},
		{id: 3, value: 30, nested: {count: 3}},
		{id: 4, value: 40, nested: {count: 4}},
		{id: 5, value: 50, nested: {count: 5}}
	],
	other: {data: "test"}
})

describe("thisArg forwarding (array-methods plugin)", () => {
	beforeEach(() => {
		enableArrayMethods()
	})

	test("filter() passes thisArg to the predicate", () => {
		const base = createTestData()
		const ctx = {threshold: 25}
		const seen: any[] = []
		const result = produce(base, (draft: any) => {
			const filtered = draft.items.filter(function (this: any, item: any) {
				seen.push(this)
				return item.value > this.threshold
			}, ctx)
			expect(filtered.map((item: any) => item.id)).toEqual([3, 4, 5])
		})
		expect(seen).toHaveLength(5)
		seen.forEach(self => expect(self).toBe(ctx))
		expect(result).toBe(base)
	})

	test("find() passes thisArg to the predicate", () => {
		const base = createTestData()
		const ctx = {targetId: 3}
		const result = produce(base, (draft: any) => {
			const found = draft.items.find(function (this: any, item: any) {
				return item.id === this.targetId
			}, ctx)
			expect(found.value).toBe(30)
		})
		expect(result).toBe(base)
	})

	test("findLast() passes thisArg to the predicate", () => {
		const base = createTestData()
		const ctx = {threshold: 25}
		const result = produce(base, (draft: any) => {
			const found = draft.items.findLast(function (this: any, item: any) {
				return item.value > this.threshold
			}, ctx)
			expect(found.id).toBe(5)
		})
		expect(result).toBe(base)
	})

	test("omitting thisArg leaves the predicate's this undefined", () => {
		const base = createTestData()
		const result = produce(base, (draft: any) => {
			draft.items.filter(function (this: any) {
				expect(this).toBeUndefined()
				return false
			})
			draft.items.find(function (this: any) {
				expect(this).toBeUndefined()
				return false
			})
			draft.items.findLast(function (this: any) {
				expect(this).toBeUndefined()
				return false
			})
		})
		expect(result).toBe(base)
	})
})
