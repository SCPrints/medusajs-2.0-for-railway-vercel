/**
 * Canvas renderer for Space Invaders. Pure draw functions that read state
 * and produce pixels — never mutates state.
 *
 * Drawing strategy mirrors Tetris: dark navy bg with subtle outer glow on
 * the playfield, glowing radial blobs / sprite-style fills for entities,
 * brand-aligned palette. We use Canvas 2D APIs (no WebGL) so the bundle
 * stays small.
 */

import { drawGarment, NAVY } from "../garment-glyphs"

import {
  ALIEN_COLS,
  ALIEN_GARMENT,
  ALIEN_H,
  ALIEN_INK_RGB,
  ALIEN_HSPACE,
  ALIEN_RGB,
  ALIEN_ROWS,
  ALIEN_VSPACE,
  ALIEN_W,
  BARRIER_CHUNK_SIZE,
  BARRIER_COUNT,
  BARRIER_GRID_H,
  BARRIER_GRID_W,
  BARRIER_Y,
  BULLET_H,
  BULLET_TRAIL_LENGTH,
  BULLET_W,
  FLINCH_FRAMES,
  FLINCH_SCALE,
  LOGICAL_H,
  LOGICAL_W,
  PLAYER_H,
  PLAYER_RGB,
  PLAYER_TILT_LERP,
  PLAYER_TILT_MAX,
  PLAYER_W,
  PLAYER_Y,
  UFO_H,
  UFO_RGB,
  UFO_W,
  UFO_WOBBLE_AMP,
  UFO_WOBBLE_HZ,
  WAVE_CARD_IN_FRAMES,
  WAVE_CARD_OUT_FRAMES,
} from "./constants"
import type { GameState } from "./types"

const PLAYER_CSS = `rgb(${PLAYER_RGB[0]}, ${PLAYER_RGB[1]}, ${PLAYER_RGB[2]})`

/** Stable across frames; tracks render-only state that doesn't belong in
 * GameState (visual-only smoothing values like the player tilt). */
export type RenderState = {
  playerTilt: number
}

export function createRenderState(): RenderState {
  return { playerTilt: 0 }
}

/** Draw the entire frame. Caller is responsible for setting up the transform
 * (DPR scale). Coordinates here are LOGICAL playfield space. */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  rs: RenderState,
  frame: number
): void {
  /** Update render-only smoothed values. Player tilt lerps toward velocity. */
  const targetTilt = -state.playerVx * (PLAYER_TILT_MAX / 4)
  rs.playerTilt += (targetTilt - rs.playerTilt) * PLAYER_TILT_LERP

  /** Background — slightly lighter than the surrounding navy so the
   * playfield reads as its own panel. */
  ctx.fillStyle = "#0e0e1d"
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)

  drawBarriers(ctx, state)
  drawAliens(ctx, state)
  drawUfo(ctx, state)
  drawBullets(ctx, state)
  drawPlayer(ctx, state, rs, frame)

  /** Death wash — red overlay that fades over DEATH_WASH_FRAMES. */
  if (state.deathWash > 0) {
    const a = state.deathWash / 28
    ctx.fillStyle = `rgba(255, 46, 99, ${a * 0.35})`
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  }

  drawHud(ctx, state)
  drawWaveCard(ctx, state)
  drawPauseOverlay(ctx, state)
  drawGameOverCard(ctx, state)
}

/** Player — a teal tee on the rack, tilting into its movement. */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  rs: RenderState,
  frame: number
): void {
  if (state.phase.kind === "waveSpawn") return
  /** Invuln shimmer — alternate visibility every 6 frames. */
  if (state.invulnFrames > 0 && Math.floor(frame / 6) % 2 === 0) return

  ctx.save()
  ctx.translate(state.playerX, PLAYER_Y)
  ctx.rotate(rs.playerTilt)
  ctx.shadowBlur = 10
  ctx.shadowColor = PLAYER_CSS
  drawGarment(ctx, "tee", 0, 0, PLAYER_W, PLAYER_H, PLAYER_CSS)
  ctx.restore()
}

/** Bullets — ink drops with a short fading trail. Player ink is teal, the
 * rack fires magenta. */
