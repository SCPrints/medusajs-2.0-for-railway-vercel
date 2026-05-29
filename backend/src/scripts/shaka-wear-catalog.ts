/**
 * Shaka Wear catalog — resolved data for the one-off seed importer.
 *
 * SOURCE OF TRUTH:
 *   - Sizes + ex-GST costs: Prime Example "Printer Partner" wholesale price
 *     list, January 2026 (the AU distributor SC Prints buys from).
 *   - AU-stocked colour names: Prime Example 2026 Shaka Wear catalogue.
 *   - Images + marketing descriptions: scraped from the Shaka Wear US site
 *     (shakawear.com, Shopify) JSON-LD ProductGroup blocks, matched to the
 *     AU colour names. Hotlinked Shopify CDN URLs (same pattern as the
 *     Gildan BigCommerce image hotlinks).
 *
 * Costs are ex-GST (the price list states "Price Ex GST"), so they feed the
 * shared buildPriceLadder() directly with cost-adjustment 1.0. Per-SIZE cost
 * because 10M-001 (3XL) and 10M-005 (2XL) are priced higher than their base
 * sizes — each variant gets its own ladder (the AS Colour within-style
 * cost-variation pattern).
 *
 * Regenerate with /tmp/gen_catalog.py (kept in the PR description) if the
 * price list or stocked colours change.
 */

export type ShakaSize = { code: string; cost: number }
export type ShakaColour = { name: string; us_match: string | null; images: string[] }
export type ShakaStyle = {
  code: string
  handle: string
  title: string
  us_url: string | null
  description: string
  fit: string
  sizes: ShakaSize[]
  colours: ShakaColour[]
  tags: string[]
}

