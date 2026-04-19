import { z } from "zod"

export const renderPlacementSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().min(1),
  height: z.number().min(1),
})

export const renderRequestSchema = z.object({
  side: z.enum(["front", "back", "left_sleeve", "right_sleeve"]),
  artworkSvg: z.string().min(20),
  garmentImageUrl: z.string().url().nullable(),
  placement: renderPlacementSchema,
})

export type RenderRequestPayload = z.infer<typeof renderRequestSchema>
