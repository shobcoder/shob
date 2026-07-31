import { app } from "electron"
import fs from "node:fs"
import path from "node:path"

export const UPDATER_ENABLED =
  app.isPackaged &&
  (process.platform !== "linux" || !!process.env.APPIMAGE) &&
  fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))
