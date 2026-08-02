/// <reference types="vite/client" />

declare module '*.png' {
  const src: string
  export default src
}

import type { AwesomeAPI } from '../preload/index'

declare global {
  interface Window {
    awesomeAPI: AwesomeAPI
  }
}

export {}
