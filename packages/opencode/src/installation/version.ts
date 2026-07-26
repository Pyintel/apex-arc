declare global {
  const ARC_VERSION: string
  const ARC_CHANNEL: string
}

export const InstallationVersion = typeof ARC_VERSION === "string" ? ARC_VERSION : "local"
export const InstallationChannel = typeof ARC_CHANNEL === "string" ? ARC_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
