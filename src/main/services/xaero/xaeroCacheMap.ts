import { deflateSync } from 'zlib'

/** OpenGL client formats used in Xaero cache.xaero color buffers. */
const GL_RGBA = 0x8058
const GL_BGRA = 0x80e1

const TILE_SIZE = 64
const REGION_TILES = 8
const REGION_PX = TILE_SIZE * REGION_TILES // 512
const TILE_BYTES = TILE_SIZE * TILE_SIZE * 4 // 16384

export interface XaeroTileRgba {
  x: number
  z: number
  rgba: Buffer
}

/**
 * Scan a cache.xaero buffer for 64×64 color tiles.
 * Texture headers are `coord, compressed, format, length` then raw pixels.
 */
export function extractXaeroCacheTiles(data: Buffer): XaeroTileRgba[] {
  const tiles: XaeroTileRgba[] = []
  let pos = 0
  while (pos + 10 < data.length) {
    const coord = data[pos]
    if (coord <= 0x77 && data[pos + 1] <= 1) {
      const compressed = data[pos + 1]
      const format = data.readInt32BE(pos + 2)
      const length = data.readInt32BE(pos + 6)
      if (
        (format === GL_RGBA || format === GL_BGRA) &&
        length === TILE_BYTES &&
        pos + 10 + length <= data.length &&
        compressed === 0
      ) {
        const raw = data.subarray(pos + 10, pos + 10 + length)
        // MapTileChunk.putColour always writes memory as [light, R, G, B]
        // regardless of the GL format enum stored alongside the buffer.
        tiles.push({ x: coord >> 4, z: coord & 15, rgba: decodeXaeroLrgb(raw) })
        pos += 10 + length
        continue
      }
    }
    pos += 1
  }
  return tiles
}

/**
 * Decode Xaero color-buffer pixels to straight RGBA.
 *
 * putColour packs `(B<<24)|(G<<16)|(R<<8)|light` into a little-endian int, so
 * memory bytes are `[light, R, G, B]`. Reading light as red made the map look
 * like a red wash. When light > 0 the GPU shader multiplies RGB by light/255;
 * when light is 0 but RGB is present, RGB is already display-ready.
 */
export function decodeXaeroLrgb(raw: Buffer): Buffer {
  const out = Buffer.alloc(raw.length)
  for (let i = 0; i < raw.length; i += 4) {
    const light = raw[i]
    const r = raw[i + 1]
    const g = raw[i + 2]
    const b = raw[i + 3]
    if ((r | g | b) === 0) {
      // empty / light-only (no terrain colour)
      continue
    }
    const factor = light > 0 ? light / 255 : 1
    out[i] = Math.min(255, Math.round(r * factor))
    out[i + 1] = Math.min(255, Math.round(g * factor))
    out[i + 2] = Math.min(255, Math.round(b * factor))
    out[i + 3] = 255
  }
  return out
}

/** Count pixels with alpha > 0 (real terrain / lit map data). */
export function countOpaquePixels(rgba: Buffer): number {
  let n = 0
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] > 0) n++
  }
  return n
}

export function composeRegionRgba(tiles: XaeroTileRgba[]): Buffer | null {
  if (tiles.length === 0) return null
  const out = Buffer.alloc(REGION_PX * REGION_PX * 4, 0)
  for (const tile of tiles) {
    if (tile.x < 0 || tile.x >= REGION_TILES || tile.z < 0 || tile.z >= REGION_TILES) continue
    for (let row = 0; row < TILE_SIZE; row++) {
      const srcOff = row * TILE_SIZE * 4
      const dstOff = ((tile.z * TILE_SIZE + row) * REGION_PX + tile.x * TILE_SIZE) * 4
      tile.rgba.copy(out, dstOff, srcOff, srcOff + TILE_SIZE * 4)
    }
  }
  return out
}

export interface RegionPlacement {
  regionX: number
  regionZ: number
  rgba: Buffer
}

export function composeWorldRgba(regions: RegionPlacement[]): {
  width: number
  height: number
  rgba: Buffer
  originX: number
  originZ: number
} | null {
  if (regions.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const r of regions) {
    minX = Math.min(minX, r.regionX)
    maxX = Math.max(maxX, r.regionX)
    minZ = Math.min(minZ, r.regionZ)
    maxZ = Math.max(maxZ, r.regionZ)
  }
  const width = (maxX - minX + 1) * REGION_PX
  const height = (maxZ - minZ + 1) * REGION_PX
  const rgba = Buffer.alloc(width * height * 4, 0)
  for (const r of regions) {
    const ox = (r.regionX - minX) * REGION_PX
    const oz = (r.regionZ - minZ) * REGION_PX
    for (let row = 0; row < REGION_PX; row++) {
      const srcOff = row * REGION_PX * 4
      const dstOff = ((oz + row) * width + ox) * 4
      r.rgba.copy(rgba, dstOff, srcOff, srcOff + REGION_PX * 4)
    }
  }
  return { width, height, rgba, originX: minX, originZ: minZ }
}

/** Downscale RGBA nearest-neighbor so the longest side is at most maxSide. */
export function scaleRgbaNearest(
  rgba: Buffer,
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number; rgba: Buffer } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  if (scale >= 1) return { width, height, rgba }
  const tw = Math.max(1, Math.round(width * scale))
  const th = Math.max(1, Math.round(height * scale))
  const out = Buffer.alloc(tw * th * 4, 0)
  for (let y = 0; y < th; y++) {
    const sy = Math.min(height - 1, Math.floor((y + 0.5) / scale))
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(width - 1, Math.floor((x + 0.5) / scale))
      const si = (sy * width + sx) * 4
      const di = (y * tw + x) * 4
      out[di] = rgba[si]
      out[di + 1] = rgba[si + 1]
      out[di + 2] = rgba[si + 2]
      out[di + 3] = rgba[si + 3]
    }
  }
  return { width: tw, height: th, rgba: out }
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}

const CRC_TABLE = crcTable()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcBuf), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

/** Encode raw RGBA into a PNG buffer (no external deps). */
export function encodePngRgba(rgba: Buffer, width: number, height: number): Buffer {
  if (rgba.length < width * height * 4) {
    throw new Error('RGBA buffer too small for PNG dimensions')
  }
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const dst = y * (stride + 1)
    raw[dst] = 0
    rgba.copy(raw, dst + 1, y * stride, y * stride + stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

export const XAERO_REGION_PX = REGION_PX
