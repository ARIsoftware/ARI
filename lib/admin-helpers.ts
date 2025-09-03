// Admin access control for sensitive operations
export function isAdminUser(userId: string): boolean {
  // Admin user IDs - hardcoded for single admin user
  const adminUserIds = [
    '01dbcb0e-6d5c-4612-baa0-376cb1a97783'
  ]
  
  // Also check environment variable for additional admin IDs
  const envAdmins = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || []
  
  return adminUserIds.includes(userId) || envAdmins.includes(userId)
}

export function requireAdmin(userId: string): void {
  if (!isAdminUser(userId)) {
    throw new Error('Admin access required for this operation')
  }
}

// Additional safety check for production
export function isProductionSafeOperation(): boolean {
  const nodeEnv = process.env.NODE_ENV
  const isProduction = nodeEnv === 'production'
  
  // In production, require explicit environment flag
  if (isProduction) {
    return process.env.ALLOW_BACKUP_OPERATIONS === 'true'
  }
  
  return true
}