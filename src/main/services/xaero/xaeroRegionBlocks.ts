/**
 * Parse Xaero `region.xaero` (inside `{rx}_{rz}.zip`) enough to resolve the
 * top block id at a world X/Z. Layout follows Xaero / XaerosMapFormat:
 * version header, then present 64×64 tile-chunks of 4×4 chunks of 16×16 pixels.
 */

export interface XaeroBlockHit {
  blockId: string
  /** Short label for UI, e.g. oak_log */
  displayName: string
  biomeId: string | null
  height: number
}

class Cursor {
  constructor(
    readonly buf: Buffer,
    public offset = 0
  ) {}

  get remaining(): number {
    return this.buf.length - this.offset
  }

  peekU8(): number {
    if (this.offset >= this.buf.length) return -1
    return this.buf[this.offset]
  }

  readU8(): number {
    if (this.offset >= this.buf.length) throw new Error('EOF u8')
    return this.buf[this.offset++]
  }

  readI8(): number {
    const v = this.readU8()
    return v > 127 ? v - 256 : v
  }

  readU16(): number {
    if (this.offset + 2 > this.buf.length) throw new Error('EOF u16')
    const v = this.buf.readUInt16BE(this.offset)
    this.offset += 2
    return v
  }

  readI32(): number {
    if (this.offset + 4 > this.buf.length) throw new Error('EOF i32')
    const v = this.buf.readInt32BE(this.offset)
    this.offset += 4
    return v
  }

  /** Pixel/overlay params: Java writeInt (BE), flags tested from LSB (bit 0 = not-grass). */
  readParamBits(): ParamBits {
    if (this.offset + 4 > this.buf.length) throw new Error('EOF params')
    const v = this.buf.readUInt32BE(this.offset) >>> 0
    this.offset += 4
    return new ParamBits(v)
  }

  peekI32(): number {
    if (this.offset + 4 > this.buf.length) return 0
    return this.buf.readInt32BE(this.offset)
  }

  readMUTF(): string {
    const len = this.readU16()
    if (len === 0) return ''
    if (this.offset + len > this.buf.length) throw new Error('EOF mutf')
    const slice = this.buf.subarray(this.offset, this.offset + len)
    this.offset += len
    // MUTF-8 is close enough to UTF-8 for block/biome ids
    return slice.toString('utf8')
  }

  skip(n: number): void {
    this.offset = Math.min(this.buf.length, this.offset + n)
  }
}

class ParamBits {
  private pos = 0
  constructor(private readonly data: number) {}

  getNextBits(n: number): number {
    const mask = n >= 32 ? 0xffffffff : (1 << n) - 1
    const v = (this.data >>> this.pos) & mask
    this.pos += n
    return v
  }

  peekNextBits(n: number): number {
    const mask = n >= 32 ? 0xffffffff : (1 << n) - 1
    return (this.data >>> this.pos) & mask
  }

  skipBits(n: number): void {
    this.pos += n
  }

  skipToNextByte(): void {
    this.pos = (Math.floor(this.pos / 8) + 1) * 8
  }
}

/** Minimal NBT compound reader: only needs `Name` string (and skips the rest). */
function readNbtBlockName(c: Cursor): string {
  const type = c.readU8()
  if (type !== 0x0a) {
    throw new Error(`Expected NBT compound, got ${type}`)
  }
  // root name (usually empty)
  const rootNameLen = c.readU16()
  c.skip(rootNameLen)

  let blockName = 'minecraft:air'
  while (c.remaining > 0) {
    const tag = c.readU8()
    if (tag === 0) break // TAG_End
    const nameLen = c.readU16()
    const name = c.buf.subarray(c.offset, c.offset + nameLen).toString('utf8')
    c.skip(nameLen)
    if (tag === 8) {
      // TAG_String
      const valLen = c.readU16()
      const value = c.buf.subarray(c.offset, c.offset + valLen).toString('utf8')
      c.skip(valLen)
      if (name === 'Name') blockName = value
    } else if (tag === 10) {
      // nested compound (Properties) — skip until end
      skipNbtCompoundPayload(c)
    } else {
      skipNbtPayload(c, tag)
    }
  }
  return blockName
}

function skipNbtCompoundPayload(c: Cursor): void {
  while (c.remaining > 0) {
    const tag = c.readU8()
    if (tag === 0) return
    const nameLen = c.readU16()
    c.skip(nameLen)
    skipNbtPayload(c, tag)
  }
}

