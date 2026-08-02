declare module 'adm-zip' {
  class AdmZip {
    constructor(filePath?: string | Buffer)
    getEntries(): Array<{ entryName: string; isDirectory: boolean }>
    getEntry(name: string): { entryName: string; isDirectory: boolean; getData(): Buffer } | null
  }
  export = AdmZip
}
