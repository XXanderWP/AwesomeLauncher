import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const LAUNCH_HELPER_FILES = [
  'processbuilder.legacy.js',
  'launchBridge.js',
  'nativeExtract.js',
  'launchEnv.js'
] as const

/** Keep out/launch in sync — do not require .cjs here (electron-vite bundles this config as ESM). */
function copyLaunchAssetsFromConfig(): void {
  const srcDir = resolve('src/main/services/launch')
  const destDir = resolve('out/launch')
  mkdirSync(destDir, { recursive: true })
  for (const file of LAUNCH_HELPER_FILES) {
    copyFileSync(resolve(srcDir, file), resolve(destDir, file))
  }
}

function copyLaunchAssetsPlugin(): Plugin {
  return {
    name: 'copy-launch-assets',
    buildStart() {
      copyLaunchAssetsFromConfig()
    },
    writeBundle() {
      copyLaunchAssetsFromConfig()
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyLaunchAssetsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts')
        }
      },
      commonjsOptions: {
        include: [/node_modules/, /launchBridge/, /processbuilder/, /launchEnv/, /nativeExtract/],
        transformMixedEsModules: true
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
