declare global {
  const SHOB_VERSION: string
  const SHOB_CHANNEL: string
}

export const InstallationVersion = typeof SHOB_VERSION === "string" ? SHOB_VERSION : "local"
export const InstallationChannel = typeof SHOB_CHANNEL === "string" ? SHOB_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
