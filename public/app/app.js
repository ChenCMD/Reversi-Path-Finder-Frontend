/* global React, ReactDOM, htm */
'use strict';

const { useMemo, useState } = React;
const html = htm.bind(React.createElement);

const SIZE = 6;
const EMPTY = 0;
const WHITE = 1;
const BLACK = 2;
const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F'];

const createMatrix = (value) =>
  Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => value));

const createInitialBoard = () => {
  const board = createMatrix(EMPTY);
  board[2][2] = WHITE;
  board[3][3] = WHITE;
  board[2][3] = BLACK;
  board[3][2] = BLACK;
  return board;
};

const cloneBoard = (board) => board.map((row) => row.slice());

const opponentOf = (player) => (player === BLACK ? WHITE : BLACK);

const getFlipped = (board, x, y, player) => {
  if (board[y][x] !== EMPTY) return [];
  const opponent = opponentOf(player);
  const flips = [];
  const directions = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  for (const [dx, dy] of directions) {
    let cx = x + dx;
    let cy = y + dy;
    const line = [];
    while (cx >= 0 && cx < SIZE && cy >= 0 && cy < SIZE) {
      const cell = board[cy][cx];
      if (cell === opponent) {
        line.push([cx, cy]);
      } else if (cell === player) {
        if (line.length) flips.push(...line);
        break;
      } else {
        break;
      }
      cx += dx;
      cy += dy;
    }
  }

  return flips;
};

const placeDisk = (board, x, y, player) => {
  const flips = getFlipped(board, x, y, player);
  if (!flips.length) return null;
  const next = cloneBoard(board);
  next[y][x] = player;
  flips.forEach(([fx, fy]) => {
    next[fy][fx] = player;
  });
  return next;
};

const boardToOctal = (board, target) => {
  let bits = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = y * SIZE + x;
      if (board[y][x] === target) {
        bits |= 1 << pos;
      }
    }
  }
  let reversed = 0;
  for (let pos = 0; pos < 36; pos += 1) {
    if ((bits >> pos) & 1) {
      reversed |= 1 << (35 - pos);
    }
  }
  return reversed.toString(8).padStart(12, '0');
};

const maskToOctal = (mask) => {
  let bits = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = y * SIZE + x;
      if (mask[y][x]) {
        bits |= 1 << pos;
      }
    }
  }
  let reversed = 0;
  for (let pos = 0; pos < 36; pos += 1) {
    if ((bits >> pos) & 1) {
      reversed |= 1 << (35 - pos);
    }
  }
  return reversed.toString(8).padStart(12, '0');
};

const octalToBits = (octal) => {
  if (!/^[0-7]{12}$/.test(octal)) return null;
  return parseInt(octal, 8);
};

const octalToMask = (octal) => {
  const bits = octalToBits(octal);
  if (bits === null) return null;
  const mask = createMatrix(false);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = y * SIZE + x;
      mask[y][x] = ((bits >> (35 - pos)) & 1) === 1;
    }
  }
  return mask;
};

const octalToBoard = (whiteOctal, blackOctal) => {
  const whiteBits = octalToBits(whiteOctal);
  const blackBits = octalToBits(blackOctal);
  if (whiteBits === null || blackBits === null) return null;
  const board = createMatrix(EMPTY);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const pos = y * SIZE + x;
      const white = ((whiteBits >> (35 - pos)) & 1) === 1;
      const black = ((blackBits >> (35 - pos)) & 1) === 1;
      if (black) board[y][x] = BLACK;
      else if (white) board[y][x] = WHITE;
    }
  }
  return board;
};

const parseProgression = (progression) => {
  const tokens = [];
  if (!progression) return tokens;
  let i = 0;
  while (i < progression.length) {
    const a = progression[i];
    const b = progression[i + 1];
    if (a === '-' && b === '-') {
      tokens.push({ type: 'pass' });
      i += 2;
      continue;
    }
    if (!b) break;
    const move = `${a}${b}`;
    tokens.push({ type: 'move', move });
    i += 2;
  }
  return tokens;
};

const computeSteps = (progression) => {
  const steps = [];
  let board = createInitialBoard();
  let player = BLACK;
  steps.push({
    board,
    player,
    move: null,
    pass: false,
    index: 0,
  });

  const tokens = parseProgression(progression);
  tokens.forEach((token) => {
    if (token.type === 'pass') {
      steps.push({
        board,
        player,
        move: null,
        pass: true,
        index: steps.length,
      });
      player = opponentOf(player);
      return;
    }

    const col = token.move.charCodeAt(0) - 65;
    const row = token.move.charCodeAt(1) - 49;
    const next = placeDisk(board, col, row, player) || board;
    steps.push({
      board: next,
      player,
      move: token.move,
      pass: false,
      index: steps.length,
    });
    board = next;
    player = opponentOf(player);
  });

  return steps;
};

