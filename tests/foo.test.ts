import { foo } from "#/lib"
import { test } from "vitest"

test("foo is bar", ({ expect }) => {
  const expected = "bar"
  const actual = foo()
  expect(actual).toBe(expected)
})
