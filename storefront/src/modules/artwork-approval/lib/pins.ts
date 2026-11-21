/** Mirror of backend/src/lib/proof-pins.ts (x / y are 0..1 fractions of the image). */
export type ProofPin = { image_index: number; x: number; y: number; note: string }

export const MAX_PROOF_PINS = 20
export const MAX_PIN_NOTE = 300
