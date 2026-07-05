import { expect, test } from "bun:test"
import { treeshake } from "../../src/util/treeshake"

test("treeshakes function declarations", () => {
  const code = `
export function add(a: number, b: number) {
  const result = a + b;
  return result;
}
  `
  const expected = `
export function add(a: number, b: number) { /* [body elided for context efficiency] */ }
  `
  expect(treeshake("test.ts", code)).toBe(expected)
})

test("treeshakes class methods", () => {
  const code = `
export class Calculator {
  add(a: number, b: number) {
    return a + b;
  }
}
  `
  const expected = `
export class Calculator {
  add(a: number, b: number) { /* [body elided for context efficiency] */ }
}
  `
  expect(treeshake("test.ts", code)).toBe(expected)
})

test("treeshakes arrow functions", () => {
  const code = `
const multiply = (a: number, b: number) => {
  return a * b;
}
  `
  const expected = `
const multiply = (a: number, b: number) => { /* [body elided for context efficiency] */ }
  `
  expect(treeshake("test.ts", code)).toBe(expected)
})

test("treeshakes implicit return arrow functions", () => {
  const code = `
const multiply = (a: number, b: number) => a * b;
  `
  const expected = `
const multiply = (a: number, b: number) => /* [body elided for context efficiency] */;
  `
  expect(treeshake("test.ts", code)).toBe(expected)
})

test("ignores unsupported extensions", () => {
  const code = `
def add(a, b):
    return a + b
  `
  expect(treeshake("test.py", code)).toBe(code)
})

test("handles nested functions correctly by removing only top level body", () => {
    const code = `
function outer() {
    function inner() {
        return 1;
    }
    return inner();
}
    `
    const expected = `
function outer() { /* [body elided for context efficiency] */ }
    `
    expect(treeshake("test.ts", code)).toBe(expected)
})
