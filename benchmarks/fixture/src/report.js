const { calcTotal } = require('./cart')

function summary(items) {
  const t = calcTotal(items)
  return `Subtotal $${(t.subtotal / 100).toFixed(2)}, shipping $${(t.shipping / 100).toFixed(2)}, tax $${(t.tax / 100).toFixed(2)}, total $${(t.total / 100).toFixed(2)}`
}

module.exports = { summary }
