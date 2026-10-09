const inventory = require('./inventory')

const restock = (sku, qty) => inventory.restock(sku, qty)
const writeOff = (sku, qty) => inventory.writeOff(sku, qty)
const report = () => inventory.snapshot()

module.exports = { restock, writeOff, report }
