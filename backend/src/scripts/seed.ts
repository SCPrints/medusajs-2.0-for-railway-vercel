import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  loadEnv,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

function seedPaymentProviders(): string[] {
  const hasStripe =
    Boolean(process.env.STRIPE_API_KEY?.trim()) &&
    Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  if (hasStripe) {
    return ["pp_system_default", "pp_stripe_stripe"];
  }
  return ["pp_system_default"];
}
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    // create the default sales channel
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        {
          currency_code: "aud",
          is_default: true,
        },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  logger.info("Seeding region data...");
  const { result: regionResult } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Australia",
          currency_code: "aud",
          countries: ["au"],
          payment_providers: seedPaymentProviders(),
        },
      ],
    },
  });
  const auRegion = regionResult[0];
  logger.info("Finished seeding regions.");

  logger.info("Seeding tax regions...");
  await createTaxRegionsWorkflow(container).run({
    input: [
      {
        country_code: "au",
        provider_id: "tp_system",
      },
    ],
  });
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "Australian Warehouse",
          address: {
            city: "Sydney",
            country_code: "AU",
            address_1: "",
          },
        },
      ],
    },
  });
  const stockLocation = stockLocationResult[0];

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_location_id: stockLocation.id,
      },
    },
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_provider_id: "manual_manual",
    },
  });

  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "Default Shipping Profile",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = shippingProfileResult[0];
  }

  const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
    name: "Australian Warehouse delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Australia",
        geo_zones: [
          {
            country_code: "au",
            type: "country",
          },
        ],
      },
    ],
  });

  await link.create({
    [Modules.STOCK_LOCATION]: {
      stock_location_id: stockLocation.id,
    },
    [Modules.FULFILLMENT]: {
      fulfillment_set_id: fulfillmentSet.id,
    },
  });

  const australiaServiceZone = fulfillmentSet.service_zones.find(
    (z) => z.name === "Australia"
  )!;

  // Two-tier shipping for the AU region:
  //   - Manual flat $10 / $15 AUD options (used when cart ≤ ~3kg)
  //   - ShipStation calculated options (used when cart > ~3kg)
  // The custom /store/cart-shipping-options route filters between the two
  // tiers based on total cart weight + packaging overhead.
  const auShippingOptions: any[] = [
    {
      name: "Standard Shipping (AU)",
      price_type: "flat",
      provider_id: "manual_manual",
      service_zone_id: australiaServiceZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Standard",
        description: "Flat-rate Australia Post (≤ 3kg).",
        code: "standard_au",
      },
      prices: [
        {
          currency_code: "aud",
          amount: 10,
        },
        {
          region_id: auRegion.id,
          amount: 10,
        },
      ],
      rules: [
        {
          attribute: "enabled_in_store",
          value: "true",
          operator: "eq",
        },
        {
          attribute: "is_return",
          value: "false",
          operator: "eq",
        },
      ],
    },
    {
      name: "Express Shipping (AU)",
      price_type: "flat",
      provider_id: "manual_manual",
      service_zone_id: australiaServiceZone.id,
      shipping_profile_id: shippingProfile.id,
      type: {
        label: "Express",
        description: "Flat-rate Australia Post Express (≤ 3kg).",
        code: "express_au",
      },
      prices: [
        {
          currency_code: "aud",
          amount: 15,
        },
        {
          region_id: auRegion.id,
          amount: 15,
        },
      ],
      rules: [
        {
          attribute: "enabled_in_store",
          value: "true",
          operator: "eq",
        },
        {
          attribute: "is_return",
          value: "false",
          operator: "eq",
        },
      ],
    },
  ];

  // Only seed the calculated tier if the ShipStation provider is configured;
  // otherwise the option would 500 on every checkout when an admin tries to
  // resolve a rate. Admin can still create these options manually later.
  const fulfillmentProviders =
    await fulfillmentModuleService.listFulfillmentProviders({
      id: "shipstation_shipstation",
    });
  const hasShipStation = fulfillmentProviders.length > 0;

  if (hasShipStation) {
    auShippingOptions.push(
      {
        name: "Standard Live Quote (AU)",
        price_type: "calculated",
        provider_id: "shipstation_shipstation",
        service_zone_id: australiaServiceZone.id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Live freight quote via ShipStation (>3kg).",
          code: "standard_live_au",
        },
        // Carrier IDs vary per ShipStation account — leave blank so admins
        // wire them up via the Admin once the carriers are imported.
        data: {
          carrier_id: "",
          carrier_service_code: "",
        },
        prices: [],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      {
        name: "Express Live Quote (AU)",
        price_type: "calculated",
        provider_id: "shipstation_shipstation",
        service_zone_id: australiaServiceZone.id,
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Live express freight quote via ShipStation (>3kg).",
          code: "express_live_au",
        },
        data: {
          carrier_id: "",
          carrier_service_code: "",
        },
        prices: [],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      }
    );
  } else {
    logger.info(
      "ShipStation provider not registered (SHIPSTATION_API_KEY unset) — skipping calculated shipping options. Set SHIPSTATION_API_KEY and re-seed (or create the options via Admin) to enable live quotes."
    );
  }

  await createShippingOptionsWorkflow(container).run({
    input: auShippingOptions,
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  const { result: publishableApiKeyResult } = await createApiKeysWorkflow(
    container
  ).run({
    input: {
      api_keys: [
        {
          title: "Webshop",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  const publishableApiKey = publishableApiKeyResult[0];

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container
  ).run({
    input: {
      product_categories: [
        {
          name: "Shirts",
          is_active: true,
        },
        {
          name: "Sweatshirts",
          is_active: true,
        },
        {
          name: "Pants",
          is_active: true,
        },
        {
          name: "Merch",
          is_active: true,
        },
        {
          name: "DTF & Transfers",
          is_active: true,
        },
      ],
    },
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Medusa T-Shirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Shirts")!.id,
          ],
          description:
            "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
          handle: "t-shirt",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-back.png",
            },
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
            },
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["Black", "White"],
            },
          ],
          variants: [
            {
              title: "S / Black",
              sku: "SHIRT-S-BLACK",
              weight: 170,
              options: {
                Size: "S",
                Color: "Black",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "S / White",
              sku: "SHIRT-S-WHITE",
              weight: 170,
              options: {
                Size: "S",
                Color: "White",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "M / Black",
              sku: "SHIRT-M-BLACK",
              weight: 185,
              options: {
                Size: "M",
                Color: "Black",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "M / White",
              sku: "SHIRT-M-WHITE",
              weight: 185,
              options: {
                Size: "M",
                Color: "White",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "L / Black",
              sku: "SHIRT-L-BLACK",
              weight: 200,
              options: {
                Size: "L",
                Color: "Black",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "L / White",
              sku: "SHIRT-L-WHITE",
              weight: 200,
              options: {
                Size: "L",
                Color: "White",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "XL / Black",
              sku: "SHIRT-XL-BLACK",
              weight: 220,
              options: {
                Size: "XL",
                Color: "Black",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "XL / White",
              sku: "SHIRT-XL-WHITE",
              weight: 220,
              options: {
                Size: "XL",
                Color: "White",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Medusa Sweatshirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Sweatshirts")!.id,
          ],
          description:
            "Reimagine the feeling of a classic sweatshirt. With our cotton sweatshirt, everyday essentials no longer have to be ordinary.",
          handle: "sweatshirt",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
            },
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SWEATSHIRT-S",
              weight: 500,
              options: {
                Size: "S",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "M",
              sku: "SWEATSHIRT-M",
              weight: 540,
              options: {
                Size: "M",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "L",
              sku: "SWEATSHIRT-L",
              weight: 590,
              options: {
                Size: "L",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "XL",
              sku: "SWEATSHIRT-XL",
              weight: 640,
              options: {
                Size: "XL",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Medusa Sweatpants",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Pants")!.id,
          ],
          description:
            "Reimagine the feeling of classic sweatpants. With our cotton sweatpants, everyday essentials no longer have to be ordinary.",
          handle: "sweatpants",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png",
            },
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SWEATPANTS-S",
              weight: 400,
              options: {
                Size: "S",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "M",
              sku: "SWEATPANTS-M",
              weight: 440,
              options: {
                Size: "M",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "L",
              sku: "SWEATPANTS-L",
              weight: 480,
              options: {
                Size: "L",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "XL",
              sku: "SWEATPANTS-XL",
              weight: 520,
              options: {
                Size: "XL",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "Medusa Shorts",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Merch")!.id,
          ],
          description:
            "Reimagine the feeling of classic shorts. With our cotton shorts, everyday essentials no longer have to be ordinary.",
          handle: "shorts",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
            },
            {
              url: "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SHORTS-S",
              weight: 200,
              options: {
                Size: "S",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "M",
              sku: "SHORTS-M",
              weight: 220,
              options: {
                Size: "M",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "L",
              sku: "SHORTS-L",
              weight: 240,
              options: {
                Size: "L",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
            {
              title: "XL",
              sku: "SHORTS-XL",
              weight: 260,
              options: {
                Size: "XL",
              },
              prices: [
                {
                  amount: 15,
                  currency_code: "aud",
                },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
        {
          title: "DTF Auto Builder (Easy)",
          category_ids: [
            categoryResult.find((cat) => cat.name === "DTF & Transfers")!.id,
          ],
          description: `<p><strong>Quality DTF transfers at straightforward pricing.</strong> Upload your artwork, pick your gang sheet size, and we&apos;ll lay out a print-ready roll for you.</p>
<ul>
<li>Fed up with spending hours on gang sheets? The Auto Builder lets you upload images and specify dimensions and quantities so your layout is built for production.</li>
<li>Use high-resolution <strong>300 dpi PNG</strong> files with a transparent background for best results. Images that are not 300 dpi may be resized automatically.</li>
<li>DTF does not reproduce semi-transparency or hairline details well—avoid soft fades and keep lines and small text above roughly <strong>0.5 mm</strong>.</li>
<li>A proper heat press with even pressure is required for durable results. Home irons and light craft presses often do not provide enough pressure.</li>
</ul>
<p>Need a hand? <strong>Contact us</strong> and we can help you place a manual order—we&apos;ll build the gang sheet with you.</p>`,
          handle: "dtf-auto-builder",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url: "https://images.unsplash.com/photo-1586790170088-4138406c8b99?auto=format&w=1200&q=80",
            },
          ],
          options: [
            {
              title: "Gang sheet size",
              values: [
                "58cm × 100cm",
                "58cm × 200cm",
                "58cm × 300cm",
                "58cm × 400cm",
                "58cm × 500cm",
              ],
            },
          ],
          variants: [
            {
              title: "58cm × 100cm",
              sku: "DTF-AUTO-58x100",
              weight: 200,
              options: {
                "Gang sheet size": "58cm × 100cm",
              },
              prices: [
                { amount: 24, currency_code: "aud" },
              ],
            },
            {
              title: "58cm × 200cm",
              sku: "DTF-AUTO-58x200",
              weight: 380,
              options: {
                "Gang sheet size": "58cm × 200cm",
              },
              prices: [
                { amount: 48, currency_code: "aud" },
              ],
            },
            {
              title: "58cm × 300cm",
              sku: "DTF-AUTO-58x300",
              weight: 560,
              options: {
                "Gang sheet size": "58cm × 300cm",
              },
              prices: [
                { amount: 72, currency_code: "aud" },
              ],
            },
            {
              title: "58cm × 400cm",
              sku: "DTF-AUTO-58x400",
              weight: 740,
              options: {
                "Gang sheet size": "58cm × 400cm",
              },
              prices: [
                { amount: 96, currency_code: "aud" },
              ],
            },
            {
              title: "58cm × 500cm",
              sku: "DTF-AUTO-58x500",
              weight: 920,
              options: {
                "Gang sheet size": "58cm × 500cm",
              },
              prices: [
                { amount: 120, currency_code: "aud" },
              ],
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel[0].id,
            },
          ],
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 1000000,
      inventory_item_id: inventoryItem.id,
    };
    inventoryLevels.push(inventoryLevel);
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels,
    },
  });

  logger.info("Finished seeding inventory levels data.");
}