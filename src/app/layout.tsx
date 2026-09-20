import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FAIR Risk Radar",
  description:
    "Quantitative cyber risk platform — FAIR Monte Carlo simulation, compliance-as-code control mapping, and a persistent audit trail.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-canvas text-slate-100 antialiased">{children}</body>
    </html>
  );
}