function drawBullets(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  for (const b of state.bullets) {
    const rgb = b.fromPlayer ? PLAYER_RGB : ALIEN_INK_RGB
    const colour = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
    for (let i = b.trail.length - 1; i >= 1; i--) {
      const p = b.trail[i]!
      const alpha = (1 - i / BULLET_TRAIL_LENGTH) * 0.5
      ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, BULLET_W * 0.9, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 6
    ctx.shadowColor = colour
    ctx.fillStyle = colour
    drawInkDrop(ctx, b.x, b.y, BULLET_W * 1.6, BULLET_H, b.fromPlayer ? -1 : 1)
    ctx.shadowBlur = 0
  }
}

/** Teardrop pointing in the travel direction (`dir` -1 = up, 1 = down). */
function drawInkDrop(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: number
): void {
  const tip = y + (dir * h) / 2
  const tail = y - (dir * h) / 2
  ctx.beginPath()
  ctx.moveTo(x, tip)
  ctx.quadraticCurveTo(x + w, tail + dir * h * 0.3, x, tail)
  ctx.quadraticCurveTo(x - w, tail + dir * h * 0.3, x, tip)
  ctx.closePath()
  ctx.fill()
}

/** The fleet — a grid of blank garments, one style per row. Walk cycle is a
 * gentle sway keyed on stepParity; adjacent flinch via FLINCH_SCALE. */
function drawAliens(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  for (let r = 0; r < ALIEN_ROWS; r++) {
    const [rR, rG, rB] = ALIEN_RGB[r] ?? [255, 255, 255]
    const colour = `rgb(${rR}, ${rG}, ${rB})`
    const kind = ALIEN_GARMENT[r] ?? "tee"
    for (let c = 0; c < ALIEN_COLS; c++) {
      const idx = r * ALIEN_COLS + c
      if (!state.aliens[idx]) continue
      const cx = state.formationX + c * ALIEN_HSPACE
      const cy = state.formationY + r * ALIEN_VSPACE
      const flinch = state.flinch[idx] ?? 0
      const scale =
        flinch > 0
          ? FLINCH_SCALE +
            (1 - FLINCH_SCALE) * (1 - flinch / FLINCH_FRAMES)
          : 1
      /** Sway: garments on a moving rack lean into the step. */
      const sway = (state.stepParity === 0 ? 1 : -1) * 0.08
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(sway)
      ctx.scale(scale, scale)
      ctx.shadowBlur = 5
      ctx.shadowColor = colour
      drawGarment(ctx, kind, 0, 0, ALIEN_W + 2, ALIEN_H + 4, colour, NAVY)
      ctx.restore()
    }
  }
}

/** Barriers — chunk grid; only intact chunks drawn. Stacks of folded blanks
 * in brand soft-light. */
function drawBarriers(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  const barrierW = BARRIER_GRID_W * BARRIER_CHUNK_SIZE
  const spacing = LOGICAL_W / BARRIER_COUNT
  ctx.fillStyle = "rgba(238, 238, 238, 0.6)"
  for (let bi = 0; bi < BARRIER_COUNT; bi++) {
    const bx0 = (bi + 0.5) * spacing - barrierW / 2
    const grid = state.barriers[bi]!
    for (let r = 0; r < BARRIER_GRID_H; r++) {
      for (let c = 0; c < BARRIER_GRID_W; c++) {
        if (!grid[r * BARRIER_GRID_W + c]) continue
        ctx.fillRect(
          bx0 + c * BARRIER_CHUNK_SIZE,
          BARRIER_Y + r * BARRIER_CHUNK_SIZE,
          BARRIER_CHUNK_SIZE - 0.5,
          BARRIER_CHUNK_SIZE - 0.5
        )
      }
    }
  }
}

/** UFO — the bonus hoodie drifting across the top with a wobble. */
function drawUfo(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  if (!state.ufo) return
  const wobble =
    Math.sin((state.ufo.phase * UFO_WOBBLE_HZ) / 60 * Math.PI * 2) *
    UFO_WOBBLE_AMP
  const colour = `rgb(${UFO_RGB[0]}, ${UFO_RGB[1]}, ${UFO_RGB[2]})`
  ctx.save()
  ctx.translate(state.ufo.x, state.ufo.y + wobble)
  ctx.rotate(state.ufo.dir * 0.12)
  ctx.shadowBlur = 10
  ctx.shadowColor = colour
  drawGarment(ctx, "hoodie", 0, 0, UFO_W, UFO_H, colour, NAVY)
  ctx.restore()
}

/** HUD: lives, score, wave. Drawn in logical px space; the canvas-scale
 * transform handles DPR. */
function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  ctx.save()
  /** Score — top-left. */
  ctx.fillStyle = "rgba(255,255,255,0.8)"
  ctx.font =
    "600 11px ui-monospace, SFMono-Regular, Menlo, monospace"
  ctx.textBaseline = "top"
  ctx.fillText(`SCORE  ${state.score}`, 6, 6)
  /** Wave — top-centre. */
  ctx.textAlign = "center"
  ctx.fillText(`WAVE  ${state.wave}`, LOGICAL_W / 2, 6)
  /** Lives — top-right (mini tees). */
  ctx.textAlign = "right"
  ctx.fillText(`LIVES`, LOGICAL_W - 6, 6)
  for (let i = 0; i < state.lives; i++) {
    const lx = LOGICAL_W - 12 - i * 14
    drawGarment(ctx, "tee", lx, 25, 11, 9, PLAYER_CSS)
  }
  ctx.restore()
}

