import { z } from "zod"

import rawChart from "../../../data/cmyk-dtf-chart.json"

const cmykColorSchema = z.object({
  name: z.string(),
  c: z.number().min(0).max(100),
  m: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  k: z.number().min(0).max(100),
  hex: z.string(),
  notes: z.string().optional(),
})

const cmykCategorySchema = z.object({
  category: z.string(),
  description: z.string(),
  colors: z.array(cmykColorSchema),
})

const chartSchema = z.object({
  cmyk_color_chart: z.array(cmykCategorySchema),
})

export type CmykDtfColor = z.infer<typeof cmykColorSchema>
export type CmykDtfCategory = z.infer<typeof cmykCategorySchema>

export const cmykDtfChart = chartSchema.parse(rawChart)
