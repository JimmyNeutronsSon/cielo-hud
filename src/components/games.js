import { createPanel } from './panel.js';

export function buildGames(root, vw, vh, onRemove) {
  const panel = createPanel(root, {
    key: "games",
    x: Math.max(24, Math.floor(vw / 2 - 150)),
    y: 180,
    width: 300,
    height: 360,
    title: "Games",
    body: `
      <div class="lg-games" style="display:flex;flex-direction:column;height:100%;color:#b0c4de;">
        <div class="lg-games-status" style="text-align:center;font-size:13px;margin-bottom:8px;color:#fff;">Tic-Tac-Toe — X's turn</div>
        <div class="lg-games-board" style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:6px;flex:1;">
        </div>
        <button class="lg-games-reset" style="margin-top:10px;padding:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;">Reset</button>
      </div>
    `
  }, onRemove);

  const board = panel.querySelector(".lg-games-board");
  const status = panel.querySelector(".lg-games-status");
  const resetBtn = panel.querySelector(".lg-games-reset");

  let cells = Array(9).fill(null);
  let turn = "X";
  let over = false;

  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function checkWinner() {
    for (const [a, b, c] of wins) {
      if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
    }
    if (cells.every(Boolean)) return "draw";
    return null;
  }

  function render() {
    board.innerHTML = "";
    cells.forEach((val, i) => {
      const btn = document.createElement("button");
      btn.textContent = val || "";
      btn.style.cssText = "font-size:22px;font-weight:700;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;cursor:pointer;";
      btn.addEventListener("click", () => handleMove(i));
      board.appendChild(btn);
    });
  }

  function handleMove(i) {
    if (over || cells[i]) return;
    cells[i] = turn;
    const result = checkWinner();
    if (result) {
      over = true;
      status.textContent = result === "draw" ? "It's a draw!" : `${result} wins!`;
    } else {
      turn = turn === "X" ? "O" : "X";
      status.textContent = `Tic-Tac-Toe — ${turn}'s turn`;
    }
    render();
  }

  resetBtn.addEventListener("click", () => {
    cells = Array(9).fill(null);
    turn = "X";
    over = false;
    status.textContent = "Tic-Tac-Toe — X's turn";
    render();
  });

  render();

  return panel;
}
