import type { Board } from '../lib/reversi'
import { BLACK, WHITE } from '../lib/reversi'

const BoardGrid = ({
  board,
  onCellClick,
  highlight,
  className,
}: {
  board: Board
  onCellClick?: (x: number, y: number) => void
  highlight?: [number, number] | null
  className?: string
}) => (
  <div className={`board ${className ?? ''}`.trim()}>
    {board.map((row, y) =>
      row.map((cell, x) => {
        const disk =
          cell === WHITE ? (
            <div className="disk white" />
          ) : cell === BLACK ? (
            <div className="disk black" />
          ) : null
        const isHighlight = highlight && highlight[0] === x && highlight[1] === y
        return (
          <div
            key={`${x}-${y}`}
            className={`cell ${isHighlight ? 'highlight' : ''}`}
            onClick={onCellClick ? () => onCellClick(x, y) : undefined}
          >
            {disk}
          </div>
        )
      }),
    )}
  </div>
)

export default BoardGrid
