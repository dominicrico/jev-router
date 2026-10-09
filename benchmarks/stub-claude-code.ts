// Lets benchmarks import the mod's pure functions without the Claude Code host.
export const atom = (ref: unknown, initial: unknown) => ({ ref, initial })
export const read = async () => null
export const update = async () => undefined
