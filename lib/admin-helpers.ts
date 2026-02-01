// Admin access control for sensitive operations
export function isAdminUser(userId: string): boolean {
  // Get admin user IDs from environment variable only (no hardcoded IDs for security)
  const envAdmins = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()).filter(Boolean) || []

  if (envAdmins.length === 0) {
    console.warn('[Admin] No ADMIN_USER_IDS configured in environment variables')
    return false
  }

  return envAdmins.includes(userId)
}

export function requireAdmin(userId: string): void {
  if (!isAdminUser(userId)) {
    throw new Error('Admin access required for this operation')
  }
}

// Additional safety check for production
export function isProductionSafeOperation(): boolean {
  // Backup operations enabled by default
  // Set ALLOW_BACKUP_OPERATIONS=false to disable
  return process.env.ALLOW_BACKUP_OPERATIONS !== 'false'
}