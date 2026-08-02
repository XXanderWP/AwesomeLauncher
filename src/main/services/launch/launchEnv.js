/**
 * Environment for the Minecraft JVM process.
 *
 * NVIDIA + Wayland/X11 frequently SIGSEGV inside GLFW (glfwWaitEventsTimeout /
 * org.lwjgl.system.JNI) unless threaded GL optimizations are disabled before
 * the process starts. Sodium applies a similar workaround later; that is too
 * late for the main GLFW event loop on some drivers.
 */
function buildMinecraftProcessEnv(baseEnv = process.env, platform = process.platform) {
  const env = { ...baseEnv }

  if (platform === 'linux') {
    // Do not override an explicit user setting.
    if (env.__GL_THREADED_OPTIMIZATIONS == null) {
      env.__GL_THREADED_OPTIMIZATIONS = '0'
    }
  }

  return env
}

module.exports = {
  buildMinecraftProcessEnv
}
