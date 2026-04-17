import { loadEnv } from '@medusajs/framework/utils'
import { assertValue } from 'utils/assert-value'

// Load environment variables based on the current environment
loadEnv(process.env.NODE_ENV || 'development', process.cwd())

/**
 * 1. CORE SERVER CONFIG
 */
export const IS_DEV = process.env.NODE_ENV === 'development'

export const BACKEND_URL = 
  process.env.BACKEND_PUBLIC_URL ?? 
  process.env.RAILWAY_PUBLIC_DOMAIN_VALUE ?? 
  'http://localhost:9000'

// Use assertValue for critical infrastructure variables to fail fast if missing
export const DATABASE_URL = assertValue(
  process.env.DATABASE_URL,
  'Environment variable DATABASE_URL is required for the backend to start.'
)

export const JWT_SECRET = assertValue(
  process.env.JWT_SECRET,
  'Environment variable JWT_SECRET is required for security.'
)

export const COOKIE_SECRET = assertValue(
  process.env.COOKIE_SECRET,
  'Environment variable COOKIE_SECRET is required.'
)

/**
 * 2. CORS SETTINGS (Crucial for Vercel/Storefront connectivity)
 * We use the '??' operator to ensure we only fall back to empty strings 
 * if the environment variable is null or undefined.
 */
export const ADMIN_CORS = process.env.ADMIN_CORS ?? ""
export const AUTH_CORS = process.env.AUTH_CORS ?? ""
export const STORE_CORS = process.env.STORE_CORS ?? ""

/**
 * 3. OPTIONAL SERVICES (Redis, Storage, Email, Payments)
 */
export const REDIS_URL = process.env.REDIS_URL
export const STRIPE_API_KEY = process.env.STRIPE_API_KEY
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY
export const MINIO_BUCKET = process.env.MINIO_BUCKET

export const RESEND_API_KEY = process.env.RESEND_API_KEY
export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM
export const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
export const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.SENDGRID_FROM
export const CONTACT_NOTIFICATION_EMAIL = process.env.CONTACT_NOTIFICATION_EMAIL

export const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST
export const MEILISEARCH_ADMIN_KEY = process.env.MEILISEARCH_ADMIN_KEY

/**
 * 4. SYSTEM MODES
 */
export const WORKER_MODE = (process.env.MEDUSA_WORKER_MODE) || 'shared'
export const SHOULD_DISABLE_ADMIN = String(process.env.MEDUSA_DISABLE_ADMIN).toLowerCase() === 'true'