function skipNbtPayload(c: Cursor, tag: number): void {
  switch (tag) {
    case 1:
      c.skip(1)
      break
    case 2:
      c.skip(2)
      break
    case 3:
    case 5:
      c.skip(4)
      break
    case 4:
    case 6:
      c.skip(8)
      break
    case 7: {
      const len = c.readI32()
      c.skip(Math.max(0, len))
      break
    }
    case 8: {
      const len = c.readU16()
      c.skip(len)
      break
    }
    case 9: {
      const listType = c.readU8()
      const len = c.readI32()
      for (let i = 0; i < len; i++) skipNbtPayload(c, listType)
      break
    }
    case 10:
      skipNbtCompoundPayload(c)
      break
    case 11: {
      const len = c.readI32()
      c.skip(Math.max(0, len) * 4)
      break
    }
    case 12: {
      const len = c.readI32()
      c.skip(Math.max(0, len) * 8)
      break
    }
    default:
      throw new Error(`Unsupported NBT tag ${tag}`)
  }
}

function displayNameFromId(id: string): string {
  const bare = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
  return bare.replace(/_/g, ' ')
}

interface ParsedPixel {
  blockId: string
  biomeId: string | null
  height: number
}

/**
 * Parse an entire region.xaero buffer into a sparse map keyed by
 * `localX + localZ * 512` (0..511 within the region).
 */
export function parseRegionBlockIndex(data: Buffer): {
  major: number
  minor: number
  blocks: Map<number, ParsedPixel>
} {
  const c = new Cursor(data)
  const blocks = new Map<number, ParsedPixel>()

  let major = 0
  let minor = 0
  let is115not114 = false

  if (c.peekU8() === 255) {
    c.readU8()
    major = c.readU16()
    minor = c.readU16()
    if (major === 2 && minor >= 5) {
      is115not114 = c.readU8() === 1
    }
  }

  const usesColorTypes = minor < 5 || (major <= 2 && !is115not114)
  const statePalette: string[] = []
  const biomePalette: string[] = []

  // At most 64 tile-chunks; each present tile starts with a coord byte.
  for (let n = 0; n < 64 && c.remaining > 0; n++) {
    if (c.remaining <= 0) break
    // Heuristic EOF: if next would be garbage near end
    const coord = c.readU8()
    const tileZ = coord & 15
    const tileX = (coord >> 4) & 15
    if (tileX > 7 || tileZ > 7) {
      // Likely consumed past data — stop
      break
    }

    for (let cx = 0; cx < 4; cx++) {
      for (let cz = 0; cz < 4; cz++) {
        if (c.peekI32() === -1) {
          c.readI32()
          continue
        }
        for (let px = 0; px < 16; px++) {
          for (let pz = 0; pz < 16; pz++) {
            const pixel = readPixel(c, {
              major,
              minor,
              usesColorTypes,
              statePalette,
              biomePalette
            })
            const localX = tileX * 64 + cx * 16 + px
            const localZ = tileZ * 64 + cz * 16 + pz
            blocks.set(localX + localZ * 512, pixel)
          }
        }
        if (minor >= 4) c.readI8() // chunkInterpretationVersion
        if (minor >= 6) {
          c.readI32() // caveStart
          if (minor >= 7) c.readI8() // caveDepth
        }
      }
    }
  }

  return { major, minor, blocks }
}

