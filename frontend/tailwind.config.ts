import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Microsoft JhengHei", "Noto Sans TC", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 34px rgba(56, 189, 248, 0.25)",
        card: "0 24px 80px rgba(0, 0, 0, 0.42)",
      },
    },
  },
  plugins: [],
} satisfies Config;
