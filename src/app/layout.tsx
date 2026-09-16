import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FAIR Risk Radar",
  description:
    "A FAIR-methodology quantitative cyber risk model, run as a server-side Monte Carlo simulation with a Postgres backend, compliance-as-code control catalog, and a live AWS Config integration.",
};

// Applies the saved theme before first paint so there's no light-mode flash
// on load for dark-mode users. Runs inline, ahead of hydration.
const themeScript = `
(function(){
  try {
    var saved = localStorage.getItem("frr-theme");
    var theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
