import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { crx } from "@crxjs/vite-plugin"
import manifest from "./extension/manifest.json"

// Strip the popup from the manifest Vite parses, so CRXJS doesn't try to build the Next export
const { action, ...restManifest } = manifest as any

export default defineConfig({
  plugins: [
    react(),
    crx({
      manifest: {
        ...restManifest,
        action: {
          ...action,
          default_popup: undefined, // Hide from Vite
        },
      },
    }),
  ],
  build: { outDir: "dist", emptyOutDir: true },
})
