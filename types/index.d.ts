export type Mode = 'efficient' | 'balanced' | 'cheap'
export type Sticky = 'off' | 'auto' | 'strict'
export type Cache = { model: string; at: number; contextTokens: number }
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type EffortCap = Effort | 'none'
export type Pending = { full?: true; pin?: string; mode?: Mode }
export type Decision = {
  turnId: string
  model: string
  alias: string
  effort: Effort
  confidence: number
  kept?: string
  capped?: Effort
  pinned?: boolean
  unlocked?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'jev-router': {
      mode: Mode | null
      enabled: boolean
      last: Decision | null
      cache: Cache | null
      sticky: Sticky | null
      cap: EffortCap | null
      pending: Pending | null
      frame: number
      stats: Record<string, number>
      warned: boolean
    }
  }
}
