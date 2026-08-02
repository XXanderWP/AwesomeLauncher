/** Match AwesomeCraftLauncher / Helios Java 17 defaults (not Aikar server flags). */
export const DEFAULT_JVM_OPTIONS = [
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+UseG1GC',
  '-XX:G1NewSizePercent=20',
  '-XX:G1ReservePercent=20',
  '-XX:MaxGCPauseMillis=50',
  '-XX:G1HeapRegionSize=32M'
] as const

export function getDefaultJvmOptions(): string[] {
  return [...DEFAULT_JVM_OPTIONS]
}
