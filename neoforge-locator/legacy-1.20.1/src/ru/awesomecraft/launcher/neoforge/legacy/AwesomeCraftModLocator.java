package ru.awesomecraft.launcher.neoforge.legacy;

import net.minecraftforge.fml.loading.moddiscovery.AbstractJarFileModLocator;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/** Loads only pack JARs selected by AwesomeCraftLauncher for this server. */
public final class AwesomeCraftModLocator extends AbstractJarFileModLocator {
    private static final String MANIFEST_PROPERTY = "awesomecraft.neoforge.modManifest";
    private static final String ROOT_PROPERTY = "awesomecraft.neoforge.modRoot";

    @Override
    public Stream<Path> scanCandidates() {
        return readCandidates().stream();
    }

    @Override
    public String name() {
        return "awesomecraft central NeoForge mods";
    }

    @Override
    public void initArguments(Map<String, ?> arguments) {
        // Configuration is supplied as JVM properties before FML starts.
    }

    private static List<Path> readCandidates() {
        String manifestValue = System.getProperty(MANIFEST_PROPERTY);
        if (manifestValue == null || manifestValue.isBlank()) {
            return List.of();
        }

        try {
            Path root = requireRealDirectory(System.getProperty(ROOT_PROPERTY));
            Path manifest = Path.of(manifestValue).toAbsolutePath().normalize();
            return Files.readAllLines(manifest, StandardCharsets.UTF_8).stream()
                    .map(String::trim)
                    .filter(line -> !line.isEmpty() && !line.startsWith("#"))
                    .map(line -> validateJar(root, line))
                    .toList();
        } catch (IOException | RuntimeException error) {
            throw new IllegalStateException("Cannot read AwesomeCraft NeoForge mod manifest", error);
        }
    }

    private static Path requireRealDirectory(String value) throws IOException {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing JVM property " + ROOT_PROPERTY);
        }
        Path root = Path.of(value).toRealPath();
        if (!Files.isDirectory(root)) {
            throw new IllegalArgumentException("NeoForge mod root is not a directory: " + root);
        }
        return root;
    }

    private static Path validateJar(Path root, String value) {
        try {
            Path candidate = Path.of(value).toRealPath();
            if (!candidate.startsWith(root) || !Files.isRegularFile(candidate)
                    || !candidate.getFileName().toString().toLowerCase().endsWith(".jar")) {
                throw new IllegalArgumentException("Invalid central NeoForge mod path: " + candidate);
            }
            return candidate;
        } catch (IOException error) {
            throw new IllegalArgumentException("Missing central NeoForge mod: " + value, error);
        }
    }
}
