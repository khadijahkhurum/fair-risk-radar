import type { MetadataRoute } from "next";

// Web app manifest — lets the deployed site be installed to a phone's home
// screen and launched without browser chrome. Nothing to configure in Vercel:
// Next serves this at /manifest.webmanifest automatically.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FAIR Risk Radar",
    short_name: "Risk Radar",
    description:
      "Quantitative cyber risk platform — FAIR Monte Carlo simulation, compliance-as-code control mapping, and a persistent audit trail.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