const copyToClipboard = async (value) => {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore
  }
};

const BoardGrid = ({ board, onCellClick, highlight }) => html`
  <div className="board">
    ${board.map((row, y) =>
      row.map((cell, x) => {
        const disk =
          cell === WHITE
            ? html`<div className="disk white"></div>`
            : cell === BLACK
            ? html`<div className="disk black"></div>`
            : null;
        const isHighlight = highlight && highlight[0] === x && highlight[1] === y;
        return html`
          <div
            className=${`cell ${isHighlight ? 'highlight' : ''}`}
            onClick=${onCellClick ? () => onCellClick(x, y) : null}
          >
            ${disk}
          </div>
        `;
      })
    )}
  </div>
`;

const MaskGrid = ({ mask, onCellClick }) => html`
  <div className="board">
    ${mask.map((row, y) =>
      row.map((allowed, x) => html`
        <div
          className=${`mask-cell ${allowed ? 'allowed' : 'blocked'}`}
          onClick=${() => onCellClick(x, y)}
        >
          ${allowed ? '' : 'X'}
        </div>
      `)
    )}
  </div>
`;

const App = () => {
  const [targetBoard, setTargetBoard] = useState(() => createInitialBoard());
  const [blackMask, setBlackMask] = useState(() => createMatrix(true));
  const [whiteMask, setWhiteMask] = useState(() => createMatrix(true));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [progression, setProgression] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState(() => computeSteps(''));

  const whiteOctal = useMemo(() => boardToOctal(targetBoard, WHITE), [targetBoard]);
  const blackOctal = useMemo(() => boardToOctal(targetBoard, BLACK), [targetBoard]);
  const blackMaskOctal = useMemo(() => maskToOctal(blackMask), [blackMask]);
  const whiteMaskOctal = useMemo(() => maskToOctal(whiteMask), [whiteMask]);

  const currentStep = steps[stepIndex] || steps[0];

  const updateBoard = (x, y) => {
    setTargetBoard((prev) => {
      const next = cloneBoard(prev);
      const cell = prev[y][x];
      const nextValue = cell === EMPTY ? BLACK : cell === BLACK ? WHITE : EMPTY;
      next[y][x] = nextValue;
      return next;
    });
  };

  const updateMask = (setter) => (x, y) => {
    setter((prev) => {
      const next = prev.map((row) => row.slice());
      next[y][x] = !next[y][x];
      return next;
    });
  };

  const resetAll = () => {
    setTargetBoard(createMatrix(EMPTY));
    setBlackMask(createMatrix(true));
    setWhiteMask(createMatrix(true));
    setStatus(null);
    setMessage('');
    setProgression('');
    setSteps(computeSteps(''));
    setStepIndex(0);
  };

  const applyInitialBoard = () => {
    setTargetBoard(createInitialBoard());
  };

  const solve = async () => {
    setLoading(true);
    setStatus(null);
    setMessage('');
    setProgression('');
    try {
      const res = await fetch('/api/solve-from-octal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whiteBoard: whiteOctal,
          blackBoard: blackOctal,
          blackMask: blackMaskOctal,
          whiteMask: whiteMaskOctal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Request failed');
      } else {
        setStatus(data.status || 'error');
        if (data.status === 'reachable') {
          setProgression(data.progression || '');
          const nextSteps = computeSteps(data.progression || '');
          setSteps(nextSteps);
          setStepIndex(0);
        } else if (data.status === 'unreachable') {
          setMessage('No valid progression found.');
        } else if (data.status === 'unknown') {
          setMessage('Solver returned unknown.');
        } else if (data.status === 'error') {
          setMessage(data.error || 'Solver error');
        }
      }
    } catch (err) {
      setStatus('error');
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadExample = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/generate-valid-octal');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load example');
      const board = octalToBoard(data.whiteBoard, data.blackBoard);
      const black = octalToMask(data.blackMask);
      const white = octalToMask(data.whiteMask);
      if (board) setTargetBoard(board);
      if (black) setBlackMask(black);
      if (white) setWhiteMask(white);
    } catch (err) {
      setStatus('error');
      setMessage(String(err));
    } finally {
      setLoading(false);
    }
  };

  const stepLabel = () => {
    if (!currentStep) return 'Start';
    if (currentStep.pass) return `Pass (${currentStep.player === BLACK ? 'Black' : 'White'})`;
    if (!currentStep.move) return 'Start';
    return `${currentStep.player === BLACK ? 'Black' : 'White'}: ${currentStep.move}`;
  };

  const highlight = currentStep && currentStep.move
    ? [currentStep.move.charCodeAt(0) - 65, currentStep.move.charCodeAt(1) - 49]
    : null;

  return html`
    <div className="grid" style=${{ gap: '22px' }}>
      <div className="panel">
        <div className="section-title">
          <h2>Target Board (Solution)</h2>
        </div>
        ${BoardGrid({ board: targetBoard, onCellClick: updateBoard })}
        <div className="controls">
          <button className="secondary" onClick=${applyInitialBoard}>Initial board</button>
          <button className="secondary" onClick=${resetAll}>Clear all</button>
        </div>
        <div className="octal-list">
          <div className="octal-item">
            <span>White board octal</span>
            <code>${whiteOctal}</code>
            <button className="secondary" onClick=${() => copyToClipboard(whiteOctal)}>Copy</button>
          </div>
          <div className="octal-item">
            <span>Black board octal</span>
            <code>${blackOctal}</code>
            <button className="secondary" onClick=${() => copyToClipboard(blackOctal)}>Copy</button>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="panel">
          <div className="section-title">
            <h2>Black placement mask</h2>
          </div>
          ${MaskGrid({ mask: blackMask, onCellClick: updateMask(setBlackMask) })}
          <div className="controls">
            <button className="secondary" onClick=${() => setBlackMask(createMatrix(true))}>Allow all</button>
            <button className="secondary" onClick=${() => setBlackMask(createMatrix(false))}>Block all</button>
          </div>
          <div className="octal-list">
            <div className="octal-item">
              <span>Black mask octal</span>
              <code>${blackMaskOctal}</code>
              <button className="secondary" onClick=${() => copyToClipboard(blackMaskOctal)}>Copy</button>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="section-title">
            <h2>White placement mask</h2>
          </div>
          ${MaskGrid({ mask: whiteMask, onCellClick: updateMask(setWhiteMask) })}
          <div className="controls">
            <button className="secondary" onClick=${() => setWhiteMask(createMatrix(true))}>Allow all</button>
            <button className="secondary" onClick=${() => setWhiteMask(createMatrix(false))}>Block all</button>
          </div>
          <div className="octal-list">
            <div className="octal-item">
              <span>White mask octal</span>
              <code>${whiteMaskOctal}</code>
              <button className="secondary" onClick=${() => copyToClipboard(whiteMaskOctal)}>Copy</button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Search</h2>
          ${status
            ? html`<span className=${`status ${status}`}>${status}</span>`
            : null}
        </div>
        <div className="controls">
          <button className="accent" onClick=${solve} disabled=${loading}>
            ${loading ? 'Searching...' : 'Search progression'}
          </button>
          <button className="secondary" onClick=${loadExample} disabled=${loading}>
            Load example
          </button>
        </div>
        ${message ? html`<p className="note">${message}</p>` : null}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Progression viewer</h2>
        </div>
        <div className="result-grid">
          <div>
            ${BoardGrid({
              board: currentStep ? currentStep.board : createInitialBoard(),
              onCellClick: null,
              highlight,
            })}
          </div>
          <div>
            <div className="stepper">
              <button
                className="secondary"
                onClick=${() => setStepIndex(0)}
                disabled=${stepIndex === 0}
              >
                First
              </button>
              <button
                className="secondary"
                onClick=${() => setStepIndex(Math.max(0, stepIndex - 1))}
                disabled=${stepIndex === 0}
              >
                Back
              </button>
              <button
                className="secondary"
                onClick=${() => setStepIndex(Math.min(steps.length - 1, stepIndex + 1))}
                disabled=${stepIndex >= steps.length - 1}
              >
                Next
              </button>
              <button
                className="secondary"
                onClick=${() => setStepIndex(steps.length - 1)}
                disabled=${stepIndex >= steps.length - 1}
              >
                Last
              </button>
            </div>
            <div className="stepper" style=${{ marginTop: '12px' }}>
              <input
                type="range"
                min="0"
                max=${Math.max(0, steps.length - 1)}
                value=${stepIndex}
                onInput=${(e) => setStepIndex(Number(e.target.value))}
              />
              <div>
                Step ${stepIndex} / ${Math.max(0, steps.length - 1)}
              </div>
            </div>
            <p className="note">${stepLabel()}</p>
            ${progression
              ? html`<div className="octal-item">
                  <span>Progression string</span>
                  <code>${progression}</code>
                  <button className="secondary" onClick=${() => copyToClipboard(progression)}>
                    Copy
                  </button>
                </div>`
              : html`<p className="note">Run search to show steps.</p>`}
          </div>
        </div>
      </div>
    </div>
  `;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
