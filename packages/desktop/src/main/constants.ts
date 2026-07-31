import { app } from "electron"

// electron-updater can apply Linux releases only when launched from an AppImage.
// DEB/RPM installations are deliberately updated by their package manager.
export const UPDATER_ENABLED = app.isPackaged && (process.platform !== "linux" || !!process.env.APPIMAGE)
