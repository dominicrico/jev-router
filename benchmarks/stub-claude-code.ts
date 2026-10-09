// Lets the benchmark and image scripts import the mod's pure functions without the Claude Code host.
// Runtime: the three state helpers below. Types: deliberately loose, only so the scripts type-check in CI;
// the real types come with Claude Code (`.claude-plugin/types`, generated, not committed).
export const atom = (ref: unknown, initial: unknown): any => ({ ref, initial })
export const read = async (..._: any[]): Promise<any> => null
export const update = async (..._: any[]): Promise<any> => undefined

export type EngineInterface = any
export type Register = (on: any, options: Record<string, unknown>) => void

declare global {
  namespace JSX {
    type Element = any
    interface IntrinsicElements { [name: string]: any }
  }
}
