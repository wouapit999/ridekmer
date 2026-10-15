/** Demo users are only ever created outside production AND when explicitly allowed. */
export function demoSeedAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const prod = env.NODE_ENV === "production" || env.APP_ENV === "production";
  return !prod && env.ALLOW_DEMO_SEED === "true";
}
