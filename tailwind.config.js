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
        // A deliberate blue/teal pair, not the indigo→cyan gradient every
        // AI-scaffolded dashboard reaches for — same token names everywhere
        // downstream, just less generic values.
        accent: "#3454d1",
        accent2: "#0891b2",
        risk: "#f43f5e",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
