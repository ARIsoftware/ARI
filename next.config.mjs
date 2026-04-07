import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))

function git(cmd, fallback) {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return fallback
  }
}

const buildNum = git("rev-list --count HEAD", "0")
const commitSha = git("rev-parse --short HEAD", "unknown")

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_ARI_VERSION: `${pkg.version}+${buildNum}`,
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
