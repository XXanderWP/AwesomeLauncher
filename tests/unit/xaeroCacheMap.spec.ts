import {
  composeRegionRgba,
  composeWorldRgba,
  countOpaquePixels,
  decodeXaeroLrgb,
  encodePngRgba,
  extractXaeroCacheTiles,
  scaleRgbaNearest
} from '../../src/main/services/xaero/xaeroCacheMap'
import {
  parseWaypointFile,
  resolveLogoutPosition
} from '../../src/main/services/xaero/xaeroWaypoints'
import {
  listXwmc,
  parseRegionCoords
} from '../../src/main/services/xaero/XaeroMapService'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

describe('xaeroCacheMap', () => {
  it('decodes [light,R,G,B] buffers and drops light-only pixels', () => {
    // light-only (old misread as solid red) → empty
    const lightOnly = Buffer.from([255, 0, 0, 0])
    expect([...decodeXaeroLrgb(lightOnly)]).toEqual([0, 0, 0, 0])

    // fullbright terrain when light byte is 0
    const fullbright = Buffer.from([0, 40, 120, 60])
    expect([...decodeXaeroLrgb(fullbright)]).toEqual([40, 120, 60, 255])

    // lit terrain: RGB scaled by light/255
    const lit = Buffer.from([128, 200, 100, 50])
    const out = decodeXaeroLrgb(lit)
    expect(out[0]).toBe(Math.round((200 * 128) / 255))
    expect(out[1]).toBe(Math.round((100 * 128) / 255))
    expect(out[2]).toBe(Math.round((50 * 128) / 255))
    expect(out[3]).toBe(255)
  })

  it('extracts uncompressed tiles with LRGB decode', () => {
    const pixels = Buffer.alloc(64 * 64 * 4, 0)
    // light-only → empty
    pixels[0] = 255
    pixels[1] = 0
    pixels[2] = 0
    pixels[3] = 0
    // terrain: light=0, RGB display-ready
    pixels[4] = 0
    pixels[5] = 10
    pixels[6] = 200
    pixels[7] = 30

    const header = Buffer.alloc(10)
    header[0] = (2 << 4) | 3 // tile (2,3)
    header[1] = 0 // uncompressed
    header.writeInt32BE(0x8058, 2) // GL_RGBA
    header.writeInt32BE(pixels.length, 6)

    const tiles = extractXaeroCacheTiles(Buffer.concat([Buffer.from([0xff, 0x00]), header, pixels]))
    expect(tiles).toHaveLength(1)
    expect(tiles[0].x).toBe(2)
    expect(tiles[0].z).toBe(3)
    expect(tiles[0].rgba[0]).toBe(0)
    expect(tiles[0].rgba[1]).toBe(0)
    expect(tiles[0].rgba[2]).toBe(0)
    expect(tiles[0].rgba[3]).toBe(0)
    expect(tiles[0].rgba[4]).toBe(10)
    expect(tiles[0].rgba[5]).toBe(200)
    expect(tiles[0].rgba[6]).toBe(30)
    expect(tiles[0].rgba[7]).toBe(255)
    expect(countOpaquePixels(tiles[0].rgba)).toBe(1)
  })

  it('composes region and world images and encodes PNG', () => {
    const tile = Buffer.alloc(64 * 64 * 4, 0)
    for (let i = 0; i < tile.length; i += 4) {
      tile[i] = 40
      tile[i + 1] = 120
      tile[i + 2] = 60
      tile[i + 3] = 255
    }
    const region = composeRegionRgba([{ x: 0, z: 0, rgba: tile }])
    expect(region).not.toBeNull()
    expect(region!.length).toBe(512 * 512 * 4)

    const world = composeWorldRgba([
      { regionX: -1, regionZ: 0, rgba: region! },
      { regionX: 0, regionZ: 0, rgba: region! }
    ])
    expect(world).not.toBeNull()
    expect(world!.width).toBe(1024)
    expect(world!.height).toBe(512)
    expect(world!.originX).toBe(-1)

    const scaled = scaleRgbaNearest(world!.rgba, world!.width, world!.height, 256)
    expect(scaled.width).toBeLessThanOrEqual(256)
    expect(scaled.height).toBeLessThanOrEqual(256)

    const png = encodePngRgba(scaled.rgba, scaled.width, scaled.height)
    expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true)
  })
})

describe('xaero region cache listing', () => {
  it('parses live and outdated region filenames', () => {
    expect(parseRegionCoords('-1_-1.xwmc')).toEqual({ x: -1, z: -1 })
    expect(parseRegionCoords('-1_-1.xwmc.outdated')).toEqual({ x: -1, z: -1 })
    expect(parseRegionCoords('0_2.XWMC.OUTDATED')).toEqual({ x: 0, z: 2 })
    expect(parseRegionCoords('notes.txt')).toBeNull()
  })

  it('falls back to .xwmc.outdated when live cache is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xaero-cache-'))
    try {
      await fs.writeFile(path.join(dir, '-1_-1.xwmc.outdated'), 'outdated')
      await fs.writeFile(path.join(dir, '0_0.xwmc'), 'live')
      await fs.writeFile(path.join(dir, '0_0.xwmc.outdated'), 'old')
      const files = await listXwmc(dir)
      const names = files.map((f) => path.basename(f)).sort()
      expect(names).toEqual(['-1_-1.xwmc.outdated', '0_0.xwmc'])
    } finally {
      await fs.remove(dir)
    }
  })
})

describe('xaeroWaypoints', () => {
  it('parses waypoint lines and detects death markers', () => {
    const text = `
#waypoint:name:initials:x:y:z:color:disabled:type:set:rotate_on_tp:tp_yaw:visibility_type:destination
waypoint:ДОМ:Д:-94:63:-259:9:false:0:gui.xaero_default:false:0:0:false
waypoint:Death:X:10:64:20:5:false:1:gui.xaero_default:false:0:0:false
waypoint:hidden:H:1:1:1:0:true:0:gui.xaero_default:false:0:0:false
`
    const all = parseWaypointFile(text)
    expect(all).toHaveLength(3)
    expect(all[0].name).toBe('ДОМ')
    expect(all[0].x).toBe(-94)
    expect(all[1].kind).toBe('death')
    const logout = resolveLogoutPosition(all.filter((w) => !w.disabled))
    expect(logout).not.toBeNull()
    expect(logout!.x).toBe(10)
    expect(logout!.source).toBe('death-waypoint')
  })
})
