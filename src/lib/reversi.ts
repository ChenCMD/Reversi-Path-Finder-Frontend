export type Cell = 0 | 1 | 2
export type Board = Cell[][]
export type Mask = boolean[][]

export type Step = {
  board: Board
  player: Cell
  move: string | null
  pass: boolean
  index: number
}

export const SIZE = 6
export const EMPTY: Cell = 0
export const WHITE: Cell = 1
export const BLACK: Cell = 2

export type Origin = [number, number]

export const DEFAULT_ORIGIN: Origin = [2, 2]

export const createMatrix = <T,>(value: T): T[][] =>
  Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => value))

export const isValidOrigin = (origin: Origin): boolean => {
  const [x, y] = origin
  return x >= 0 && x <= SIZE - 2 && y >= 0 && y <= SIZE - 2
}

export const clampOrigin = (origin: Origin | undefined): Origin => {
  if (!origin) return DEFAULT_ORIGIN
  return isValidOrigin(origin) ? origin : DEFAULT_ORIGIN
}

export const originToString = (origin: Origin): string => {
  const [x, y] = origin
  return `${String.fromCharCode(65 + x)}${y + 1}`
}

export const stringToOrigin = (value: string | null | undefined): Origin | null => {
  if (!value || value.length !== 2) return null
  const normalized = value.toUpperCase()
  const col = normalized.charCodeAt(0) - 65
  const row = normalized.charCodeAt(1) - 49
  if (Number.isNaN(col) || Number.isNaN(row)) return null
  const origin: Origin = [col, row]
  return isValidOrigin(origin) ? origin : null
}

export const initialBlockCells = (origin: Origin): [number, number][] => {
  const [x, y] = clampOrigin(origin)
  return [
    [x, y],
    [x + 1, y],
    [x, y + 1],
    [x + 1, y + 1],
  ]
}

export const createInitialBoard = (origin: Origin = DEFAULT_ORIGIN): Board => {
  const [x, y] = clampOrigin(origin)
  const board = createMatrix<Cell>(EMPTY)
  board[y][x] = WHITE
  board[y + 1][x + 1] = WHITE
  board[y][x + 1] = BLACK
  board[y + 1][x] = BLACK
  return board
}

export const cloneBoard = (board: Board): Board => board.map((row) => row.slice())

const opponentOf = (player: Cell): Cell => (player === BLACK ? WHITE : BLACK)

const getFlipped = (board: Board, x: number, y: number, player: Cell): [number, number][] => {
  if (board[y][x] !== EMPTY) return []
  const opponent = opponentOf(player)
  const flips: [number, number][] = []
  const directions: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ]

  for (const [dx, dy] of directions) {
    let cx = x + dx
    let cy = y + dy
    const line: [number, number][] = []
    while (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE) {
      const cell = board[cy][cx]
      if (cell === opponent) {
        line.push([cx, cy])
      } else if (cell === player) {
        if (line.length) flips.push(...line)
        break
      } else {
        break
      }
      cx += dx
      cy += dy
    }
  }

  return flips
}

const placeDisk = (board: Board, x: number, y: number, player: Cell): Board | null => {
  const flips = getFlipped(board, x, y, player)
  if (!flips.length) return null
  const next = cloneBoard(board)
  next[y][x] = player
  flips.forEach(([fx, fy]) => {
    next[fy][fx] = player
  })
  return next
}

const reverseBits36 = (bits: bigint): bigint => {
  let reversed = 0n
  for (let pos = 0; pos < 36; pos += 1) {
    const mask = 1n << BigInt(pos)
    if ((bits & mask) !== 0n) {
      reversed |= 1n << BigInt(35 - pos)
    }
  }
  return reversed
}

const toOctal36 = (bits: bigint): string => reverseBits36(bits).toString(8).padStart(12, '0')

export const boardToOctal = (board: Board, target: Cell): string => {
  let bits = 0n
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = BigInt(y * SIZE + x)
      if (board[y][x] === target) {
        bits |= 1n << pos
      }
    }
  }
  return toOctal36(bits)
}

export const maskToOctal = (mask: Mask): string => {
  let bits = 0n
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = BigInt(y * SIZE + x)
      if (mask[y][x]) {
        bits |= 1n << pos
      }
    }
  }
  return toOctal36(bits)
}

const octalToBits = (octal: string): bigint | null => {
  if (!/^[0-7]{12}$/.test(octal)) return null
  return BigInt(`0o${octal}`)
}

export const octalToMask = (octal: string): Mask | null => {
  const bits = octalToBits(octal)
  if (bits === null) return null
  const mask = createMatrix<boolean>(false)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = BigInt(35 - (y * SIZE + x))
      mask[y][x] = ((bits >> pos) & 1n) === 1n
    }
  }
  return mask
}

export const octalToBoard = (whiteOctal: string, blackOctal: string): Board | null => {
  const whiteBits = octalToBits(whiteOctal)
  const blackBits = octalToBits(blackOctal)
  if (whiteBits === null || blackBits === null) return null
  const board = createMatrix<Cell>(EMPTY)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = BigInt(35 - (y * SIZE + x))
      const white = ((whiteBits >> pos) & 1n) === 1n
      const black = ((blackBits >> pos) & 1n) === 1n
      if (black) board[y][x] = BLACK
      else if (white) board[y][x] = WHITE
    }
  }
  return board
}

export const parseProgression = (
  progression: string,
): { type: 'move' | 'pass'; move?: string }[] => {
  const tokens: { type: 'move' | 'pass'; move?: string }[] = []
  if (!progression) return tokens
  let i = 0
  while (i < progression.length) {
    const a = progression[i]
    const b = progression[i + 1]
    if (a === '-' && b === '-') {
      tokens.push({ type: 'pass' })
      i += 2
      continue
    }
    if (!b) break
    tokens.push({ type: 'move', move: `${a}${b}` })
    i += 2
  }
  return tokens
}

export const computeSteps = (progression: string, origin: Origin = DEFAULT_ORIGIN): Step[] => {
  const steps: Step[] = []
  let board = createInitialBoard(origin)
  let player: Cell = BLACK
  steps.push({ board, player, move: null, pass: false, index: 0 })

  const tokens = parseProgression(progression)
  tokens.forEach((token) => {
    if (token.type === 'pass') {
      steps.push({ board, player, move: null, pass: true, index: steps.length })
      player = opponentOf(player)
      return
    }

    const move = token.move ?? ''
    const col = move.charCodeAt(0) - 65
    const row = move.charCodeAt(1) - 49
    const next = placeDisk(board, col, row, player) || board
    steps.push({
      board: next,
      player,
      move,
      pass: false,
      index: steps.length,
    })
    board = next
    player = opponentOf(player)
  })

  return steps
}
