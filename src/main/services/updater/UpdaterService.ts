import { BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateMode, UpdateStatus } from '../../../shared/types'
import { IPC } from '../../../shared/types'
import type { ConfigService } from '../config/ConfigService'

export class UpdaterService {
  private status: UpdateStatus = {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    progress: 0,
    info: null,
    error: null
  }

  private installOnQuit = false

  constructor(private readonly config: ConfigService) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    autoUpdater.on('checking-for-update', () => {
      this.patch({ checking: true, error: null })
    })
    autoUpdater.on('update-available', (info) => {
      this.patch({
        checking: false,
        available: true,
        info: {
          version: info.version,
          releaseDate: info.releaseDate || undefined,
          releaseName: info.releaseName || undefined
        }
      })
      const mode = this.config.getUpdateMode()
      if (mode === 'auto-install-on-quit' || mode === 'auto-download-manual-install') {
        void this.download()
      }
    })
    autoUpdater.on('update-not-available', () => {
      this.patch({ checking: false, available: false, info: null })
    })
    autoUpdater.on('download-progress', (progress) => {
      this.patch({
        downloading: true,
        progress: Math.round(progress.percent)
      })
    })
    autoUpdater.on('update-downloaded', () => {
      this.patch({
        downloading: false,
        downloaded: true,
        progress: 100
      })
      if (this.config.getUpdateMode() === 'auto-install-on-quit') {
        this.installOnQuit = true
        autoUpdater.autoInstallOnAppQuit = true
      }
    })
    autoUpdater.on('error', (err) => {
      this.patch({
        checking: false,
        downloading: false,
        error: err.message
      })
    })
  }

  init(): void {
    autoUpdater.allowPrerelease = this.config.get().settings.launcher.allowPrerelease
    if (!app.isPackaged) {
      return
    }
    // Initial check shortly after start
    setTimeout(() => {
      void this.check()
    }, 5000)
    setInterval(
      () => {
        void this.check()
      },
      30 * 60 * 1000
    )
  }

  getStatus(): UpdateStatus {
    return { ...this.status }
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      this.patch({ checking: false, error: null })
      return this.getStatus()
    }
    autoUpdater.allowPrerelease = this.config.get().settings.launcher.allowPrerelease
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      this.patch({
        checking: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
    return this.getStatus()
  }

  async download(): Promise<UpdateStatus> {
    if (!app.isPackaged || !this.status.available) {
      return this.getStatus()
    }
    try {
      this.patch({ downloading: true, progress: 0, error: null })
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.patch({
        downloading: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
    return this.getStatus()
  }

  install(): void {
    if (!this.status.downloaded) {
      throw new Error('Update is not downloaded yet')
    }
    autoUpdater.quitAndInstall(false, true)
  }

  applyUpdateMode(mode: UpdateMode): void {
    if (mode === 'auto-install-on-quit' && this.status.downloaded) {
      this.installOnQuit = true
      autoUpdater.autoInstallOnAppQuit = true
    } else if (mode === 'auto-download-manual-install') {
      this.installOnQuit = false
      autoUpdater.autoInstallOnAppQuit = false
    }
  }

  shouldInstallOnQuit(): boolean {
    return this.installOnQuit && this.status.downloaded
  }

  private patch(partial: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...partial }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.EVENT_UPDATE_STATUS, this.getStatus())
    }
  }
}
