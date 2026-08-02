const path = require('path')
const { app } = require('electron')

const GLOBAL_KEY = '__awesomecraft_launch_bridge__'

function setLaunchBridge(state) {
  globalThis[GLOBAL_KEY] = state
}

function getLaunchBridge() {
  const bridge = globalThis[GLOBAL_KEY]
  if (!bridge) {
    throw new Error('Launch bridge is not initialized')
  }
  return bridge
}

const LegacyConfigBridge = {
  getMaxRAM() {
    return `${getLaunchBridge().javaSettings.maxRamMb}M`
  },
  getMinRAM() {
    return `${getLaunchBridge().javaSettings.minRamMb}M`
  },
  getJVMOptions() {
    return [...getLaunchBridge().javaSettings.jvmOptions]
  },
  getJavaExecutable() {
    const p = getLaunchBridge().javaSettings.javaPath
    if (!p) throw new Error('Java executable is not configured')
    return p
  },
  getLaunchDetached() {
    return getLaunchBridge().gameSettings.launchDetached
  },
  getAutoConnect() {
    return getLaunchBridge().gameSettings.autoConnect && getLaunchBridge().autoconnect
  },
  getFullscreen() {
    return getLaunchBridge().gameSettings.fullscreen
  },
  getGameWidth() {
    return getLaunchBridge().gameSettings.resWidth
  },
  getGameHeight() {
    return getLaunchBridge().gameSettings.resHeight
  },
  getClientToken() {
    return getLaunchBridge().config.get().clientToken
  },
  getModConfiguration() {
    return { mods: {} }
  },
  getTempNativeFolder() {
    return 'temp_natives'
  },
  getInstanceDirectory() {
    return path.dirname(getLaunchBridge().gameDir)
  },
  getCommonDirectory() {
    return getLaunchBridge().commonDir
  }
}

function getAuthlibInjectorJarPath() {
  return getLaunchBridge().authlibInjectorPath
}

function resolveAuthlibInjectorPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'libraries', 'authlib-injector', 'authlib-injector.jar')
  }
  return path.join(
    app.getAppPath(),
    'resources',
    'libraries',
    'authlib-injector',
    'authlib-injector.jar'
  )
}

module.exports = {
  setLaunchBridge,
  getLaunchBridge,
  LegacyConfigBridge,
  getAuthlibInjectorJarPath,
  resolveAuthlibInjectorPath
}
