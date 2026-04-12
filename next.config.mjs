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

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ARI_VERSION: `${pkg.version}+${commitSha}`,
    NEXT_PUBLIC_ARI_COMMIT: commitSha,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@node-rs/argon2"],
}

export default nextConfig
