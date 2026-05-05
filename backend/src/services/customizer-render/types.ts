import { z } from "zod"

export const renderPlacementSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
})

export const renderRequestSchema = z.object({
  side: z.enum(["front", "back", "left_sleeve", "right_sleeve", "printed_tag"]),
  artworkSvg: z.string().min(20),
  /** Allow null; coerce empty string so storefront never fails Zod on blank mockup URL. */
  garmentImageUrl: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.union([z.string().url(), z.null()])
  ),
  placement: renderPlacementSchema,
  /**
   * Fabric canvas dimensions (must match storefront editor). Used to crop garment photographs
   * the same way as CSS `object-cover`, and to extract the print-area after full-canvas render.
   */
  canvas: z
    .object({
      width: z.number().min(120).max(8000),
      height: z.number().min(120).max(8000),
    })
    .optional(),
})

export type RenderRequestPayload = z.infer<typeof renderRequestSchema>
