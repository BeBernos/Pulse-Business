import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

export default defineConfig({
  // caminhos relativos: funciona em qualquer subpasta (ex.: GitHub Pages /App-Treino/)
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      // SW próprio (src/sw.ts): precache offline + notificações de lembrete
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"] },
      includeAssets: ["icon.svg", "apple-touch-icon.png", "badge-96.png"],
      manifest: {
        name: "Pulse",
        short_name: "Pulse",
        description: "Pulse: seu treino no celular e no PC — plano do bloco, registro por série e evolução.",
        lang: "pt-BR",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#08070F",
        theme_color: "#08070F",
        // segurar o ícone do app: atalhos
        shortcuts: [
          { name: "Treino de hoje", short_name: "Treino", url: "./#/inicio", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Registrar peso", short_name: "Peso", url: "./#/corpo/novo/peso", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
          { name: "Progresso", short_name: "Progresso", url: "./#/progresso", icons: [{ src: "icon-192.png", sizes: "192x192" }] },
        ],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 700 },
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx", "worker/**/*.test.js"] },
});
