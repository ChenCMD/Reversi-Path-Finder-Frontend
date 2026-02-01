import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import BoardGrid from './components/BoardGrid'
import {
  BLACK,
  EMPTY,
  WHITE,
  type Board,
  type Cell,
  type Mask,
  type Origin,
  type Step,
  DEFAULT_ORIGIN,
  boardToOctal,
  cloneBoard,
  computeSteps,
  createInitialBoard,
  createMatrix,
  initialBlockCells,
  originToString,
  SIZE,
  maskToOctal,
  octalToBoard,
  octalToMask,
  stringToOrigin,
} from './lib/reversi'
import {
  buildApiUrl,
  pollIntervalMs,
  pollTimeoutMs,
  mockSolveResponse,
  type SolveJobAccepted,
  type SolveJobView,
  type SolveResult,
} from './lib/api'

const debugEnabled = import.meta.env.DEV || import.meta.env.VITE_DEBUG_LOGS === 'true'
const logDebug = (...args: unknown[]) => {
  if (debugEnabled) {
    console.debug('[debug]', ...args)
  }
}

const ORIGIN_HIT_SIZE = 28

function App() {
  const [initialOrigin, setInitialOrigin] = useState<Origin>(DEFAULT_ORIGIN)
  const [targetBoard, setTargetBoard] = useState<Board>(() => createInitialBoard(DEFAULT_ORIGIN))
  const [maskBoard, setMaskBoard] = useState<Board>(() => createMatrix<Cell>(EMPTY))
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [progression, setProgression] = useState('')
  const [stepIndex, setStepIndex] = useState(0)
  const [steps, setSteps] = useState<Step[]>(() => computeSteps('', DEFAULT_ORIGIN))
  const solveTokenRef = useRef(0)
  const originSelectorRef = useRef<HTMLDivElement | null>(null)
  const [hoverOrigin, setHoverOrigin] = useState<Origin | null>(null)
  const [originEdges, setOriginEdges] = useState<{
    columns: number[]
    rows: number[]
    columnGap: number
    rowGap: number
  }>({
    columns: [],
    rows: [],
    columnGap: 0,
    rowGap: 0,
  })
  const initialBoard = useMemo(() => createInitialBoard(initialOrigin), [initialOrigin])
  const hoverHighlightCells = useMemo(
    () => (hoverOrigin ? initialBlockCells(hoverOrigin) : []),
    [hoverOrigin],
  )
  const originTargets = useMemo(() => {
    const targets: { x: number; y: number; label: string }[] = []
    for (let y = 0; y < SIZE - 1; y += 1) {
      for (let x = 0; x < SIZE - 1; x += 1) {
        targets.push({ x, y, label: originToString([x, y]) })
      }
    }
    return targets
  }, [])

  useLayoutEffect(() => {
    const root = originSelectorRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const boardEl = root.querySelector('.board') as HTMLDivElement | null
    if (!boardEl) return
    const compute = () => {
      const overlayRect = root.getBoundingClientRect()
      const cells = Array.from(boardEl.querySelectorAll<HTMLDivElement>('.cell'))
      if (!cells.length) return
      const colStarts = Array.from({ length: SIZE }, () => Number.POSITIVE_INFINITY)
      const colEnds = Array.from({ length: SIZE }, () => Number.NEGATIVE_INFINITY)
      const rowStarts = Array.from({ length: SIZE }, () => Number.POSITIVE_INFINITY)
      const rowEnds = Array.from({ length: SIZE }, () => Number.NEGATIVE_INFINITY)
      cells.forEach((cell, index) => {
        const rect = cell.getBoundingClientRect()
        const x = index % SIZE
        const y = Math.floor(index / SIZE)
        const left = rect.left - overlayRect.left
        const right = rect.right - overlayRect.left
        const top = rect.top - overlayRect.top
        const bottom = rect.bottom - overlayRect.top
        colStarts[x] = Math.min(colStarts[x], left)
        colEnds[x] = Math.max(colEnds[x], right)
        rowStarts[y] = Math.min(rowStarts[y], top)
        rowEnds[y] = Math.max(rowEnds[y], bottom)
      })
      const columns: number[] = new Array(SIZE + 1)
      const rows: number[] = new Array(SIZE + 1)
      for (let i = 0; i < SIZE; i += 1) {
        columns[i] = colStarts[i]
        rows[i] = rowStarts[i]
      }
      columns[SIZE] = colEnds[SIZE - 1]
      rows[SIZE] = rowEnds[SIZE - 1]
      const style = window.getComputedStyle(boardEl)
      const columnGap = Number.parseFloat(style.columnGap || style.gap || '0') || 0
      const rowGap = Number.parseFloat(style.rowGap || style.gap || '0') || 0
      setOriginEdges({ columns, rows, columnGap, rowGap })
    }
    compute()
    const observer = new ResizeObserver(() => compute())
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const whiteOctal = useMemo(() => boardToOctal(targetBoard, WHITE), [targetBoard])
  const blackOctal = useMemo(() => boardToOctal(targetBoard, BLACK), [targetBoard])
  const whiteMask = useMemo<Mask>(() => {
    const mask = createMatrix<boolean>(false)
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        mask[y][x] = maskBoard[y][x] === WHITE
      }
    }
    return mask
  }, [maskBoard])
  const blackMask = useMemo<Mask>(() => {
    const mask = createMatrix<boolean>(false)
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        mask[y][x] = maskBoard[y][x] === BLACK
      }
    }
    return mask
  }, [maskBoard])
  const whiteMaskOctal = useMemo(() => maskToOctal(whiteMask), [whiteMask])
  const blackMaskOctal = useMemo(() => maskToOctal(blackMask), [blackMask])

  const updateBoard = (x: number, y: number) => {
    setTargetBoard((prev) => {
      const next = cloneBoard(prev)
      const cell = prev[y][x]
      const nextValue: Cell = cell === EMPTY ? BLACK : cell === BLACK ? WHITE : EMPTY
      next[y][x] = nextValue
      return next
    })
  }

  const updateMaskBoard = (x: number, y: number) => {
    setMaskBoard((prev) => {
      const next = cloneBoard(prev)
      const cell = prev[y][x]
      const nextValue: Cell = cell === EMPTY ? BLACK : cell === BLACK ? WHITE : EMPTY
      next[y][x] = nextValue
      return next
    })
  }

  const resetAll = () => {
    setTargetBoard(createMatrix<Cell>(EMPTY))
    setMaskBoard(createMatrix<Cell>(EMPTY))
    setStatus(null)
    setProgression('')
    setSteps(computeSteps('', initialOrigin))
    setStepIndex(0)
  }

  const applyInitialBoard = () => {
    setTargetBoard(createInitialBoard(initialOrigin))
  }

  const handleOriginSelect = (x: number, y: number) => {
    if (x > SIZE - 2 || y > SIZE - 2) return
    const nextOrigin: Origin = [x, y]
    setInitialOrigin(nextOrigin)
    setProgression('')
    setSteps(computeSteps('', nextOrigin))
    setStepIndex(0)
    setStatus(null)
  }

  const getOriginHitStyle = (x: number, y: number) => {
    const { columns, rows, columnGap, rowGap } = originEdges
    if (columns.length !== SIZE + 1 || rows.length !== SIZE + 1) return undefined
    const nextColumn = columns[x + 1]
    const nextRow = rows[y + 1]
    if (typeof nextColumn !== 'number' || typeof nextRow !== 'number') return undefined
    const cx = nextColumn - columnGap / 2
    const cy = nextRow - rowGap / 2
    return { cx, cy }
  }

  const pollJob = async (jobId: string, token: number): Promise<SolveJobView> => {
    const start = Date.now()
    while (true) {
      if (solveTokenRef.current !== token) {
        throw new Error('cancelled')
      }
      if (pollTimeoutMs > 0 && Date.now() - start > pollTimeoutMs) {
        logDebug('poll timeout', { jobId, elapsedMs: Date.now() - start, timeoutMs: pollTimeoutMs })
        throw new Error('ポーリングがタイムアウトしました。')
      }
      const res = await fetch(buildApiUrl(`/solve-from-octal/${jobId}`))
      const data = (await res.json().catch(() => ({}))) as SolveJobView
      logDebug('poll response', { jobId, status: res.status, data })
      if (!res.ok) {
        throw new Error(data.error || 'ポーリングに失敗しました。')
      }
      if (data.status === 'finished' || data.status === 'error') {
        return data
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  const applySolveResult = (result: SolveResult | undefined, opts?: { origin?: Origin }) => {
    if (!result) {
      setStatus('error')
      return
    }
    setStatus(result.status)
    if (result.status === 'reachable') {
      setProgression(result.progression || '')
      const stepsOrigin = opts?.origin ?? initialOrigin
      const nextSteps = computeSteps(result.progression || '', stepsOrigin)
      setSteps(nextSteps)
      setStepIndex(0)
    }
  }

  const solve = async () => {
    solveTokenRef.current += 1
    const token = solveTokenRef.current
    setLoading(true)
    setStatus(null)
    setProgression('')
    const requestOrigin = originToString(initialOrigin)
    try {
      if (mockSolveResponse) {
        let parsed: { data?: SolveJobView; view?: SolveJobView } | SolveJobView | undefined
        try {
          if (mockSolveResponse.startsWith('{')) {
            parsed = JSON.parse(mockSolveResponse) as { data?: SolveJobView; view?: SolveJobView } | SolveJobView
          } else {
            const res = await fetch(mockSolveResponse)
            parsed = (await res.json()) as { data?: SolveJobView; view?: SolveJobView } | SolveJobView
          }
        } catch (err) {
          logDebug('mock parse error', err)
          throw new Error('モックレスポンスの形式が不正です。')
        }
        const view =
          (parsed && 'data' in parsed && parsed.data) ||
          (parsed && 'view' in parsed && parsed.view) ||
          (parsed && 'jobId' in parsed ? (parsed as SolveJobView) : undefined)
        if (!view) {
          throw new Error('モックレスポンスの形式が不正です。')
        }
        logDebug('mock solve response', view)
        const mockOrigin = stringToOrigin(view.input?.origin ?? requestOrigin) ?? initialOrigin
        applySolveResult(view.result, { origin: mockOrigin })
        return
      }
      const requestUrl = buildApiUrl('/solve-from-octal')
      const requestBody = {
        origin: requestOrigin,
        whiteBoard: whiteOctal,
        blackBoard: blackOctal,
        blackMask: blackMaskOctal,
        whiteMask: whiteMaskOctal,
      }
      logDebug('solve request', { url: requestUrl, body: requestBody })
      const res = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const data = (await res.json().catch(() => ({}))) as SolveJobAccepted | SolveJobView
      logDebug('solve response', { status: res.status, data })
      if (!res.ok) {
        logDebug('solve request failed', data)
        setStatus('error')
        setProgression('')
        return
      }

      if (res.status === 200 && 'result' in data) {
        const responseOrigin = stringToOrigin(data.input?.origin ?? requestOrigin) ?? initialOrigin
        applySolveResult(data.result, { origin: responseOrigin })
        return
      }

      if ('jobId' in data) {
        setStatus(data.status)
        logDebug('poll start', { jobId: data.jobId, intervalMs: pollIntervalMs })
        const view = await pollJob(data.jobId, token)
        logDebug('poll finished', { jobId: data.jobId, view })
        const viewOrigin = stringToOrigin(view.input?.origin ?? requestOrigin) ?? initialOrigin
        applySolveResult(view.result, { origin: viewOrigin })
        return
      }

      setStatus('error')
      setProgression('')
    } catch (err) {
      if (String(err) === 'cancelled') return
      logDebug('solve error', err)
      setStatus('error')
      setProgression('')
    } finally {
      if (solveTokenRef.current === token) {
        setLoading(false)
      }
    }
  }

  const loadExample = async () => {
    setLoading(true)
    try {
      const requestUrl = buildApiUrl('/generate-valid-octal')
      logDebug('generate request', { url: requestUrl })
      const res = await fetch(requestUrl)
      const data = (await res.json().catch(() => ({}))) as {
        status?: string
        whiteBoard?: string
        blackBoard?: string
        whiteMask?: string
        blackMask?: string
        origin?: string
        error?: string
      }
      logDebug('generate response', { status: res.status, data })
      if (!res.ok) throw new Error(data.error || '例の読み込みに失敗しました。')
      const originText = data.origin?.trim()
      const origin = originText ? stringToOrigin(originText) : null
      if (!origin) {
        throw new Error('生成レスポンスにoriginが含まれていません。')
      }
      if (origin) {
        setInitialOrigin(origin)
        setProgression('')
        setSteps(computeSteps('', origin))
        setStepIndex(0)
        setStatus(null)
      }
      const board =
        data.whiteBoard && data.blackBoard ? octalToBoard(data.whiteBoard, data.blackBoard) : null
      const black = data.blackMask ? octalToMask(data.blackMask) : null
      const white = data.whiteMask ? octalToMask(data.whiteMask) : null
      if (board) setTargetBoard(board)
      if (black || white) {
        setMaskBoard((prev) => {
          const next = cloneBoard(prev)
          for (let y = 0; y < SIZE; y += 1) {
            for (let x = 0; x < SIZE; x += 1) {
              const blackAllowed = black ? black[y][x] : false
              const whiteAllowed = white ? white[y][x] : false
              if (whiteAllowed) next[y][x] = WHITE
              else if (blackAllowed) next[y][x] = BLACK
              else next[y][x] = EMPTY
            }
          }
          return next
        })
      }
    } catch (err) {
      logDebug('generate example error', err)
      setStatus('error')
      setProgression('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <header>
        <div>
          <h1>Reversi Path Finder</h1>
          <p>盤面とマスクを設定して、手順を探索します。</p>
        </div>
      </header>

      <div className="layout">
        <div className="top-row">
          <div className="panel board-panel">
            <div className="section-title">
              <h2>初期盤面</h2>
            </div>
            <div className="tile-body">
              <div className="panel-shell origin-panel">
                <div className="origin-selector" ref={originSelectorRef}>
                  <BoardGrid board={initialBoard} highlights={hoverHighlightCells} />
                  <div
                    className="origin-overlay"
                    aria-hidden
                    onMouseLeave={() => setHoverOrigin(null)}
                  >
                    {originTargets.map((cell) => {
                      const hitStyle = getOriginHitStyle(cell.x, cell.y)
                      if (!hitStyle) return null
                      return (
                        <button
                          key={`${cell.x}-${cell.y}`}
                          className="origin-hit"
                          type="button"
                          style={{
                            left: `${hitStyle.cx - ORIGIN_HIT_SIZE / 2}px`,
                            top: `${hitStyle.cy - ORIGIN_HIT_SIZE / 2}px`,
                            width: `${ORIGIN_HIT_SIZE}px`,
                            height: `${ORIGIN_HIT_SIZE}px`,
                          }}
                          onClick={() => handleOriginSelect(cell.x, cell.y)}
                          onMouseEnter={() => setHoverOrigin([cell.x, cell.y])}
                          data-origin-x={cell.x}
                          data-origin-y={cell.y}
                          aria-label={`初期配置 ${cell.label}`}
                        >
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="origin-meta">
                <p className="origin-note">
                  盤面左上の交点をクリックすると
                  <br />
                  初期配置を切り替えられます。
                </p>
              </div>
            </div>
          </div>

          <div className="panel board-panel">
            <div className="section-title">
              <h2>目標盤面（解）</h2>
            </div>
            <div className="tile-body">
              <div className="panel-shell">
                <BoardGrid board={targetBoard} onCellClick={updateBoard} />
              </div>
              <div className="controls">
                <button className="secondary" onClick={applyInitialBoard}>
                  初期盤面に戻す
                </button>
                <button className="secondary" onClick={resetAll}>
                  すべてクリア
                </button>
              </div>
            </div>
          </div>

          <div className="panel board-panel">
            <div className="section-title">
              <h2>配置マスク</h2>
            </div>
            <div className="tile-body">
              <div className="panel-shell">
                <BoardGrid board={maskBoard} onCellClick={updateMaskBoard} />
              </div>
              <div className="controls">
                <button className="secondary" onClick={() => setMaskBoard(createMatrix<Cell>(BLACK))}>
                  黒を全許可
                </button>
                <button className="secondary" onClick={() => setMaskBoard(createMatrix<Cell>(WHITE))}>
                  白を全許可
                </button>
                <button className="secondary" onClick={() => setMaskBoard(createMatrix<Cell>(EMPTY))}>
                  クリア
                </button>
              </div>
            </div>
          </div>

          <div className="panel menu-panel">
            <div className="section-title">
              <h2>メニュー</h2>
            </div>
            <div className="controls">
              <button className="accent" onClick={solve} disabled={loading}>
                {loading ? '探索中...' : '手順を探索'}
              </button>
              <button className="secondary" onClick={loadExample} disabled={loading}>
                例を読み込む
              </button>
            </div>
            <div className="menu-step-card">
              <div className="menu-step-shell">
                {progression ? (
                  <div className="menu-step-list">
                    {steps.map((step) => {
                      const label = step.pass
                        ? `パス（${step.player === BLACK ? '黒' : '白'}）`
                        : step.move
                          ? `${step.player === BLACK ? '黒' : '白'} ${step.move}`
                          : '開始'
                      const isActive = step.index === stepIndex
                      return (
                        <button
                          key={step.index}
                          className={`menu-step-item ${isActive ? 'active' : ''}`}
                          onClick={() => setStepIndex(step.index)}
                        >
                          <span className="move-index">{step.index}</span>
                          <span className="move-label">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="menu-step-empty">探索を実行すると手順がここに表示されます。</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bottom-row">
          <div className="panel step-panel">
            {status === 'unreachable' ? (
              <p className="note">この盤面は到達不能です。</p>
            ) : progression ? (
              <div className="step-strip" role="list">
                {steps.map((step) => {
                  const label = step.pass
                    ? `パス（${step.player === BLACK ? '黒' : '白'}）`
                    : step.move
                      ? `${step.player === BLACK ? '黒' : '白'} ${step.move}`
                      : '開始'
                  const isActive = step.index === stepIndex
                  const highlight =
                    step.move && !step.pass
                      ? ([step.move.charCodeAt(0) - 65, step.move.charCodeAt(1) - 49] as [
                          number,
                          number,
                        ])
                      : null
                  return (
                    <button
                      key={step.index}
                      className={`step-card ${isActive ? 'active' : ''}`}
                      onClick={() => setStepIndex(step.index)}
                    >
                      <div className="step-card-board">
                        <BoardGrid board={step.board} highlight={highlight} className="board-mini" />
                      </div>
                      <div className="step-card-meta">
                        <span className="move-index">{step.index}</span>
                        <span className="move-label">{label}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="note">探索を実行すると、下に手順が横スクロールで表示されます。</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