/** Wave-card: large title-card that swooshes in/out at the start of every
 * wave. Phase + timer drive the slide animation. */
function drawWaveCard(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  if (state.waveCardPhase === "idle") return
  let frac = 0 // 0 = off-screen left, 0.5 = centred, 1 = off-screen right
  if (state.waveCardPhase === "in") {
    frac = state.waveCardTimer / WAVE_CARD_IN_FRAMES
    frac = 0.5 * easeOutCubic(frac)
  } else if (state.waveCardPhase === "hold") {
    frac = 0.5
  } else if (state.waveCardPhase === "out") {
    frac = 0.5 + 0.5 * easeInCubic(state.waveCardTimer / WAVE_CARD_OUT_FRAMES)
  }
  /** Map frac (0..1) → x position; off-screen at frac=0 (left) and frac=1 (right). */
  const cardW = 200
  const cardH = 56
  const baseX = -cardW + frac * (LOGICAL_W + cardW * 2)
  const cy = LOGICAL_H / 2 - cardH / 2

  ctx.save()
  ctx.fillStyle = "rgba(15, 15, 30, 0.9)"
  ctx.strokeStyle = `rgba(${PLAYER_RGB[0]}, ${PLAYER_RGB[1]}, ${PLAYER_RGB[2]}, 0.65)`
  ctx.lineWidth = 1
  ctx.fillRect(baseX, cy, cardW, cardH)
  ctx.strokeRect(baseX + 0.5, cy + 0.5, cardW - 1, cardH - 1)
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.font = "700 24px ui-sans-serif, system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(`WAVE ${state.waveCardWave}`, baseX + cardW / 2, cy + cardH / 2)
  ctx.restore()
}

function drawPauseOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  if (state.phase.kind !== "paused") return
  ctx.save()
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.font = "700 28px ui-sans-serif, system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("PAUSED", LOGICAL_W / 2, LOGICAL_H / 2 - 10)
  ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif"
  ctx.fillStyle = "rgba(255,255,255,0.6)"
  ctx.fillText("Press P or Esc to resume", LOGICAL_W / 2, LOGICAL_H / 2 + 14)
  ctx.restore()
}

function drawGameOverCard(
  ctx: CanvasRenderingContext2D,
  state: GameState
): void {
  if (state.phase.kind !== "gameOver") return
  ctx.save()
  ctx.fillStyle = "rgba(0,0,0,0.7)"
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.font = "700 28px ui-sans-serif, system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("GAME OVER", LOGICAL_W / 2, LOGICAL_H / 2 - 30)
  ctx.font = "600 16px ui-sans-serif, system-ui, sans-serif"
  ctx.fillStyle = "rgba(255,255,255,0.85)"
  ctx.fillText(`Score  ${state.score}`, LOGICAL_W / 2, LOGICAL_H / 2 + 4)
  ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif"
  ctx.fillStyle = "rgba(255,255,255,0.6)"
  ctx.fillText(
    `Best  ${Math.max(state.score, state.highScore)}`,
    LOGICAL_W / 2,
    LOGICAL_H / 2 + 22
  )
  ctx.fillStyle = "rgba(255,255,255,0.5)"
  ctx.fillText(
    "Press R to play again",
    LOGICAL_W / 2,
    LOGICAL_H / 2 + 46
  )
  ctx.restore()
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
function easeInCubic(t: number): number {
  return t * t * t
}
