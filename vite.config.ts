// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Self-hosted Docker/VPS builds (Mắt Bão) set NITRO_PRESET=node so Nitro emits a
// standalone Node SSR server. Inside Lovable the preset/output are forced to
// Cloudflare regardless of what we pass here, so preview/publish is unaffected.
const selfHostPreset = process.env['NITRO_PRESET'];

export default defineConfig({
  ...(selfHostPreset
    ? {
        nitro: {
          preset: selfHostPreset,
          output: {
            dir: ".output",
            serverDir: ".output/server",
            publicDir: ".output/public",
          },
        } as const,
      }
    : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
