// Additional safety check for production
export function isProductionSafeOperation(): boolean {
  // Backup operations enabled by default
  // Set ALLOW_BACKUP_OPERATIONS=false to disable
  return process.env.ALLOW_BACKUP_OPERATIONS !== 'false'
}