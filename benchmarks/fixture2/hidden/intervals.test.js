const test = require('node:test')
const assert = require('node:assert')
const { mergeIntervals } = require('../src/intervals')

const iv = (start, end, startOpen = false, endOpen = false) => ({ start, end, startOpen, endOpen })
const I = Infinity

test('touching at a point included by one side merges', () => {
  assert.deepStrictEqual(mergeIntervals([iv(1, 3, false, true), iv(3, 5)]), [iv(1, 5)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 3), iv(3, 5, true, false)]), [iv(1, 5, false, false)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 3, false, true), iv(3, 5, true, true)]), [iv(1, 3, false, true), iv(3, 5, true, true)])
})

test('two open ends at the same point leave a gap', () => {
  const out = mergeIntervals([iv(3, 5, true, true), iv(1, 3, true, true)])
  assert.deepStrictEqual(out, [iv(1, 3, true, true), iv(3, 5, true, true)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 3, false, true), iv(3, 5, true, false)]), [iv(1, 3, false, true), iv(3, 5, true, false)])
})

test('the merged end takes the openness of the larger end; equal ends are open only if both are', () => {
  assert.deepStrictEqual(mergeIntervals([iv(1, 10, false, true), iv(2, 10, false, false)]), [iv(1, 10, false, false)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 10, false, true), iv(2, 10, false, true)]), [iv(1, 10, false, true)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 10, false, false), iv(2, 4, false, true)]), [iv(1, 10)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 5, false, true), iv(2, 7, false, true)]), [iv(1, 7, false, true)])
})

test('the merged start takes the openness of the smaller start; equal starts are open only if both are', () => {
  assert.deepStrictEqual(mergeIntervals([iv(1, 5, true, false), iv(1, 4, false, false)]), [iv(1, 5, false, false)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 5, true, false), iv(1, 4, true, false)]), [iv(1, 5, true, false)])
  assert.deepStrictEqual(mergeIntervals([iv(2, 5, true, false), iv(1, 2, true, false)]), [iv(1, 5, true, false)])
})

test('a closed point is kept and bridges neighbours', () => {
  assert.deepStrictEqual(mergeIntervals([iv(3, 3)]), [iv(3, 3)])
  assert.deepStrictEqual(mergeIntervals([iv(1, 3, false, true), iv(3, 3), iv(3, 6, true, false)]), [iv(1, 6)])
  assert.deepStrictEqual(mergeIntervals([iv(3, 3), iv(5, 6)]), [iv(3, 3), iv(5, 6)])
})

test('empty intervals are dropped', () => {
  assert.deepStrictEqual(mergeIntervals([iv(3, 3, true, false), iv(4, 4, false, true), iv(2, 2, true, true)]), [])
  assert.deepStrictEqual(mergeIntervals([iv(1, 2), iv(5, 5, true, true), iv(2, 4, true, false)]), [iv(1, 4)])
})

test('invalid intervals throw RangeError', () => {
  assert.throws(() => mergeIntervals([iv(5, 1)]), RangeError)
  assert.throws(() => mergeIntervals([iv(NaN, 1)]), RangeError)
  assert.throws(() => mergeIntervals([iv(1, NaN)]), RangeError)
})

test('infinite bounds are open and merge normally', () => {
  assert.deepStrictEqual(mergeIntervals([{ start: -I, end: 0 }, iv(-5, 5)]), [iv(-I, 5, true, false)])
  assert.deepStrictEqual(mergeIntervals([iv(0, I), iv(-3, 1)]), [iv(-3, I, false, true)])
  assert.deepStrictEqual(mergeIntervals([{ start: -I, end: I }, iv(1, 2)]), [iv(-I, I, true, true)])
})

test('omitted flags mean closed, output always has explicit booleans', () => {
  const out = mergeIntervals([{ start: 1, end: 2 }])
  assert.deepStrictEqual(out, [{ start: 1, end: 2, startOpen: false, endOpen: false }])
  assert.deepStrictEqual(Object.keys(out[0]).sort(), ['end', 'endOpen', 'start', 'startOpen'])
})

test('does not mutate the input and returns new objects', () => {
  const a = iv(5, 6), b = iv(1, 2)
  const input = [a, b]
  const snapshot = JSON.stringify(input)
  const out = mergeIntervals(input)
  assert.strictEqual(JSON.stringify(input), snapshot)
  assert.strictEqual(input[0], a)
  assert.ok(!out.includes(a) && !out.includes(b))
})

// Oracle: membership on a half-integer grid for random inputs with integer bounds.
function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 }
const member = (list, x) => list.some(v => (v.startOpen ? x > v.start : x >= v.start) && (v.endOpen ? x < v.end : x <= v.end))

test('random inputs: same union as the input, sorted, and no two outputs could still merge', () => {
  const rand = rng(12345)
  for (let round = 0; round < 400; round++) {
    const list = []
    for (let n = Math.floor(rand() * 7); n > 0; n--) {
      const a = Math.floor(rand() * 9), b = a + Math.floor(rand() * 4)
      list.push(iv(a, b, rand() < 0.5, rand() < 0.5))
    }
    const out = mergeIntervals(list)
    for (let x = -1; x <= 13; x += 0.5) assert.strictEqual(member(out, x), member(list, x), `round ${round} x=${x} in=${JSON.stringify(list)} out=${JSON.stringify(out)}`)
    for (const v of out) assert.ok(v.start < v.end || (v.start === v.end && !v.startOpen && !v.endOpen), `degenerate ${JSON.stringify(v)}`)
    for (let i = 1; i < out.length; i++) {
      const p = out[i - 1], c = out[i]
      assert.ok(p.end < c.start || (p.end === c.start && p.endOpen && c.startOpen), `not disjoint/maximal ${JSON.stringify(out)} from ${JSON.stringify(list)}`)
    }
  }
})
