// Helpers shared by the *-analyze.mts scripts.
export const table = (head: string[], body: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map(r => `| ${r.join(' | ')} |`)].join('\n')
export const vs = (a: number, b: number) => (b ? `${a <= b ? '-' : '+'}${Math.abs(Math.round((1 - a / b) * 100))}%` : '')
// Sum of a field name, or of whatever a function returns for each row.
export const sum = <T,>(rows: T[], f: string | ((r: T) => number)) =>
  rows.reduce((a, r) => a + (typeof f === 'function' ? f(r) : ((r as any)[f] ?? 0)), 0)
export const k = (n: number) => `${(n / 1000).toFixed(1)}k`
export const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '-')
export const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
