/**
 * Opt-in server logging for the chatty paths — full request payloads and
 * per-asset cache hits. They were unconditional, which put every user's prompt
 * into production logs and buried the lines that actually matter.
 *
 * Enable with HELIOS_DEBUG=true.
 */
export const debugLog: (...args: unknown[]) => void =
  process.env.HELIOS_DEBUG === "true" ? console.log : () => {};
