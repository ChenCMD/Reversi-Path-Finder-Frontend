import type { Board } from '../lib/reversi'
import { BLACK, WHITE } from '../lib/reversi'

const BoardGrid = ({
  board,
  onCellClick,
  highlight,
  highlights,
  className,
}: {
  board: Board
  onCellClick?: (x: number, y: number) => void
  highlight?: [number, number] | null
  highlights?: [number, number][]
  className?: string
}) => {
  return (
    <div className={`board ${className ?? ''}`.trim()}>
      {board.map((row, y) =>
        row.map((cell, x) => {
          const disk =
            cell === WHITE ? (
              <div className="disk white" />
            ) : cell === BLACK ? (
              <div className="disk black" />
            ) : null
          const hasSingleHighlight = highlight && highlight[0] === x && highlight[1] === y
          const hasMultiHighlight = highlights?.some(([hx, hy]) => hx === x && hy === y)
          const isHighlight = Boolean(hasSingleHighlight || hasMultiHighlight)
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
}

export default BoardGrid
