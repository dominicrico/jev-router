const test = require('node:test')
const assert = require('node:assert')
const { mergeIntervals } = require('../src/intervals')

const iv = (start, end, startOpen = false, endOpen = false) => ({ start, end, startOpen, endOpen })

test('merges overlapping closed intervals', () => {
  assert.deepStrictEqual(mergeIntervals([iv(1, 4), iv(3, 6)]), [iv(1, 6)])
})

test('keeps disjoint intervals sorted', () => {
  assert.deepStrictEqual(mergeIntervals([iv(8, 9), iv(1, 2)]), [iv(1, 2), iv(8, 9)])
})

test('empty input', () => {
  assert.deepStrictEqual(mergeIntervals([]), [])
})
