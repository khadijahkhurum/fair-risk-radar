/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Apple's dark-mode system palette: true neutral grays (no blue cast),
        // elevation carried by surface lightness rather than by borders.
        canvas: "#000000",
        surface: "#1c1c1e", // systemGray6 dark
        surface2: "#2c2c2e", // systemGray5 dark
        border: "rgba(255,255,255,0.10)", // hairline separator, not a drawn box
        accent: "#0a84ff", // systemBlue dark
        accent2: "#64d2ff", // systemCyan dark
        risk: "#ff453a", // systemRed dark
        // The app leans on slate/emerald/amber for body text and status.
        // Re-pointing those ramps at Apple's neutral grays + system colors
        // restyles every existing className without touching a component.
        slate: {
          100: "#f5f5f7",
          200: "#e5e5ea",
          300: "#d1d1d6",
          400: "#98989d", // secondary label
          500: "#8e8e93", // tertiary label
          600: "#636366",
          700: "#48484a",
          800: "#3a3a3c",
          900: "#1c1c1e",
        },
        emerald: {
          300: "#7ee2a8",
          400: "#30d158", // systemGreen dark
          500: "#30d158",
        },
        amber: {
          300: "#ffd60a",
          400: "#ff9f0a", // systemOrange dark
          500: "#ff9f0a",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Inter",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: ["SF Mono", "ui-monospace", "JetBrains Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        // Soft, wide, low-opacity — Apple elevates with diffusion, not a hard
        // drop shadow.
        card: "0 1px 2px rgba(0,0,0,0.30), 0 8px 24px -12px rgba(0,0,0,0.60)",
        pop: "0 12px 40px -8px rgba(0,0,0,0.70)",
      },
      // Re-point the existing radius scale instead of rewriting every
      // className: each rounded-* already in the codebase gets Apple's more
      // generous corner treatment for free.
      borderRadius: {
        "2xl": "18px",
        xl: "14px",
        lg: "11px",
        md: "9px",
      },
    },
  },
  plugins: [],
};
