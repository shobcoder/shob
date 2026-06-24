import { app, Menu, nativeImage, Tray, type BrowserWindow } from "electron";
import { resolveAppIconPath } from "./icon.js";

let tray: Tray | null = null;

/**
 * Creates and initializes the system tray icon with proper cross-platform support.
 * This ensures the app icon appears in:
 * - Windows: System tray
 * - macOS: Menu bar (though macOS also uses dock icon)
 * - Linux: System tray/notification area (GNOME, KDE, etc.)
 */
export function createSystemTray(getMainWindow: () => BrowserWindow | null) {
  // Don't recreate if already exists
  if (tray && !tray.isDestroyed()) {
    return tray;
  }

  const iconPath = resolveAppIconPath();
  if (!iconPath) {
    console.warn("[shob] Cannot create system tray: icon not found");
    return null;
  }

  try {
    // Create native image from icon path
    const icon = nativeImage.createFromPath(iconPath);
    
    // On Linux, we need to resize the icon for proper display in system tray
    if (process.platform === "linux") {
      // Most Linux system trays expect 22x22 or 24x24 icons
      const resized = icon.resize({ width: 22, height: 22 });
      tray = new Tray(resized);
    } else {
      tray = new Tray(icon);
    }

    // Set tooltip
    tray.setToolTip("shob");

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show shob",
        click: () => {
          const mainWindow = getMainWindow();
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        type: "separator",
      },
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    // Handle click events
    // On Windows and Linux, clicking the tray icon should show/hide the window
    if (process.platform !== "darwin") {
      tray.on("click", () => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
          }
        }
      });
    }

    console.log("[shob] System tray created successfully");
    return tray;
  } catch (error) {
    console.error("[shob] Failed to create system tray:", error);
    return null;
  }
}

/**
 * Updates the system tray icon (useful for theme changes or updates)
 */
export function updateSystemTrayIcon() {
  if (!tray || tray.isDestroyed()) {
    return;
  }

  const iconPath = resolveAppIconPath();
  if (!iconPath) {
    return;
  }

  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (process.platform === "linux") {
      const resized = icon.resize({ width: 22, height: 22 });
      tray.setImage(resized);
    } else {
      tray.setImage(icon);
    }
  } catch (error) {
    console.error("[shob] Failed to update system tray icon:", error);
  }
}

/**
 * Destroys the system tray icon
 */
export function destroySystemTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
    console.log("[shob] System tray destroyed");
  }
}

/**
 * Gets the current tray instance (if exists)
 */
export function getSystemTray() {
  return tray;
}
