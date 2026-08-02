export interface RamValidationResult {
  minRamMb: number
  maxRamMb: number
  totalMb: number
  maxRatio: number
  minGreaterThanMax: boolean
  maxAtOrAboveTotal: boolean
  warningLevel: 'none' | 'yellow' | 'red'
  canSave: boolean
}

export function validateRamLimits(
  minRamMb: number,
  maxRamMb: number,
  totalMb: number
): RamValidationResult {
  const min = Math.max(0, Number(minRamMb) || 0)
  const max = Math.max(0, Number(maxRamMb) || 0)
  const total = Math.max(1, Number(totalMb) || 1)
  const maxRatio = max / total
  const minGreaterThanMax = max < min
  const maxAtOrAboveTotal = max >= total

  let warningLevel: RamValidationResult['warningLevel'] = 'none'
  if (maxRatio >= 0.8) warningLevel = 'red'
  else if (maxRatio > 0.5) warningLevel = 'yellow'

  const canSave = !minGreaterThanMax && !maxAtOrAboveTotal

  return {
    minRamMb: min,
    maxRamMb: max,
    totalMb: total,
    maxRatio,
    minGreaterThanMax,
    maxAtOrAboveTotal,
    warningLevel,
    canSave
  }
}

export function clampRamMb(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function bytesToMb(totalBytes: number): number {
  return Math.max(1, Math.floor(totalBytes / (1024 * 1024)))
}
