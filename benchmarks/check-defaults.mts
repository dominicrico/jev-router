// The shipped option defaults in plugin.json must be the lean preset, so the code and the manifest cannot drift.
import { readFileSync } from 'node:fs'
import { PRESETS } from '../hooks/register.tsx'

const d = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).userConfig
const bad = [
  d.ceiling.default !== PRESETS.lean.ceiling && `ceiling default ${d.ceiling.default} != lean ${PRESETS.lean.ceiling}`,
  d.effortCap.default !== PRESETS.lean.cap && `effortCap default ${d.effortCap.default} != lean ${PRESETS.lean.cap}`,
  d.mode.default !== PRESETS.lean.mode && `mode default ${d.mode.default} != lean ${PRESETS.lean.mode}`,
  d.preset.default !== 'none' && `preset default must be none, got ${d.preset.default}`,
].filter(Boolean)
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('shipped defaults match the lean preset')
