/**
 * An interval is { start, end, startOpen?, endOpen? }. A bound is closed (the point belongs to the
 * interval) unless its `...Open` flag is true. `start` and `end` are numbers, +-Infinity allowed; an
 * infinite bound is always open.
 *
 * mergeIntervals(list) returns the union of the intervals as the smallest list of disjoint intervals:
 *  - two intervals are merged when their union is one interval with no gap: they overlap, or they meet
 *    at a single point that belongs to at least one of them. [1,3) and [3,5] merge; (1,3) and (3,5) do not,
 *    because 3 is in neither.
 *  - empty intervals (start === end with an open side) are dropped. A closed point [3,3] is kept.
 *  - an interval with start > end, or a NaN bound, throws a RangeError.
 *  - the result is sorted by start and every item has explicit boolean startOpen and endOpen
 *    (always true for an infinite bound).
 *  - the input array and its objects are not modified; the result holds new objects.
 */
function mergeIntervals(list) {
  throw new Error('not implemented')
}

module.exports = { mergeIntervals }
