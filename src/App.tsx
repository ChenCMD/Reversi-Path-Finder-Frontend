import { useMemo, useRef, useState } from 'react'
import './App.css'
import BoardGrid from './components/BoardGrid'
import {
  BLACK,
  EMPTY,
  WHITE,
  type Board,
  type Cell,
  type Mask,
  type Step,
  boardToOctal,
  cloneBoard,
  computeSteps,
  createInitialBoard,
  createMatrix,
  SIZE,
  maskToOctal,
  octalToBoard,
  octalToMask,
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

function App() {
  const [targetBoard, setTargetBoard] = useState<Board>(() => createInitialBoard())
  const [maskBoard, setMaskBoard] = useState<Board>(() => createMatrix<Cell>(EMPTY))
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [progression, setProgression] = useState('')
  const [stepIndex, setStepIndex] = useState(0)
  const [steps, setSteps] = useState<Step[]>(() => computeSteps(''))
  const solveTokenRef = useRef(0)

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

  const currentStep = steps[stepIndex] || steps[0]

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
    setMessage('')
    setProgression('')
    setSteps(computeSteps(''))
    setStepIndex(0)
  }

  const applyInitialBoard = () => {
    setTargetBoard(createInitialBoard())
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

  const applySolveResult = (result: SolveResult | undefined) => {
    if (!result) {
      setStatus('error')
      setMessage('結果が取得できませんでした。')
      return
    }
    setStatus(result.status)
    if (result.status === 'reachable') {
      setProgression(result.progression || '')
      const nextSteps = computeSteps(result.progression || '')
      setSteps(nextSteps)
      setStepIndex(0)
    } else if (result.status === 'unreachable') {
      setMessage('到達可能な手順が見つかりませんでした。')
    } else if (result.status === 'unknown') {
      setMessage('判定不能（unknown）として返されました。')
    } else if (result.status === 'error') {
      setMessage(result.error || 'ソルバーエラー')
    }
  }

  const solve = async () => {
    solveTokenRef.current += 1
    const token = solveTokenRef.current
    setLoading(true)
    setStatus(null)
    setMessage('')
    setProgression('')
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
        applySolveResult(view.result)
        return
      }
      const requestUrl = buildApiUrl('/solve-from-octal')
      const requestBody = {
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
        const err = (data as SolveJobView).error || 'Request failed'
        setStatus('error')
        setMessage(err)
        return
      }

      if (res.status === 200 && 'result' in data) {
        applySolveResult(data.result)
        return
      }

      if ('jobId' in data) {
        setStatus(data.status)
        setMessage('探索を開始しました。完了までポーリングします。')
        logDebug('poll start', { jobId: data.jobId, intervalMs: pollIntervalMs })
        const view = await pollJob(data.jobId, token)
        logDebug('poll finished', { jobId: data.jobId, view })
        applySolveResult(view.result)
        return
      }

      setStatus('error')
      setMessage('不明なレスポンス形式です。')
    } catch (err) {
      if (String(err) === 'cancelled') return
      logDebug('solve error', err)
      setStatus('error')
      setMessage(String(err))
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
        whiteBoard?: string
        blackBoard?: string
        blackMask?: string
        whiteMask?: string
        error?: string
      }
      logDebug('generate response', { status: res.status, data })
      if (!res.ok) throw new Error(data.error || '例の読み込みに失敗しました。')
      const board = data.whiteBoard && data.blackBoard ? octalToBoard(data.whiteBoard, data.blackBoard) : null
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
      setStatus('error')
      setMessage(String(err))
    } finally {
      setLoading(false)
    }
  }

  const stepLabel = () => {
    if (!currentStep) return '開始'
    if (currentStep.pass) return `パス（${currentStep.player === BLACK ? '黒' : '白'}）`
    if (!currentStep.move) return '開始'
    return `${currentStep.player === BLACK ? '黒' : '白'}: ${currentStep.move}`
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
              <div className="panel-shell">
                <BoardGrid board={createInitialBoard()} />
              </div>
              <div className="controls controls-spacer" />
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
              {status ? <span className={`status ${status}`}>{status}</span> : null}
            </div>
            <div className="controls">
              <button className="accent" onClick={solve} disabled={loading}>
                {loading ? '探索中...' : '手順を探索'}
              </button>
              <button className="secondary" onClick={loadExample} disabled={loading}>
                例を読み込む
              </button>
            </div>
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
            ) : null}
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
