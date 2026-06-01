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
  SHOULD_DISABLE_ADMIN,
  STORE_CORS,
  STRIPE_API_KEY,
  STRIPE_WEBHOOK_SECRET,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_WEBHOOK_ID,
  PAYPAL_IS_SANDBOX,
  SHIPSTATION_API_KEY,
  AUSPOST_API_KEY,
  AUSPOST_API_PASSWORD,
  AUSPOST_ACCOUNT_NUMBER,
  AUSPOST_TEST_MODE,
  AUSPOST_DEFAULT_SERVICE_PARCEL_PRODUCT_ID,
  AUSPOST_DEFAULT_SERVICE_EXPRESS_PRODUCT_ID,
  AUSPOST_LABEL_FORMAT,
  AUSPOST_LABEL_LAYOUT,
  ASCOLOUR_SUBSCRIPTION_KEY,
  ASCOLOUR_EMAIL,
  ASCOLOUR_PASSWORD,
  ASCOLOUR_BASE_URL,
  ASCOLOUR_DEFAULT_SHIPPING_METHOD,
  ASCOLOUR_WORKSHOP_COMPANY,
  ASCOLOUR_WORKSHOP_FIRST_NAME,
  ASCOLOUR_WORKSHOP_LAST_NAME,
  ASCOLOUR_WORKSHOP_ADDRESS_1,
  ASCOLOUR_WORKSHOP_ADDRESS_2,
  ASCOLOUR_WORKSHOP_CITY,
  ASCOLOUR_WORKSHOP_STATE,
  ASCOLOUR_WORKSHOP_ZIP,
  ASCOLOUR_WORKSHOP_COUNTRY_CODE,
  ASCOLOUR_WORKSHOP_EMAIL,
  ASCOLOUR_WORKSHOP_PHONE,
  FASHIONBIZ_API_TOKEN,
  FASHIONBIZ_BRANCH,
  FASHIONBIZ_BASE_URL,
  FASHIONBIZ_COST_ADJUSTMENT,
  AUSSIE_PACIFIC_API_TOKEN,
  AUSSIE_PACIFIC_BASE_URL,
  AUSSIE_PACIFIC_COST_ADJUSTMENT,
  AUSSIE_PACIFIC_DEFAULT_SHIPPING_METHOD,
  GILDAN_XLSX_PATH,
  GILDAN_COST_ADJUSTMENT,
  GILDAN_IMAGE_SCRAPE_CACHE_DIR,
  WORKER_MODE,
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_PUBLIC_URL,
  MEILISEARCH_HOST,
  MEILISEARCH_ADMIN_KEY
} from 'lib/constants';

/**
 * Meilisearch product document transformer (listing-engine support).
 *
 * The default plugin doc only carries text fields. To let the storefront sort
 * + filter + paginate listings IN Meili (instead of scanning the whole catalog
 * in-memory), we materialise the facets the storefront filters on, plus a
 * sortable price. The plugin re-runs this transformer on every product /
 * variant / price / inventory / category / tag / type event (its built-in
 * subscribers), so these fields stay fresh automatically — no extra job.
 *
 * `min_price_aud` is the cheapest variant's single-unit (qty-1) GUEST price in
 * minor units (cents). This is correct to sort by for every customer because
 * (a) the catalog is AUD-only and (b) customer tiers are a uniform multiplier
 * (platinum 1.10x … member 1.45x) applied identically to every product — a
 * positive constant preserves ordering. Mirrors the tile headline-price rule
 * in src/lib/listing-summary.ts so the sort matches what shoppers see.
 */
