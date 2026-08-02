import { BrowserWindow, app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateMode, UpdateStatus } from '../../../shared/types'
import { IPC } from '../../../shared/types'
import type { ConfigService } from '../config/ConfigService'
import {
  fetchMacUpdateCandidate,
  resolveMacAppBundlePath,
  runMacPrivilegedUpdate,
  type MacUpdateCandidate
} from './macManualUpdate'

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
  private macCandidate: MacUpdateCandidate | null = null
  private readonly isMacManual = process.platform === 'darwin'

  constructor(private readonly config: ConfigService) {
    if (this.isMacManual) {
      return
    }

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
    if (!app.isPackaged) {
      return
    }
    if (!this.isMacManual) {
      autoUpdater.allowPrerelease = this.config.get().settings.launcher.allowPrerelease
    }
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

  usesMacManualInstall(): boolean {
    return this.isMacManual
  }

  async check(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      this.patch({ checking: false, error: null })
      return this.getStatus()
    }

    if (this.isMacManual) {
      return this.checkMac()
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
    if (this.isMacManual) {
      // macOS installs from GitHub DMG inside the privileged installer; no separate download.
      this.patch({
        error: 'On macOS, use Install — it downloads and replaces the app with admin rights.'
      })
      return this.getStatus()
    }

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

  async install(): Promise<UpdateStatus> {
    if (this.isMacManual) {
      return this.installMac()
    }

    if (!this.status.downloaded) {
      throw new Error('Update is not downloaded yet')
    }
    autoUpdater.quitAndInstall(false, true)
    return this.getStatus()
  }

  applyUpdateMode(mode: UpdateMode): void {
    if (this.isMacManual) {
      this.installOnQuit = false
      return
    }
    if (mode === 'auto-install-on-quit' && this.status.downloaded) {
      this.installOnQuit = true
      autoUpdater.autoInstallOnAppQuit = true
    } else if (mode === 'auto-download-manual-install') {
      this.installOnQuit = false
      autoUpdater.autoInstallOnAppQuit = false
    }
  }

  shouldInstallOnQuit(): boolean {
    if (this.isMacManual) return false
    return this.installOnQuit && this.status.downloaded
  }

  private async checkMac(): Promise<UpdateStatus> {
    this.patch({ checking: true, error: null })
    try {
      const candidate = await fetchMacUpdateCandidate({
        currentVersion: app.getVersion(),
        allowPrerelease: this.config.get().settings.launcher.allowPrerelease
      })
      this.macCandidate = candidate
      if (!candidate) {
        this.patch({
          checking: false,
          available: false,
          downloaded: false,
          downloading: false,
          progress: 0,
          info: null
        })
        return this.getStatus()
      }
      this.patch({
        checking: false,
        available: true,
        downloaded: false,
        downloading: false,
        progress: 0,
        info: {
          version: candidate.version,
          releaseDate: candidate.releaseDate,
          releaseName: candidate.releaseName
        }
      })
    } catch (err) {
      this.macCandidate = null
      this.patch({
        checking: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
    return this.getStatus()
  }

  private async installMac(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      this.patch({ error: 'macOS privileged install is only available in packaged builds' })
      return this.getStatus()
    }
    if (!this.macCandidate && this.status.available) {
      await this.checkMac()
    }
    if (!this.macCandidate) {
      this.patch({ error: 'No macOS update is available to install' })
      return this.getStatus()
    }

    const candidate = this.macCandidate
    this.patch({
      downloading: true,
      downloaded: false,
      progress: 0,
      error: null
    })

    try {
      await runMacPrivilegedUpdate({
        dmgUrl: candidate.dmgUrl,
        appPath: resolveMacAppBundlePath()
      })
      this.patch({
        downloading: false,
        downloaded: true,
        progress: 100
      })
      // Privileged script relaunches the app; quit this process.
      setTimeout(() => {
        app.exit(0)
      }, 400)
    } catch (err) {
      this.patch({
        downloading: false,
        downloaded: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
    return this.getStatus()
  }

  private patch(partial: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...partial }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.EVENT_UPDATE_STATUS, this.getStatus())
    }
  }
}
