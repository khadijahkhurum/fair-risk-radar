import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FAIR Risk Radar",
  description:
    "Quantitative cyber risk platform — FAIR Monte Carlo simulation, compliance-as-code control mapping, and a persistent audit trail.",
  applicationName: "FAIR Risk Radar",
  appleWebApp: { capable: true, title: "Risk Radar", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

// themeColor paints the phone's browser chrome to match the app instead of
// leaving a white bar above a black page. viewportFit lets the layout run
// under the notch on iOS.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-canvas text-slate-100 antialiased">{children}</body>
    </html>
  );
}
