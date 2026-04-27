"use client"

import { useCallback, useEffect, useMemo, useReducer, useState } from "react"

const BOARD_W = 10
const BOARD_H = 20
const PIECE_TYPES = 7
const GRID = 4

const LINE_BONUS = [0, 100, 300, 500, 800] as const

/** 1 = block in shape. O has a single 4x4; others list each rotation. */
const SHAPES: readonly (readonly (readonly (readonly (0 | 1)[])[])[])[] = [
  // I
  [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
  // O
  [
    [
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
  ],
  // T
  [
    [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 1, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 1, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
  // S
  [
    [
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [1, 1, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [1, 1, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
  // Z
  [
    [
      [0, 0, 0, 0],
      [1, 1, 0, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 1, 0],
      [0, 1, 1, 0],
      [0, 1, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 0, 0],
      [0, 1, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
      [1, 0, 0, 0],
    ],
  ],
  // J
  [
    [
      [0, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 0],
      [0, 0, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [1, 1, 0, 0],
    ],
  ],
  // L
  [
    [
      [0, 0, 0, 0],
      [0, 0, 1, 0],
      [1, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 0],
      [1, 0, 0, 0],
    ],
    [
      [0, 0, 0, 0],
      [1, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
] as const

const PIECE_FILL: readonly string[] = [
  "var(--brand-accent)",
  "var(--brand-secondary)",
  "var(--brand-primary)",
  "color-mix(in srgb, var(--brand-accent) 70%, var(--brand-background))",
  "color-mix(in srgb, var(--brand-secondary) 75%, var(--brand-primary))",
  "color-mix(in srgb, var(--brand-primary) 55%, var(--brand-accent))",
  "color-mix(in srgb, var(--brand-primary) 40%, var(--brand-background))",
]

type Board = (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7)[][]

type Active = { t: number; r: number; x: number; y: number }

type GameState = {
  board: Board
  active: Active | null
  next: number
  lines: number
  score: number
  gameOver: boolean
}

const SPAWN_X = 3
const SPAWN_Y = 0

function emptyBoard(): Board {
  return Array.from({ length: BOARD_H }, () =>
    Array.from({ length: BOARD_W }, () => 0 as 0)
  )
}

function getShapeM(t: number, r: number) {
  const piece = SHAPES[t]!
  const k = r % piece.length
  return piece[k]! as (0 | 1)[][]
}

function collides(
  b: Board,
  t: number,
  r: number,
  px: number,
  py: number
): boolean {
  const m = getShapeM(t, r)
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (m[row]![col]! !== 1) {
        continue
      }
      const by = py + row
      const bx = px + col
      if (bx < 0 || bx >= BOARD_W) {
        return true
      }
      if (by >= BOARD_H) {
        return true
      }
      if (by < 0) {
        continue
      }
      if (b[by]![bx]! !== 0) {
        return true
      }
    }
  }
  return false
}

function lockPiece(
  b: Board,
  t: number,
  r: number,
  px: number,
  py: number
): void {
  const m = getShapeM(t, r)
  const mark = (t + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (m[row]![col]! !== 1) {
        continue
      }
      const by = py + row
      const bx = px + col
      if (by >= 0 && by < BOARD_H && bx >= 0 && bx < BOARD_W) {
        b[by]![bx] = mark
      }
    }
  }
}

function clearFullRows(b: Board): number {
  let cleared = 0
  for (let y = BOARD_H - 1; y >= 0; ) {
    if (b[y]!.every((c) => c !== 0)) {
      b.splice(y, 1)
      b.unshift(Array.from({ length: BOARD_W }, () => 0 as 0))
      cleared += 1
    } else {
      y -= 1
    }
  }
  return cleared
}

function randomPieceType(): number {
  return (Math.random() * PIECE_TYPES) | 0
}

function trySpawn(b: Board, t: number): Active | null {
  const a: Active = { t, r: 0, x: SPAWN_X, y: SPAWN_Y }
  if (collides(b, a.t, a.r, a.x, a.y)) {
    return null
  }
  return a
}

function createInitialState(_?: undefined): GameState {
  const b = emptyBoard()
  const a = randomPieceType()
  const n = randomPieceType()
  const active = trySpawn(b, a)
  return {
    board: b,
    active,
    next: n,
    lines: 0,
    score: 0,
    gameOver: !active,
  }
}

type Action =
  | { type: "tick" }
  | { type: "move"; dx: number; dy: number }
  | { type: "rotate" }
  | { type: "hardDrop" }
  | { type: "restart" }

function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === "restart") {
    return createInitialState()
  }
  if (state.gameOver || !state.active) {
    return state
  }
  const a = state.active

  if (action.type === "move") {
    const { dx, dy } = action
    const nx = a.x + dx
    const ny = a.y + dy
    if (collides(state.board, a.t, a.r, nx, ny)) {
      return state
    }
    return { ...state, active: { ...a, x: nx, y: ny } }
  }

  if (action.type === "rotate") {
    const piece = SHAPES[a.t]!
    const nRot = (a.r + 1) % piece.length
    if (collides(state.board, a.t, nRot, a.x, a.y)) {
      return state
    }
    return { ...state, active: { ...a, r: nRot } }
  }

  if (action.type === "hardDrop") {
    const b = state.board.map((row) => [...row])
    let y = a.y
    while (!collides(b, a.t, a.r, a.x, y + 1)) {
      y += 1
    }
    lockPiece(b, a.t, a.r, a.x, y)
    const c = clearFullRows(b)
    const nextT = state.next
    const newNext = randomPieceType()
    const na = trySpawn(b, nextT)
    return {
      ...state,
      board: b,
      active: na,
      next: newNext,
      lines: state.lines + c,
      score: state.score + (LINE_BONUS[c] ?? 0),
      gameOver: !na,
    }
  }

  if (action.type === "tick") {
    if (collides(state.board, a.t, a.r, a.x, a.y + 1)) {
      const b = state.board.map((row) => [...row])
      lockPiece(b, a.t, a.r, a.x, a.y)
      const c = clearFullRows(b)
      const nextT = state.next
      const newNext = randomPieceType()
      const na = trySpawn(b, nextT)
      return {
        ...state,
        board: b,
        active: na,
        next: newNext,
        lines: state.lines + c,
        score: state.score + (LINE_BONUS[c] ?? 0),
        gameOver: !na,
      }
    }
    return { ...state, active: { ...a, y: a.y + 1 } }
  }
  return state
}

export default function MiniTetris() {
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    createInitialState
  )
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduceMotion(mq.matches)
    const h = () => setReduceMotion(mq.matches)
    mq.addEventListener("change", h)
    return () => mq.removeEventListener("change", h)
  }, [])

  const dropMs = useMemo(
    () => (reduceMotion ? 1100 : 700),
    [reduceMotion]
  )

  useEffect(() => {
    if (state.gameOver) {
      return
    }
    const id = window.setInterval(() => {
      dispatch({ type: "tick" })
    }, dropMs)
    return () => window.clearInterval(id)
  }, [dropMs, state.gameOver])

  const tryMove = useCallback((dx: number, dy: number) => {
    dispatch({ type: "move", dx, dy })
  }, [])

  const tryRotate = useCallback(() => {
    dispatch({ type: "rotate" })
  }, [])

  const hardDrop = useCallback(() => {
    dispatch({ type: "hardDrop" })
  }, [])

  const restart = useCallback(() => {
    dispatch({ type: "restart" })
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        tryMove(-1, 0)
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        tryMove(1, 0)
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        tryMove(0, 1)
        return
      }
      if (e.key === "ArrowUp" || e.key === "x" || e.key === "X") {
        e.preventDefault()
        tryRotate()
        return
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        hardDrop()
      }
    },
    [hardDrop, tryMove, tryRotate]
  )

  const display = useMemo((): (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7)[][] => {
    const out = state.board.map((row) => [...row]) as (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7)[][]
    if (state.active && !state.gameOver) {
      const m = getShapeM(state.active.t, state.active.r)
      const { x, y, t } = state.active
      for (let row = 0; row < GRID; row++) {
        for (let col = 0; col < GRID; col++) {
          if (m[row]![col]! !== 1) {
            continue
          }
          const by = y + row
          const bx = x + col
          if (by >= 0 && by < BOARD_H && bx >= 0 && bx < BOARD_W) {
            out[by]![bx] = (t + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7
          }
        }
      }
    }
    return out
  }, [state.active, state.board, state.gameOver])

  const nextMat = getShapeM(state.next, 0)

  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 small:p-5 max-w-2xl">
      <div className="flex flex-col small:flex-row gap-6 small:items-start">
        <div
          className="inline-block outline-none"
          onKeyDown={onKeyDown}
          role="application"
          aria-label="Mini Tetris. Focus this area to use the keyboard."
          tabIndex={0}
        >
          <p className="text-xs text-ui-fg-muted mb-2">
            Click the board, then: arrows move / soft drop, up or X = rotate, Space
            or Enter = hard drop.{" "}
            {reduceMotion
              ? "Reduced motion: gravity is slower."
              : null}
          </p>
          <div
            className="grid gap-px p-1 rounded-md border border-ui-border-base bg-ui-bg-base inline-grid"
            style={{ gridTemplateColumns: `repeat(${BOARD_W}, minmax(0, 1fr))` }}
            aria-hidden
          >
            {display.map((row, ri) =>
              row.map((cell, ci) => {
                if (cell === 0) {
                  return (
                    <div
                      className="w-3.5 h-3.5 small:w-4 small:h-4 border border-ui-border-base/50 bg-ui-bg-subtle"
                      key={`${ri}-${ci}`}
                    />
                  )
                }
                const v = (cell - 1) as number
                return (
                  <div
                    className="w-3.5 h-3.5 small:w-4 small:h-4 border border-ui-border-base box-border"
                    key={`${ri}-${ci}`}
                    style={{
                      background: PIECE_FILL[v] ?? "var(--brand-primary)",
                    }}
                  />
                )
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-[10rem] text-sm text-ui-fg-base">
          <div>
            <p className="text-xs font-medium text-ui-fg-muted uppercase tracking-wide">
              Score
            </p>
            <p className="text-xl font-semibold tabular-nums">{state.score}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ui-fg-muted uppercase tracking-wide">
              Lines
            </p>
            <p className="text-lg font-semibold tabular-nums">{state.lines}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ui-fg-muted mb-1 uppercase tracking-wide">
              Next
            </p>
            <div
              className="grid gap-px p-1 rounded border border-ui-border-base bg-ui-bg-base inline-block"
              style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
            >
              {nextMat.map((row, ri) =>
                row.map((cell, ci) => (
                  <div
                    className="w-3 h-3 border border-ui-border-base/50"
                    key={`n-${ri}-${ci}`}
                    style={
                      cell === 1
                        ? {
                            background: PIECE_FILL[state.next] ?? "var(--brand-primary)",
                          }
                        : { background: "var(--brand-background)" }
                    }
                  />
                ))
              )}
            </div>
          </div>
          {state.gameOver ? (
            <p className="text-sm text-ui-fg-base font-medium" role="status">
              Game over
            </p>
          ) : null}
          <button
            type="button"
            onClick={restart}
            className="w-fit mt-1 rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm font-medium text-ui-fg-base hover:bg-ui-bg-subtle focus:outline-none focus:ring-2 focus:ring-ui-fg-base focus:ring-offset-1 focus:ring-offset-ui-bg-subtle"
          >
            {state.gameOver ? "Play again" : "Restart"}
          </button>
        </div>
      </div>
    </div>
  )
}