export const SHAKA_WEAR_CATALOG: ShakaStyle[] = [
  {
    "code": "10M-001",
    "handle": "shaka-wear-max-heavyweight-tee",
    "title": "Shaka Wear 7.5oz Max Heavyweight Tee",
    "us_url": "https://www.shakawear.com/products/7-5-oz-max-heavyweight-short-sleeve",
    "description": "Bringing you the most versatile heavyweight shirt in the game. Our Max Heavyweight t-shirt is a classic boxy fit popularized in the 90s streetwear scene. This timeless t-shirt is still an authentic statement piece for any occasion. Premium Comfort - Our slightly oversized, heavyweight feel ensures unparalleled comfort and a thick protective layer for all climates.",
    "fit": "Standard",
    "sizes": [
      {
        "code": "S",
        "cost": 11.5
      },
      {
        "code": "M",
        "cost": 11.5
      },
      {
        "code": "L",
        "cost": 11.5
      },
      {
        "code": "XL",
        "cost": 11.5
      },
      {
        "code": "2XL",
        "cost": 11.5
      },
      {
        "code": "3XL",
        "cost": 14.5
      }
    ],
    "colours": [
      {
        "name": "Black",
        "us_match": "Black",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_black_002_635eb252-9595-43b7-9e1f-6970ecd24860.jpg?v=1771878446",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshort_black_003_63537f41-299c-4997-bbd3-1fee1e716974.jpg?v=1771878447",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_black_004_22aa3db0-498c-49ca-ac88-0aa3835ebb89.jpg?v=1771878447",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_black_005_ad119d53-19a2-42de-9ad8-1876426738b0.jpg?v=1771878447"
        ]
      },
      {
        "name": "White",
        "us_match": "White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_white_002_6acda67b-f446-4858-8fe6-b0aa20cd70ff.jpg?v=1771878446",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshort_white_003_fd4ae991-e5ad-4a0f-b0a5-1e5ff83ad1f3.jpg?v=1771878447",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_white_004_d1955eeb-595a-48dd-890f-72338ec8610d.jpg?v=1771878447",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_white_005_63095df0-68d7-42c4-9365-e6fa860ab8ae.jpg?v=1771878447"
        ]
      },
      {
        "name": "Dark Grey",
        "us_match": "Dark Grey",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_DarkGrey_002_783243df-4eda-43ca-88a0-84d96cb708b4.jpg?v=1771878447",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_darkgrey_003_5c25b0e4-b1c3-452a-ace2-088b3f4e6971.jpg?v=1771878447",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_darkgrey_004_7ac4f83b-1fb7-4cdf-bebe-9857db59ebde.jpg?v=1771878447",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7.5maxheavyweightshortsleeve_darkgery_005_3aa34ac8-3e71-4f88-82ff-722c902552b1.jpg?v=1771878447"
        ]
      }
    ],
    "tags": [
      "Unisex",
      "Short Sleeve"
    ]
  },
  {
    "code": "10M-002",
    "handle": "shaka-wear-max-heavyweight-garment-dye-tee",
    "title": "Shaka Wear 7.5oz Max Heavyweight Garment Dye Tee",
    "us_url": "https://www.shakawear.com/products/7-5oz-max-heavyweight-garment-dye",
    "description": "Bringing you the heaviest garment dye in the industry. These Shrink-free washed out Max Heavyweight Tees are Pigment / Reactive-washed for a vintage look. Oversized fit and densely knit for clean printing. Perfect for any occasion.",
    "fit": "Oversized",
    "sizes": [
      {
        "code": "S",
        "cost": 16.05
      },
      {
        "code": "M",
        "cost": 16.05
      },
      {
        "code": "L",
        "cost": 16.05
      },
      {
        "code": "XL",
        "cost": 16.05
      },
      {
        "code": "2XL",
        "cost": 16.05
      }
    ],
    "colours": [
      {
        "name": "Black",
        "us_match": "Black",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Black_002_b489306e-35c6-4072-9e58-edc758729ed1.jpg?v=1771879438",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Black_003_fd005540-0367-4ea9-9d07-eb5cbe731a51.jpg?v=1771879438",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Black_004_35b86366-89df-41fc-8603-bd3b5ba90c7c.jpg?v=1771879439"
        ]
      },
      {
        "name": "Shadow",
        "us_match": "Shadow",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Shadow_002_60d08589-3998-4064-8efe-4de8267c71c9.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Shadow_003_ee89a7c9-8b50-422a-a41e-1dacb96a8974.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Shadow_004_44506ce4-278e-4451-aace-43f94a03fbbc.jpg?v=1771879439"
        ]
      },
      {
        "name": "Cream",
        "us_match": "Cream",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Cream_002_86dd7c52-95dc-4c3e-aed1-fae495b96eee.jpg?v=1771879438",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Cream_004_07186583-87bc-4170-a013-00bd30e97a61.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_cream_003_9a0c22b1-a034-48ae-9815-9cfcd6b05766.jpg?v=1771879438"
        ]
      },
      {
        "name": "White",
        "us_match": "White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_White_002_568ebc60-825e-43e1-9498-1e2b3d9ca77c.jpg?v=1771879438",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_white_003_538fb76b-51db-4d54-9db2-c0fe2c8b63e7.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_White_004_af6145a1-7621-424d-aaa3-3965b7d02eee.jpg?v=1771879438"
        ]
      },
      {
        "name": "Cement",
        "us_match": "Cement",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Cement_002_039b9cce-12bf-4f42-b9a0-0efaf277efc5.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Cement_003_f51a77ce-82a6-4093-9b09-c61f392ef69d.jpg?v=1771879440",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Cement_004_01f27652-9f6a-477d-bfd1-ca0b4ad55204.jpg?v=1771879439"
        ]
      },
      {
        "name": "Denim",
        "us_match": "Washed Denim",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_WashedDenim_002_8dc143a5-0b1f-4b75-b3fd-35368262217c.jpg?v=1771879438",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_WashedDenim_003_bbbfef08-0ba1-4bf4-98b4-aea62f3449f1.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_WashedDenim_004_8898003e-058d-436d-b9bb-a93ed5a99006.jpg?v=1771879439"
        ]
      },
      {
        "name": "Moss",
        "us_match": "Moss",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Moss_002_f2dd34ad-0d95-4ef9-a20a-46e2d47ac1b1.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Moss_003_4acf3fae-f5c4-401f-b2d3-b2df2f11c462.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Moss_004_cb88b5ae-3f48-4132-8dc8-849878710af6.jpg?v=1771879439"
        ]
      },
      {
        "name": "Mustard",
        "us_match": "Mustard",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Mustard_002_3a0f4fa5-830b-47e6-8c72-e8afaa6616d0.jpg?v=1771879438",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Mustard_003_2382c0a7-eec4-4a92-ae56-e8f7eef67fda.jpg?v=1771879439",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_Mustard_004_122d4075-22b9-45a1-921b-5bd9378fb0cd.jpg?v=1771879438"
        ]
      }
    ],
    "tags": [
      "Unisex",
      "Short Sleeve",
      "Oversized"
    ]
  },
  {
    "code": "10M-003",
    "handle": "shaka-wear-garment-dye-drop-shoulder-tee",
    "title": "Shaka Wear 7.5oz Max Heavyweight Garment Dye Drop Shoulder Tee",
    "us_url": "https://www.shakawear.com/products/7-5oz-max-heavyweight-garment-dye-drop-shoulder",
    "description": "Bringing you the most uniquely-cut blank in the game, crafted with lycra mock ribbing and treated with a shrink-free wash. This streetwear essential provides the timeless, oversized, boxy fit of a drop-shoulder t-shirt while remaining true to the classic comfort and vintage aesthetic of a heavyweight garment dye tee.",
    "fit": "Oversized / Drop Shoulder",
    "sizes": [
      {
        "code": "S",
        "cost": 18.9
      },
      {
        "code": "M",
        "cost": 18.9
      },
      {
        "code": "L",
        "cost": 18.9
      },
      {
        "code": "XL",
        "cost": 18.9
      },
      {
        "code": "2XL",
        "cost": 18.9
      }
    ],
    "colours": [
      {
        "name": "Black",
        "us_match": "Black",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_black_001.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_black_004.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_black_003.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_black_002.jpg?v=1761247543"
        ]
      },
      {
        "name": "Shadow",
        "us_match": "Shadow",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_grey_001.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_grey_004.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_grey_003.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_grey_002.jpg?v=1761247543"
        ]
      },
      {
        "name": "White",
        "us_match": "White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_white_001.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_white_004.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_white_003.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_white_002.jpg?v=1761247543"
        ]
      },
      {
        "name": "Cream",
        "us_match": "Cream",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_cream_001.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_cream_004.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_cream_003.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_cream_002.jpg?v=1761247543"
        ]
      },
      {
        "name": "Oatmeal",
        "us_match": "Oatmeal",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_tan_001.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_tan_004.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_tan_003.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_tan_002.jpg?v=1761247543"
        ]
      },
      {
        "name": "Mocha",
        "us_match": "Mocha",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_brown_001.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_brown_003.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_brown_004.jpg?v=1761247543",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_MaxHeavyweight_GarmentDye_dropshoulder_brown_002.jpg?v=1761247543"
        ]
      }
    ],
    "tags": [
      "Unisex",
      "Short Sleeve",
      "Oversized"
    ]
  },
  {
    "code": "10M-005",
    "handle": "shaka-wear-max-heavyweight-oversized-tee",
    "title": "Shaka Wear 7.5oz Max Heavyweight Oversized Tee",
    "us_url": "https://www.shakawear.com/products/7-5oz-max-heavyweight-oversized-tee",
    "description": "With its oversized fit, this tee offers a relaxed and laid-back vibe, making it an essential piece for any wardrobe. The 7.5 oz fabric ensures a substantial feel without compromising on breathability, making it ideal for layering or wearing on its own. Whether you're hitting the streets, chilling with friends, or making a bold fashion statement, the Shaka Wear Oversized T-Shirt has got you covered.",
    "fit": "Oversized",
    "sizes": [
      {
        "code": "S",
        "cost": 13.95
      },
      {
        "code": "M",
        "cost": 13.95
      },
      {
        "code": "L",
        "cost": 13.95
      },
      {
        "code": "XL",
        "cost": 13.95
      },
      {
        "code": "2XL",
        "cost": 14.95
      }
    ],
    "colours": [
      {
        "name": "Black",
        "us_match": "Black",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Black_002_07b66047-de85-4632-b7c7-33b358bfc023.jpg?v=1769102496",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Black_003_e43c1120-8bc1-485c-b8b0-cd3abe0df4fd.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Black_004_14c026bb-9250-4d04-855f-ae8d06a2e054.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Black_005_6743094c-f883-4c22-b6f5-6454ccec3435.jpg?v=1769108739"
        ]
      },
      {
        "name": "White",
        "us_match": "White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_White_002_66dec86d-5ab6-457d-9b99-400bd5a9a7ee.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_White_003_2936e242-16d6-479a-a95b-19a1e539e3ce.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_White_005_963af938-86e9-4107-9efd-a9b52f38847e.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_White_004_b9fad560-7bfd-4616-89fb-f03e7911759b.jpg?v=1769108739"
        ]
      },
      {
        "name": "Off-White",
        "us_match": "Off White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffWhite_002_630c969f-935d-4cd0-b212-c7e4bd02c4dd.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffWhite_003_3552c3d0-fda4-4194-9d61-08578c790e6a.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffWhite_004_0bf013ce-9a33-4574-82b5-9f74d7e349bd.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffWhite_005_d5a19377-f272-4a43-9273-77cd77f1330f.jpg?v=1769108739"
        ]
      },
      {
        "name": "Slate Blue",
        "us_match": "Slate Blue",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_SlateBlue_002_75d7df1d-eb7f-4f7e-b7d7-05214477d1df.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_SlateBlue_003_e750e6ae-d280-4107-b085-ebcd074f66bf.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_SlateBlue_004_37b2507f-3cc0-4488-acbb-6102e27896be.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_SlateBlue_005_9a056a21-5107-4166-b0c6-77cd6d99a45f.jpg?v=1769108739"
        ]
      },
      {
        "name": "Off Black",
        "us_match": "Off Black",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffBlack_002_70177395-d573-49dc-8ef5-c430870365ff.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffBlack_003_0215bf8d-6398-4e4d-8bce-49bfa1cd3ae6.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffBlack_004_8b6bc43b-20a6-4229-9241-80f2c3dc5443.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_OffBlack_005_55ffd581-9ab8-4527-9348-d7175c5407f5.jpg?v=1769108739"
        ]
      },
      {
        "name": "Latte",
        "us_match": "Latte",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Latte_002_b98b76b4-3ea4-4229-bc01-62e82bdf4831.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Latte_003_7e3d2a59-5b4b-4b18-a2dc-c55cd6e5fe74.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Latte_004_9ade7a92-0e46-4017-b836-080ea453eba2.jpg?v=1769108739",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/OversizedTee_Latte_005_975660f4-51c9-4606-9708-10c40688a474.jpg?v=1769108739"
        ]
      }
    ],
    "tags": [
      "Unisex",
      "Short Sleeve",
      "Oversized"
    ]
  },
  {
    "code": "10M-006",
    "handle": "shaka-wear-max-heavyweight-cropped-tee",
    "title": "Shaka Wear 7.5oz Max Heavyweight Cropped Tee",
    "us_url": "https://www.shakawear.com/products/max-heavyweight-cropped-tee",
    "description": "Ya\u2019ll been asking, so we answered. We took our legendary, classic Shaka Wear Max Heavyweight and brought the length to waist level. Still armed with everything that Shaka Wear is known for: the durability, heavyweight USA cotton, lycra collar remains unchanged. The feeling of unparalleled reliability and comfort are still true. Taking a classic and putting that edge to it, sheesh. They say you cant reinvent the wheel, but we came pretty damn close.",
    "fit": "Cropped",
    "sizes": [
      {
        "code": "S",
        "cost": 11.5
      },
      {
        "code": "M",
        "cost": 11.5
      },
      {
        "code": "L",
        "cost": 11.5
      },
      {
        "code": "XL",
        "cost": 11.5
      },
      {
        "code": "2XL",
        "cost": 11.5
      }
    ],
    "colours": [
      {
        "name": "Black",
        "us_match": "Black",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_black_front_view001_186c2e74-9bcc-4507-ab47-3bea66696d47.jpg?v=1774910080",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_black_back_view002_06dfc1c6-628e-4fe5-b118-0365dc5b2687.jpg?v=1774910080",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_black_side_view003_a357c2e4-5a7c-46e9-a95c-a707ad866c4a.jpg?v=1774910080",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_black_threequarter_view004_e5f63a97-2203-42ac-ba97-1dbdee74e2ee.jpg?v=1774910080"
        ]
      },
      {
        "name": "White",
        "us_match": "White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_white_front_view001_6313a47a-cfc5-4066-9282-e2489147a546.jpg?v=1774910080",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_white_back_view002_c6dbf2ea-5370-4dea-8df1-45bec11c2eac.jpg?v=1774909670",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_white_side_view003_6bc037b9-d6a5-4bd0-8350-d4f4f052e285.jpg?v=1774909670",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_white_threequarter_view004_1c34fb0d-809f-4c6c-9e59-b445731f7cb1.jpg?v=1774909669"
        ]
      },
      {
        "name": "Off-White",
        "us_match": "Off White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_offwhite_front_view001_87d49f3f-9da6-402b-931f-4afc45d43d4b.jpg?v=1774910080",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_offwhite_back_view002_903ac790-a9e6-441c-8adc-7a92d472c45b.jpg?v=1774910080",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_offwhite_side_view003_6b191088-6eb3-4541-abac-2208abbf9a0e.jpg?v=1774910080",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/7_5_max_heavyweight_cropped_tee_offwhite_threequarter_view004_e5979915-ec4c-4aec-ab01-a0f6bcb8b670.jpg?v=1774910080"
        ]
      }
    ],
    "tags": [
      "Unisex",
      "Short Sleeve"
    ]
  },
  {
    "code": "10M-104",
    "handle": "shaka-wear-max-heavyweight-long-sleeve-tee",
    "title": "Shaka Wear 7.5oz Max Heavyweight Long Sleeve Tee",
    "us_url": "https://www.shakawear.com/products/7-5oz-max-heavyweight-long-sleeve",
    "description": "Experience unmatched comfort and practicality while embracing effortless style. This heavyweight long sleeve t-shirt is the perfect way to stay comfortable and stylish all year round. Made from soft, high-quality USA cotton, its relaxed fit is ideal for wearing as active or casual wear.",
    "fit": "Standard",
    "sizes": [
      {
        "code": "S",
        "cost": 14.95
      },
      {
        "code": "M",
        "cost": 14.95
      },
      {
        "code": "L",
        "cost": 14.95
      },
      {
        "code": "XL",
        "cost": 14.95
      },
      {
        "code": "2XL",
        "cost": 14.95
      }
    ],
    "colours": [
      {
        "name": "Black",
        "us_match": "Black",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/Max_HeavyWeight_Longsleeve_Black_002_84e4af4e-651f-4aa9-b7d5-0274835c4d6e.jpg?v=1771881239",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/Max_HeavyWeight_Longsleeve_Black_003_45dc70f7-98f9-431b-95f4-e1a7f1a30e13.jpg?v=1771881240",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/Max_HeavyWeight_Longsleeve_Black_004_3c4c693c-08d3-446d-a58f-c9543c2377cf.jpg?v=1771881241"
        ]
      },
      {
        "name": "White",
        "us_match": "White",
        "images": [
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/Max_HeavyWeight_Longsleeve_White_002_925028e1-452a-414c-86a6-e6b3c485379e.jpg?v=1771881240",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/Max_HeavyWeight_Longsleeve_White_003_bed622ca-2d29-4be5-8cca-e930a4ea1671.jpg?v=1771881242",
          "https://cdn.shopify.com/s/files/1/0080/3913/7343/files/Max_HeavyWeight_Longsleeve_White_004_126ae12e-1c43-4ad3-8dde-4e163170ca07.jpg?v=1771881240"
        ]
      }
    ],
    "tags": [
      "Unisex",
      "Long Sleeve"
    ]
  }
]
