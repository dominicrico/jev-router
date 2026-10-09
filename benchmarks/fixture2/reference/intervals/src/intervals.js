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
  const items = []
  for (const v of list) {
    if (Number.isNaN(v.start) || Number.isNaN(v.end) || v.start > v.end) throw new RangeError(`invalid interval ${JSON.stringify(v)}`)
    const startOpen = !Number.isFinite(v.start) || !!v.startOpen
    const endOpen = !Number.isFinite(v.end) || !!v.endOpen
    if (v.start === v.end && (startOpen || endOpen)) continue
    items.push({ start: v.start, end: v.end, startOpen, endOpen })
  }
  // At the same start, a closed start comes first.
  items.sort((a, b) => a.start - b.start || Number(a.startOpen) - Number(b.startOpen))
  const out = []
  for (const next of items) {
    const cur = out[out.length - 1]
    if (cur && (next.start < cur.end || (next.start === cur.end && !(next.startOpen && cur.endOpen)))) {
      if (next.end > cur.end) { cur.end = next.end; cur.endOpen = next.endOpen }
      else if (next.end === cur.end) cur.endOpen = cur.endOpen && next.endOpen
    } else out.push(next)
  }
  return out
}

module.exports = { mergeIntervals }
