// Production-safe logging utility
const isProduction = process.env.NODE_ENV === 'production'

export const logger = {
  // Always log errors, even in production
  error: (message: string, ...args: unknown[]) => {
    console.error(message, ...args)
  },
  
  // Log warnings in development, suppress in production
  warn: (message: string, ...args: unknown[]) => {
    if (!isProduction) {
      console.warn(message, ...args)
    }
  },
  
  // Log info/debug only in development
  info: (message: string, ...args: unknown[]) => {
    if (!isProduction) {
      console.log(message, ...args)
    }
  },
  
  // Alias for info
  log: (message: string, ...args: unknown[]) => {
    if (!isProduction) {
      console.log(message, ...args)
    }
  }
}