function readPixel(
  c: Cursor,
  ctx: {
    major: number
    minor: number
    usesColorTypes: boolean
    statePalette: string[]
    biomePalette: string[]
  }
): ParsedPixel {
  const { major, minor, usesColorTypes, statePalette, biomePalette } = ctx
  const parameters = c.readParamBits()
  const isNotGrass = parameters.getNextBits(1) === 1
  const hasOverlays = parameters.getNextBits(1) === 1
  const colorType = usesColorTypes ? parameters.peekNextBits(2) : 0
  parameters.skipBits(2)

  let hasSlope = false
  if (minor === 2) {
    hasSlope = parameters.getNextBits(1) === 1
  } else {
    parameters.skipBits(1)
  }
  parameters.skipBits(1)
  const heightInParameters = parameters.getNextBits(1) === 0
  parameters.skipToNextByte()
  parameters.getNextBits(4) // light
  let height = 0
  if (heightInParameters) {
    height = parameters.getNextBits(8)
  } else {
    parameters.skipBits(8)
  }
  const hasBiome = parameters.getNextBits(1) === 1
  const newStatePaletteEntry = parameters.getNextBits(1) === 1
  const newBiomePaletteEntry = parameters.getNextBits(1) === 1
  const biomeAsInt = parameters.getNextBits(1) === 1
  const topHeightMismatch = minor >= 4 ? parameters.getNextBits(1) === 1 : false
  if (heightInParameters) {
    const hi = parameters.getNextBits(4)
    height = (height | (hi << 8)) & 0x0fff
    if (height & 0x0800) height |= 0xf000
    // sign-extend 12→16
    height = height << 16 >> 16
  }

  let blockId = 'minecraft:grass_block'
  if (isNotGrass) {
    if (major === 0) {
      c.readI32() // legacy state id — unknown without registry
      blockId = 'minecraft:unknown'
    } else if (newStatePaletteEntry) {
      blockId = readNbtBlockName(c)
      statePalette.push(blockId)
    } else {
      const idx = c.readI32()
      blockId = statePalette[idx] ?? 'minecraft:air'
    }
  }

  if (!heightInParameters) {
    height = c.readU8()
  }
  if (topHeightMismatch) {
    c.readU8()
  }

  // Top overlay wins for what the player "sees" on the map
  let topOverlay: string | null = null
  if (hasOverlays) {
    const size = c.readU8()
    for (let i = 0; i < size; i++) {
      const op = c.readParamBits()
      const isWater = op.getNextBits(1) === 0
      const legacyOpacity = op.getNextBits(1) === 1
      const customColor = op.getNextBits(1) === 1
      const hasOpacity = op.getNextBits(1) === 1
      op.getNextBits(4) // light
      let overlayColorType = 0
      if (usesColorTypes) overlayColorType = op.getNextBits(2)
      else op.skipBits(2)
      const newOverlayState = op.getNextBits(1) === 1
      if (minor >= 8) op.getNextBits(4) // opacity

      let overlayId = 'minecraft:water'
      if (isWater) {
        overlayId = 'minecraft:water'
      } else if (major === 0) {
        c.readI32()
        overlayId = 'minecraft:unknown'
      } else if (newOverlayState) {
        overlayId = readNbtBlockName(c)
        statePalette.push(overlayId)
      } else {
        const idx = c.readI32() >>> 0
        overlayId = statePalette[idx] ?? 'minecraft:air'
      }
      topOverlay = overlayId

      if (minor < 1 && legacyOpacity) c.skip(4)
      if (overlayColorType === 3 || customColor) c.skip(4)
      if (minor < 8 && hasOpacity) c.readI32()
    }
  }

  if (colorType === 2) c.skip(4) // CUSTOM_BIOME
  let biomeId: string | null = null
  if ((colorType !== 0 && colorType !== 2) || hasBiome) {
    if (major < 4) {
      const biomeByte = c.readU8()
      if (minor >= 3 && biomeByte >= 255) c.readI32()
      biomeId = null
    } else if (newBiomePaletteEntry) {
      if (biomeAsInt) {
        c.readI32()
        biomeId = null
      } else {
        biomeId = c.readMUTF()
        biomePalette.push(biomeId)
      }
    } else {
      const idx = c.readI32() >>> 0
      biomeId = biomePalette[idx] ?? null
    }
  }

  if (minor === 2 && hasSlope) c.skip(1)

  return {
    blockId: topOverlay ?? blockId,
    biomeId,
    height
  }
}

export function lookupBlockInRegionData(
  data: Buffer,
  localX: number,
  localZ: number
): XaeroBlockHit | null {
  if (localX < 0 || localX >= 512 || localZ < 0 || localZ >= 512) return null
  const { blocks } = parseRegionBlockIndex(data)
  const pixel = blocks.get(localX + localZ * 512)
  if (!pixel) return null
  return {
    blockId: pixel.blockId,
    displayName: displayNameFromId(pixel.blockId),
    biomeId: pixel.biomeId,
    height: pixel.height
  }
}

export function worldToRegionLocal(
  blockX: number,
  blockZ: number
): { regionX: number; regionZ: number; localX: number; localZ: number } {
  // Arithmetic shift toward -∞ for negative coords
  const regionX = Math.floor(blockX / 512)
  const regionZ = Math.floor(blockZ / 512)
  const localX = ((blockX % 512) + 512) % 512
  const localZ = ((blockZ % 512) + 512) % 512
  return { regionX, regionZ, localX, localZ }
}