const meiliToMinorAud = (amount) => {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const meiliVariantBaseMinor = (variant) => {
  const meta = (variant && variant.metadata) || {};
  // 1) importer-written base (qty 1-9 band), dollars — every supplier importer writes this.
  const bp = meta.bulk_pricing;
  const tier0 = bp && Array.isArray(bp.tiers) ? bp.tiers[0] : null;
  const fromMeta = tier0 ? meiliToMinorAud(tier0.amount) : meiliToMinorAud(meta.base_sale_price);
  if (fromMeta != null) return fromMeta;
  // 2) fall back to raw price rows: rules-free (no price-list/group) AUD, lowest min_quantity.
  const prices = (variant && variant.price_set && variant.price_set.prices) || [];
  let best = null;
  for (const p of prices) {
    if (!p) continue;
    if (String(p.currency_code || '').toLowerCase() !== 'aud') continue;
    if ((p.rules_count ?? 0) !== 0) continue;
    const mq = p.min_quantity == null ? 1 : Number(p.min_quantity);
    const minor = meiliToMinorAud(p.amount);
    if (minor == null) continue;
    if (best == null || mq < best.mq) best = { mq, minor };
  }
  return best ? best.minor : null;
};

const meiliTransformProduct = (product) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];

  let minPrice = null;
  for (const v of variants) {
    const b = meiliVariantBaseMinor(v);
    if (b == null) continue;
    if (minPrice == null || b < minPrice) minPrice = b;
  }

  const inStock = variants.some((v) => {
    if (!v) return false;
    if (v.manage_inventory === false) return true;
    if (v.allow_backorder === true) return true;
    const q = v.inventory_quantity;
    if (q == null) return true; // unknown → don't hide (matches storefront hasStock logic)
    return Number(q) > 0;
  });

  const meta = product.metadata || {};
  // Importers write the composition to the native `material` column, not
  // metadata — keep `product.material` last so a metadata override still wins.
  const fabricRaw =
    meta.fabric_type || meta.fabric || meta.material || meta.composition ||
    product.material || null;
  const fabric = fabricRaw
    ? String(fabricRaw).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
    : [];

  // Raw lowercased material string for full-text search (e.g. "100% cotton jersey").
  // Kept separate from `fabric` (token array used for filtering) so free-text
  // searches like "polyester" or "merino" find products by composition without
  // the false-positives from numeric tokens ("100", "200") in the split array.
  const material_text = fabricRaw ? String(fabricRaw).toLowerCase() : null;

  const doc = {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    thumbnail: product.thumbnail,
    variant_sku: variants.map((v) => v && v.sku).filter(Boolean).join(' '),
    created_at_ts: product.created_at ? new Date(product.created_at).getTime() : 0,
    category_ids: (product.categories || []).map((c) => c && c.id).filter(Boolean),
    collection_id: product.collection_id || null,
    type_id: (product.type && product.type.id) || null,
    tag_ids: (product.tags || []).map((t) => t && t.id).filter(Boolean),
    brand_handle: (product.brand && product.brand.handle) || null,
    brand_name: product.brand && product.brand.name ? String(product.brand.name).toLowerCase() : null,
    fabric,
    material_text,
    in_stock: inStock,
  };
  // Omit when unknown so price-less products sink to the end of a price sort
  // (Meili places docs missing a sortable attribute last).
  if (minPrice != null) doc.min_price_aud = minPrice;
  return doc;
};

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
                  publicUrl: MINIO_PUBLIC_URL,
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
            // workflow-engine-redis@2.14.2 destructures from `options.redis`
            // (see dist/loaders/redis.js:9). event-bus-redis uses flat
            // `options.redisUrl` — the two modules have inconsistent shapes.
            // Commit b8e0b613 unified them to flat, which silently broke this
            // module (destructuring undefined). Keep nested here.
            options: {
              redis: {
                redisUrl: REDIS_URL,
              },
            },
          },
          {
            // Distributed locks backed by Redis so they coordinate across
            // every backend machine (and survive a single-machine restart
            // mid-workflow). Without this, Medusa silently falls back to
            // in-memory locking — fine on one machine, breaks the moment
            // `min_machines_running` goes above 1 or a workflow holds a
            // lock through a Fly suspend/resume.
            key: Modules.LOCKING,
            options: {
              providers: [
                {
                  resolve: '@medusajs/locking-redis',
                  id: 'locking-redis',
                  options: {
                    redisUrl: REDIS_URL,
                  },
                },
              ],
            },
          },
        ]
      : []),

    ...(RESEND_API_KEY && RESEND_FROM_EMAIL
      ? [{
          key: Modules.NOTIFICATION,
          resolve: '@medusajs/notification',
          options: {
            providers: [
              {
                resolve: './src/modules/email-notifications',
                id: 'resend',
                options: {
                  channels: ['email'],
                  api_key: RESEND_API_KEY,
                  from: RESEND_FROM_EMAIL,
                },
              },
            ],
          },
        }]
      : []),

    ...((STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET) || (PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET)
      ? [{
          key: Modules.PAYMENT,
          resolve: '@medusajs/payment',
          options: {
            providers: [
              ...(STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET
                ? [{
                    resolve: '@medusajs/payment-stripe',
                    id: 'stripe',
                    options: {
                      apiKey: STRIPE_API_KEY,
                      webhookSecret: STRIPE_WEBHOOK_SECRET,
                    },
                  }]
                : []),
              ...(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET
                ? [{
                    resolve: '@alphabite/medusa-paypal/providers/paypal',
                    id: 'paypal',
                    options: {
                      clientId: PAYPAL_CLIENT_ID,
                      clientSecret: PAYPAL_CLIENT_SECRET,
                      isSandbox: PAYPAL_IS_SANDBOX,
                      webhookId: PAYPAL_WEBHOOK_ID,
                    },
                  }]
                : []),
            ],
          },
        }]
      : []),

    ...(ASCOLOUR_SUBSCRIPTION_KEY && ASCOLOUR_EMAIL && ASCOLOUR_PASSWORD
      ? [{
          resolve: "./src/modules/ascolour",
          options: {
            subscription_key: ASCOLOUR_SUBSCRIPTION_KEY,
            email: ASCOLOUR_EMAIL,
            password: ASCOLOUR_PASSWORD,
            base_url: ASCOLOUR_BASE_URL,
            default_shipping_method: ASCOLOUR_DEFAULT_SHIPPING_METHOD,
            workshop_address: {
              company: ASCOLOUR_WORKSHOP_COMPANY,
              firstName: ASCOLOUR_WORKSHOP_FIRST_NAME,
              lastName: ASCOLOUR_WORKSHOP_LAST_NAME,
              address1: ASCOLOUR_WORKSHOP_ADDRESS_1,
              address2: ASCOLOUR_WORKSHOP_ADDRESS_2,
              city: ASCOLOUR_WORKSHOP_CITY,
              state: ASCOLOUR_WORKSHOP_STATE,
              zip: ASCOLOUR_WORKSHOP_ZIP,
              countryCode: ASCOLOUR_WORKSHOP_COUNTRY_CODE,
              email: ASCOLOUR_WORKSHOP_EMAIL,
              phone: ASCOLOUR_WORKSHOP_PHONE,
            },
          },
        }]
      : []),

    ...(FASHIONBIZ_API_TOKEN
      ? [{
          resolve: "./src/modules/fashionbiz",
          options: {
            token: FASHIONBIZ_API_TOKEN,
            branch: FASHIONBIZ_BRANCH,
            base_url: FASHIONBIZ_BASE_URL,
            cost_adjustment: FASHIONBIZ_COST_ADJUSTMENT,
          },
        }]
      : []),

    ...(AUSSIE_PACIFIC_API_TOKEN
      ? [{
          resolve: "./src/modules/aussiepacific",
          options: {
            token: AUSSIE_PACIFIC_API_TOKEN,
            base_url: AUSSIE_PACIFIC_BASE_URL,
            cost_adjustment: AUSSIE_PACIFIC_COST_ADJUSTMENT,
            default_shipping_method: AUSSIE_PACIFIC_DEFAULT_SHIPPING_METHOD,
          },
        }]
      : []),

    // Gildan module — registered unconditionally. Unlike FashionBiz/AP it
    // has no API token gate; the spreadsheet is uploaded per-import via the
    // admin UI, and the CLI script honours GILDAN_XLSX_PATH. The module
    // itself is otherwise inert at boot.
    {
      resolve: "./src/modules/gildan",
      options: {
        cost_adjustment: GILDAN_COST_ADJUSTMENT,
        xlsx_path: GILDAN_XLSX_PATH,
        image_scrape_cache_dir: GILDAN_IMAGE_SCRAPE_CACHE_DIR,
      },
    },

    {
      resolve: "./src/modules/designs",
    },

    {
      resolve: "./src/modules/wishlist",
    },

    {
      resolve: "./src/modules/quote",
    },

    {
      resolve: "./src/modules/stripe-payment-link",
    },

    {
      resolve: "./src/modules/production-reject",
    },

    {
      resolve: "./src/modules/print-recipe",
    },

    {
      resolve: "./src/modules/group-order",
    },

    {
      resolve: "./src/modules/lookbook",
    },

    {
      resolve: "./src/modules/organisation",
    },

    {
      resolve: "./src/modules/brand",
    },

    {
      resolve: "./src/modules/bottle-shop",
    },

    {
      resolve: "./src/modules/bundles",
    },

    {
      resolve: "./src/modules/search-log",
    },

    {
      resolve: "./src/modules/report-annotation",
    },

    {
      resolve: "./src/modules/report-alert",
    },

    {
      resolve: "./src/modules/admin-workspace",
    },

    {
      resolve: "./src/modules/automation-rule",
    },

    {
      resolve: "./src/modules/task",
    },

    {
      resolve: "./src/modules/pos-session",
    },

    {
      resolve: "./src/modules/org-inventory",
    },

    {
      resolve: "./src/modules/print-profile",
    },

    {
      key: Modules.FULFILLMENT,
      resolve: "@medusajs/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/fulfillment-manual",
            id: "manual",
          },
          // SC Prints in-house weight-based calculated rate (provider_id
          // `scp_scp`). Self-contained — no external API — so it's registered
          // unconditionally. Powers the single "Standard Shipping (AU)" option
          // whose price scales with cart weight. See src/lib/shipping-rate.ts.
          {
            resolve: "./src/modules/scp-shipping",
            id: "scp",
          },
          ...(SHIPSTATION_API_KEY
            ? [{
                resolve: "./src/modules/shipstation",
                id: "shipstation",
                options: {
                  api_key: SHIPSTATION_API_KEY,
                },
              }]
            : []),
          // AusPost (v1, HTTP Basic Auth) gated on the full credential triple
          // — key + password + account number. A partial config would fail at
          // first quote, so require all three so the error surfaces at boot,
          // not during checkout.
          ...(AUSPOST_API_KEY &&
          AUSPOST_API_PASSWORD &&
          AUSPOST_ACCOUNT_NUMBER
            ? [{
                resolve: "./src/modules/auspost",
                id: "auspost",
                options: {
                  api_key: AUSPOST_API_KEY,
                  api_password: AUSPOST_API_PASSWORD,
                  account_number: AUSPOST_ACCOUNT_NUMBER,
                  test_mode: AUSPOST_TEST_MODE,
                  parcel_product_id: AUSPOST_DEFAULT_SERVICE_PARCEL_PRODUCT_ID,
                  express_product_id: AUSPOST_DEFAULT_SERVICE_EXPRESS_PRODUCT_ID,
                  label_format: AUSPOST_LABEL_FORMAT,
                  label_layout: AUSPOST_LABEL_LAYOUT,
                },
              }]
            : []),
        ],
      },
    },
  ],

  plugins: [
    ...(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET
      ? [{
          resolve: '@alphabite/medusa-paypal',
          options: {
            clientId: PAYPAL_CLIENT_ID,
            clientSecret: PAYPAL_CLIENT_SECRET,
            isSandbox: PAYPAL_IS_SANDBOX,
            webhookId: PAYPAL_WEBHOOK_ID,
          },
        }]
      : []),
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
                // Relations the transformer aggregates into flat indexed fields.
                // Each path costs a JOIN at index time only (not per storefront
                // request), so listing reads stay cheap.
                fields: [
                  'id', 'title', 'description', 'handle', 'thumbnail', 'created_at',
                  'collection_id', 'material',
                  'categories.id',
                  'type.id', 'type.value',
                  'tags.id', 'tags.value',
                  'brand.handle', 'brand.name',
                  'variants.id', 'variants.sku', 'variants.metadata',
                  'variants.inventory_quantity', 'variants.manage_inventory', 'variants.allow_backorder',
                  'variants.price_set.prices.amount',
                  'variants.price_set.prices.currency_code',
                  'variants.price_set.prices.min_quantity',
                  'variants.price_set.prices.rules_count',
                ],
                transformer: (product) => meiliTransformProduct(product),
                indexSettings: {
                  searchableAttributes: ['title', 'description', 'variant_sku', 'material_text'],
                  displayedAttributes: ['id', 'handle', 'title', 'description', 'variant_sku', 'thumbnail'],
                  // Drive storefront listing facets in Meili instead of the in-memory catalog scan.
                  filterableAttributes: [
                    'id', 'handle', 'category_ids', 'collection_id', 'type_id',
                    'tag_ids', 'brand_handle', 'brand_name', 'fabric', 'in_stock', 'min_price_aud',
                  ],
                  sortableAttributes: ['min_price_aud', 'created_at_ts', 'title'],
                },
                primaryKey: 'id',
              },
            },
          },
        }]
      : []),
    // @agilo/medusa-analytics-plugin removed in favour of the in-house
    // /app/reports + /app/production pages, which provide the same
    // headline KPIs (total orders, total sales, orders/sales over time,
    // top regions, order status breakdown) plus SC-Prints-specific
    // signals the Agilo plugin couldn't surface (production funnel,
    // decoration mix, customizer adoption, AS Colour throughput, etc.).
    // To roll back: re-add `{ resolve: '@agilo/medusa-analytics-plugin', options: {} }`
    // here and `pnpm add @agilo/medusa-analytics-plugin`.
  ],
};

export default defineConfig(medusaConfig);