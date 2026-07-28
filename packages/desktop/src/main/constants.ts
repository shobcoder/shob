import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.SHOB_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// electron-updater can apply Linux releases only when launched from an AppImage.
// DEB/RPM installations are deliberately updated by their package manager.
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev" && (process.platform !== "linux" || !!process.env.APPIMAGE)
