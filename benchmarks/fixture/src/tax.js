function taxFor(cents, rate = 0.2) {
  return Math.round(cents * rate)
}
module.exports = { taxFor }
