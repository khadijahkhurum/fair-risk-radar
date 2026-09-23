/** @type {import('next').NextConfig} */

// Audit S8: the deployment carried HSTS and nothing else — no CSP, no
// frame-ancestors, no nosniff. The API routes correctly carry no
// Access-Control-Allow-Origin, and that is the single thing that kept the
// unauthenticated endpoints from being drive-by exploitable cross-origin.
// These headers are the rest of that floor.
//
// script-src keeps 'unsafe-inline' because Next.js inlines its hydration
// bootstrap; tightening that to per-request nonces requires moving page
// rendering off static generation, which is a larger change than this batch.
// Fonts are allow-listed explicitly because globals.css imports Inter from
// Google Fonts — a CSP that omits them silently breaks the typography.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Audit E2: these carried `public, max-age=0, must-revalidate`.
        // `public` permits a shared cache to store the response, which becomes
        // a leak vector the moment responses are per-user.
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, private" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
