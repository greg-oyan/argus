import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        workstation: {
          bg: "#05070a",
          panel: "#0b1118",
          panel2: "#0f1722",
          line: "#1e2b38",
          muted: "#7b8794",
          text: "#d7dee7",
          accent: "#6bb7ff",
          amber: "#d8a84c",
          green: "#80c990",
          red: "#d46a6a",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
