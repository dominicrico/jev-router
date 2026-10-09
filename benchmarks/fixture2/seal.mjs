// The hidden tests and reference solutions live in sealed.tgz, not as files in the repo, so an agent that
// searches the disk for *.test.js cannot find the answers. unsealed() unpacks them into a random temp
// directory for as long as the process runs. To edit them: `node seal.mjs unseal <dir>` then `node seal.mjs seal <dir>`.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEALED = join(dirname(fileURLToPath(import.meta.url)), 'sealed.tgz')
let dir

export function unsealed() {
  if (dir) return dir
  dir = mkdtempSync(join(tmpdir(), '.jb-'))
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  const r = spawnSync('tar', ['xzf', SEALED, '-C', dir])
  if (r.status) throw new Error(`cannot unseal ${SEALED}`)
  return dir
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, to] = process.argv.slice(2)
  if (cmd === 'unseal') { mkdirSync(to, { recursive: true }); spawnSync('tar', ['xzf', SEALED, '-C', to], { stdio: 'inherit' }) }
  else if (cmd === 'seal') spawnSync('tar', ['czf', SEALED, '-C', to, 'hidden', 'reference'], { stdio: 'inherit' })
  else console.log('usage: node seal.mjs seal|unseal <dir>')
}
