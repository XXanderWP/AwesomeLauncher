export const app = {
  getPath: (name: string): string => `/tmp/ac-userdata-${name}`,
  getLocale: (): string => 'en-US',
  getVersion: (): string => '1.0.0',
  isPackaged: false
}

export const BrowserWindow = {
  getAllWindows: (): unknown[] => []
}

export default { app, BrowserWindow }
