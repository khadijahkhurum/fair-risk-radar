/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b0f17",
        surface: "#111827",
        surface2: "#1a2333",
        border: "#26324a",
        accent: "#6366f1",
        accent2: "#22d3ee",
        risk: "#f43f5e",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
