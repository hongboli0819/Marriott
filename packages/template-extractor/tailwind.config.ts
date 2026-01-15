import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
        // 模版编辑器语义化颜色
        "editable-zone": "hsl(var(--editable-zone))",
        "locked-zone": "hsl(var(--locked-zone))",
        "default-zone": "hsl(var(--default-zone))",
        "replaceable-zone": "hsl(var(--replaceable-zone))",
      },
    },
  },
  plugins: [],
} satisfies Config;


