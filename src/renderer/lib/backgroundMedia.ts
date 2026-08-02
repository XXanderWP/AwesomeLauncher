/**
 * Random launcher wallpaper (mirrors AwesomeCraftLauncher bkid backgrounds).
 */

const backgroundModules = import.meta.glob('../assets/images/backgrounds/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const backgroundUrls: string[] = Object.values(backgroundModules).filter(Boolean)

export function getRandomBackgroundUrl(): string | null {
  if (backgroundUrls.length === 0) return null
  return backgroundUrls[Math.floor(Math.random() * backgroundUrls.length)]
}
