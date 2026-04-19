import { loadEnv, Modules, defineConfig } from '@medusajs/utils';

// 1. CRITICAL: Load environment variables BEFORE importing constants
loadEnv(process.env.NODE_ENV, process.cwd());

import {
  ADMIN_CORS,
  AUTH_CORS,
  BACKEND_URL,
  COOKIE_SECRET,
  DATABASE_URL,
  JWT_SECRET,
  REDIS_URL,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SHOULD_DISABLE_ADMIN,
  STORE_CORS,
  STRIPE_API_KEY,
  STRIPE_WEBHOOK_SECRET,
  SHIPSTATION_API_KEY,
  WORKER_MODE,
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MEILISEARCH_HOST,
  MEILISEARCH_ADMIN_KEY
} from 'lib/constants';

const medusaConfig = {
  projectConfig: {
    databaseUrl: DATABASE_URL,
    databaseLogging: false,
    redisUrl: REDIS_URL,
    workerMode: WORKER_MODE,

    http: {
      adminCors: process.env.ADMIN_CORS || ADMIN_CORS,
      authCors: process.env.AUTH_CORS || AUTH_CORS,
      storeCors: process.env.STORE_CORS || STORE_CORS,

      // ✅ REQUIRED FIX: allow preflight + publishable key header
      store: {
        allow_unauthenticated_preflight: true,
        cors_headers: [
          "Content-Type",
          "x-publishable-api-key",
        ],
      },

      jwtSecret: JWT_SECRET,
      cookieSecret: COOKIE_SECRET,
    },

    build: {
      rollupOptions: {
        external: ["@medusajs/dashboard", "@medusajs/admin-shared"],
      },
    },
  },

  admin: {
    backendUrl: BACKEND_URL,
    disable: SHOULD_DISABLE_ADMIN,
  },

  modules: [
    {
      key: Modules.FILE,
      resolve: '@medusajs/file',
      options: {
        providers: [
          ...(MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY
            ? [{
                resolve: './src/modules/minio-file',
                id: 'minio',
                options: {
                  endPoint: MINIO_ENDPOINT,
                  accessKey: MINIO_ACCESS_KEY,
                  secretKey: MINIO_SECRET_KEY,
                  bucket: MINIO_BUCKET,
                },
              }]
            : [{
                resolve: '@medusajs/file-local',
                id: 'local',
                options: {
                  upload_dir: 'static',
                  backend_url: `${BACKEND_URL}/static`,
                },
              }]),
        ],
      },
    },

    ...(REDIS_URL
      ? [
          {
            key: Modules.EVENT_BUS,
            resolve: '@medusajs/event-bus-redis',
            options: {
              redisUrl: REDIS_URL,
            },
          },
          {
            key: Modules.WORKFLOW_ENGINE,
            resolve: '@medusajs/workflow-engine-redis',
            options: {
              redis: { url: REDIS_URL },
            },
          },
        ]
      : []),

    ...(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL || RESEND_API_KEY && RESEND_FROM_EMAIL
      ? [{
          key: Modules.NOTIFICATION,
          resolve: '@medusajs/notification',
          options: {
            providers: [
              ...(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL
                ? [{
                    resolve: '@medusajs/notification-sendgrid',
                    id: 'sendgrid',
                    options: {
                      channels: ['email'],
                      api_key: SENDGRID_API_KEY,
                      from: SENDGRID_FROM_EMAIL,
                    },
                  }]
                : []),
              ...(RESEND_API_KEY && RESEND_FROM_EMAIL
                ? [{
                    resolve: './src/modules/email-notifications',
                    id: 'resend',
                    options: {
                      channels: ['email'],
                      api_key: RESEND_API_KEY,
                      from: RESEND_FROM_EMAIL,
                    },
                  }]
                : []),
            ],
          },
        }]
      : []),

    ...(STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET
      ? [{
          key: Modules.PAYMENT,
          resolve: '@medusajs/payment',
          options: {
            providers: [
              {
                resolve: '@medusajs/payment-stripe',
                id: 'stripe',
                options: {
                  apiKey: STRIPE_API_KEY,
                  webhookSecret: STRIPE_WEBHOOK_SECRET,
                },
              },
            ],
          },
        }]
      : []),

    ...(SHIPSTATION_API_KEY
      ? [{
          key: Modules.FULFILLMENT,
          resolve: "@medusajs/fulfillment",
          options: {
            providers: [
              {
                resolve: "@medusajs/fulfillment-manual",
                id: "manual",
              },
              {
                resolve: "./src/modules/shipstation",
                id: "shipstation",
                options: {
                  api_key: SHIPSTATION_API_KEY,
                },
              },
            ],
          },
        }]
      : []),
  ],

  plugins: [
    ...(MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY
      ? [{
          resolve: '@rokmohar/medusa-plugin-meilisearch',
          options: {
            config: {
              host: MEILISEARCH_HOST,
              apiKey: MEILISEARCH_ADMIN_KEY,
            },
            settings: {
              products: {
                type: 'products',
                enabled: true,
                fields: ['id', 'title', 'description', 'handle', 'variant_sku', 'thumbnail'],
                indexSettings: {
                  searchableAttributes: ['title', 'description', 'variant_sku'],
                  displayedAttributes: ['id', 'handle', 'title', 'description', 'variant_sku', 'thumbnail'],
                  filterableAttributes: ['id', 'handle'],
                },
                primaryKey: 'id',
              },
            },
          },
        }]
      : []),
  ],
};

export default defineConfig(medusaConfig);