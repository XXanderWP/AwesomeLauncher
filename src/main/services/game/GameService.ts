import { ChildProcess, spawn } from 'child_process'
import { app, BrowserWindow } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import type { GameLogLine, GameProcessState } from '../../../shared/types'
import { IPC } from '../../../shared/types'
import type { ConfigService } from '../config/ConfigService'
import type { DistroService } from '../distro/DistroService'
import type { InstallService } from '../download/InstallService'
import { ensurePlayableSession } from '../auth/elybyDeviceCode'
import { createRequire } from 'module'
import { resolveAuthlibInjectorPath, setLaunchBridge } from '../launch/launchBridge.js'

const require = createRequire(__filename)
const ProcessBuilder = require('../launch/processbuilder.legacy.js')

export class GameService {
  private child: ChildProcess | null = null
  private state: GameProcessState = {
    running: false,
    pid: null,
    startedAt: null,
    exitCode: null
  }
  private logs: GameLogLine[] = []
  private readonly maxLogs = 5000

  constructor(
    private readonly config: ConfigService,
    private readonly distro: DistroService,
    private readonly install: InstallService
  ) {}

  getState(): GameProcessState {
    return { ...this.state }
  }

  getLogs(): GameLogLine[] {
    return [...this.logs]
  }

  clearLogs(): void {
    this.logs = []
  }

  async launch(serverId: string): Promise<GameProcessState> {
    if (this.state.running) {
      throw new Error('Game is already running')
    }

    const selected = this.config.getSelectedAccount()
    if (!selected) {
      throw new Error('No Ely.by account selected')
    }

    const authlibPath = resolveAuthlibInjectorPath()
    if (!(await fs.pathExists(authlibPath))) {
      throw new Error('authlib-injector.jar is missing from launcher resources')
    }

    this.emitProgressLaunch('Refreshing Ely.by session')
    const account = await ensurePlayableSession(selected, this.config.get().clientToken)
    await this.config.setAccount(account, true)

    this.emitProgressLaunch('Preparing game files')
    const prepared = await this.install.prepareLaunch(serverId)
    const cfg = this.config.get()
    const summary = (await this.distro.get()).servers.find((s) => s.id === serverId)
    if (!summary) {
      throw new Error(`Unknown server: ${serverId}`)
    }

    const javaSettings = this.config.getJavaSettings(serverId, {
      minRamMb: summary.java.ram.minimum,
      maxRamMb: summary.java.ram.recommended
    })

    const dataDir = this.config.getDataDirectory()
    const commonDir = path.join(dataDir, 'common')
    const gameDir = path.join(dataDir, 'instances', serverId)

    setLaunchBridge({
      config: this.config,
      javaSettings,
      gameSettings: cfg.settings.game,
      authUser: account,
      gameDir,
      commonDir,
      serverId,
      hostname: summary.address,
      port: summary.port,
      autoconnect: summary.autoconnect,
      launcherVersion: app.getVersion(),
      authlibInjectorPath: authlibPath
    })

    this.emitProgressLaunch('Starting Minecraft')
    const builder = new ProcessBuilder(
      prepared.server,
      prepared.versionData,
      prepared.modLoaderData,
      account,
      app.getVersion()
    )

    // Override hostname/port accessors used by ProcessBuilder when present on Helios server
    if (prepared.server && typeof prepared.server === 'object') {
      prepared.server.hostname = summary.address
      prepared.server.port = summary.port
    }

    const child: ChildProcess = builder.build()
    this.attachChild(child)
    this.emitProgressIdle()
    return this.getState()
  }

  kill(): GameProcessState {
    if (this.child && this.state.running) {
      try {
        if (process.platform === 'win32' && this.child.pid) {
          spawn('taskkill', ['/PID', String(this.child.pid), '/T', '/F'])
        } else {
          this.child.kill('SIGTERM')
          setTimeout(() => {
            if (this.child && !this.child.killed) {
              this.child.kill('SIGKILL')
            }
          }, 3000)
        }
        this.pushLog('system', 'Stop requested from launcher')
      } catch (err) {
        this.pushLog(
          'system',
          `Failed to stop game: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
    return this.getState()
  }

  private attachChild(child: ChildProcess): void {
    this.child = child
    this.state = {
      running: true,
      pid: child.pid ?? null,
      startedAt: Date.now(),
      exitCode: null
    }
    this.emitState()
    this.pushLog('system', `Minecraft process started (pid ${child.pid ?? '?'})`)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (data: string) => {
      data
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => this.pushLog('stdout', line))
    })
    child.stderr?.on('data', (data: string) => {
      data
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => this.pushLog('stderr', line))
    })
    child.on('error', (err) => {
      this.pushLog('system', `Process error: ${err.message}`)
    })
    child.on('close', (code, signal) => {
      this.state = {
        running: false,
        pid: null,
        startedAt: this.state.startedAt,
        exitCode: code
      }
      this.child = null
      if (signal) {
        this.pushLog('system', `Minecraft exited from signal ${signal} (code ${code})`)
      } else {
        this.pushLog('system', `Minecraft exited with code ${code}`)
      }
      this.emitState()
    })
  }

  private pushLog(stream: GameLogLine['stream'], text: string): void {
    const line: GameLogLine = { stream, text, timestamp: Date.now() }
    this.logs.push(line)
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs)
    }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.EVENT_GAME_LOG, line)
    }
  }

  private emitState(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.EVENT_GAME_STATE, this.getState())
    }
  }

  private emitProgressLaunch(message: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.EVENT_PROGRESS, {
        phase: 'launch',
        percent: 0,
        message
      })
    }
  }

  private emitProgressIdle(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.EVENT_PROGRESS, {
        phase: 'idle',
        percent: 100,
        message: 'Game running'
      })
    }
  }
}
