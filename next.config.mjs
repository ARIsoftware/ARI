import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { config as dotenvConfig } from "dotenv"
import { resolve } from "node:path"

// Load .env.supabase.local (overrides .env.local values already loaded by Next.js)
const supabaseEnvPath = resolve(process.cwd(), ".env.supabase.local")
if (existsSync(supabaseEnvPath)) {
  dotenvConfig({ path: supabaseEnvPath, override: true, quiet: true })
}

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))

function git(cmd, fallback) {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return fallback
  }
}

const commitSha =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  git("rev-parse --short HEAD", "unknown")

// Private/loopback IPv4 ranges, as Next's hostname glob patterns (dot-segment
// wildcards). `./ari start --lan` binds the dev server to 0.0.0.0, and Next
// otherwise blocks cross-site dev requests (HMR websocket, /_next internals)
// from any host but localhost — so the LAN page loads but never hot-reloads.
// Dev-only config: `allowedDevOrigins` is ignored by production builds.
const privateDevOrigins = [
  '127.*.*.*',
  '10.*.*.*',
  '192.168.*.*',
  '169.254.*.*',
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: privateDevOrigins,
  env: {
    NEXT_PUBLIC_ARI_VERSION: `${pkg.version}+${commitSha}`,
    NEXT_PUBLIC_ARI_COMMIT: commitSha,
    NEXT_PUBLIC_IS_VERCEL: process.env.VERCEL ? '1' : '',
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@node-rs/argon2", "@aws-sdk/client-s3"],
  // Show the Next.js dev indicator overlay when either env var is "true".
  // `devIndicators` is the preferred name (matches the Next.js config key);
  // `DEV_INDICATORS` is kept for backwards compatibility with older .env.local files.
  devIndicators:
    process.env.devIndicators === 'true' || process.env.DEV_INDICATORS === 'true'
      ? {}
      : false,
  async redirects() {
    return [
      { source: '/debug', destination: '/health', permanent: false },
    ]
  },
}

export default nextConfig
