# Custom API Routes

An API Route is a REST API endpoint.

An API Route is created in a TypeScript or JavaScript file under the `/src/api` directory of your Medusa application. The file’s name must be `route.ts` or `route.js`.

For example, to create a `GET` API Route at `/store/hello-world`, create the file `src/api/store/hello-world/route.ts` with the following content:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({
    message: "Hello world!",
  });
}
```

## Supported HTTP methods

The file based routing supports the following HTTP methods:

- GET
- POST
- PUT
- PATCH
- DELETE
- OPTIONS
- HEAD

You can define a handler for each of these methods by exporting a function with the name of the method in the paths `route.ts` file.

For example:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/medusa";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Handle GET requests
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Handle POST requests
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  // Handle PUT requests
}
```

## Parameters

To create an API route that accepts a path parameter, create a directory within the route's path whose name is of the format `[param]`.

For example, if you want to define a route that takes a `productId` parameter, you can do so by creating a file called `/api/products/[productId]/route.ts`:

```ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/medusa"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params;

  res.json({
    message: `You're looking for product ${productId}`
  })
}
```

To create an API route that accepts multiple path parameters, create within the file's path multiple directories whose names are of the format `[param]`.

For example, if you want to define a route that takes both a `productId` and a `variantId` parameter, you can do so by creating a file called `/api/products/[productId]/variants/[variantId]/route.ts`.

## Using the container

The Medusa container is available on `req.scope`. Use it to access modules' main services and other registered resources:

```ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/medusa"
import { IProductModuleService } from "@medusajs/types"
import { ModuleRegistrationName } from "@medusajs/utils"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const productModuleService: IProductModuleService =
    req.scope.resolve(ModuleRegistrationName.PRODUCT)

  const [, count] = await productModuleService.listAndCount()

  res.json({
    count,
  })
}
```

## Middleware

You can apply middleware to your routes by creating a file called `/api/middlewares.ts`. This file must export a configuration object with what middleware you want to apply to which routes.

For example, if you want to apply a custom middleware function to the `/store/custom` route, you can do so by adding the following to your `/api/middlewares.ts` file:

```ts
import type {
  MiddlewaresConfig,
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/medusa";

async function logger(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  console.log("Request received");
  next();
}

export const config: MiddlewaresConfig = {
  routes: [
    {
      matcher: "/store/custom",
      middlewares: [logger],
    },
  ],
};
```

The `matcher` property can be either a string or a regular expression. The `middlewares` property accepts an array of middleware functions.

## Shipping

Checkout offers one shipping option, **Standard Shipping (AU)**, priced by the
cart's total weight through the in-house `scp_scp` fulfillment provider
(`src/modules/scp-shipping`). The bands live in `src/lib/shipping-rate.ts`:
outbound postage by weight plus a once-per-order inbound freight-in
(`FREIGHT_IN_PER_ORDER_AUD`). No external carrier is called at checkout.

### Env vars

| Var | Default | Purpose |
| --- | --- | --- |
| `SHIPPING_PACKAGING_OVERHEAD_GRAMS` | `150` | Added to `Σ(item.weight × quantity)` before the band lookup. |
| `SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS` | `300` | Per-unit weight for items with no real weight, so the band still scales with quantity. |

### Storefront shipping endpoint

`GET /store/cart-shipping-options?cart_id=<id>`

1. Resolves the cart and computes the total gram weight (see `src/lib/cart-weight.ts`).
2. Stamps the weight breakdown + quoted amount onto `cart.metadata.shipping_decision`
   so it rides into the order for the admin "Shipping decision" widget.
3. Runs `listShippingOptionsForCartWithPricingWorkflow` (the `WithPricing`
   variant is required — the option is `price_type: "calculated"`) and narrows
   the result to `scp_*` options, falling back to the unfiltered list so
   checkout never dead-ends.

### Tracking + the shipped email

`fulfillment.metadata.parcels` (one entry per label: `tracking_number`,
`tracking_url`, `carrier_code`, `service_code`, `label_url`, `weight_grams`,
`shipped_at`, `voided_at`) is written by the AusPost tracking job
(`src/jobs/sync-auspost-tracking.ts`). The `order-shipment-created` subscriber
and the storefront `TrackingList` read it and fall back to native
`fulfillment.labels[]`. The AusPost parcels widget on the admin order page
renders the same data; it is view-only.
