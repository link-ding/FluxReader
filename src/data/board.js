const DEFAULT_BOARD = { cards: [], shapes: [], connections: [] };
const CARD_OFFSET = 36;

export function loadBoard(bookId) {
  try {
    const board = JSON.parse(localStorage.getItem(`board-${bookId}`) || 'null');
    return {
      cards: board?.cards || [],
      shapes: board?.shapes || [],
      connections: board?.connections || [],
    };
  } catch {
    return DEFAULT_BOARD;
  }
}

export function saveBoard(bookId, board) {
  localStorage.setItem(`board-${bookId}`, JSON.stringify({
    cards: board.cards || [],
    shapes: board.shapes || [],
    connections: board.connections || [],
  }));
}

export function addBoardCard(bookId, card) {
  const board = loadBoard(bookId);
  const offset = (board.cards.length % 8) * CARD_OFFSET;
  const next = {
    ...board,
    cards: [
      ...board.cards,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x: 120 + offset,
        y: 80 + offset,
        quote: '',
        note: '',
        source: 'Note',
        ...card,
      },
    ],
  };
  saveBoard(bookId, next);
  return next;
}
