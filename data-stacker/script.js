(() => {
  "use strict";

  const COLUMNS = 6;
  const ROWS = 10;
  const PIECES = [
    { name: "Single", shape: [[1]] },
    { name: "Vertical", shape: [[1], [1]] },
    { name: "Horizontal", shape: [[1, 1]] },
    { name: "Rollback", shape: [[1]], rollback: true }
  ];

  const scenarios = [
    { title: "Level 1: Weekly Timesheet", targets: [4, 4, 4, 4, 4, 4], speed: 760 },
    { title: "Level 2: Growth Trend", targets: [1, 2, 3, 4, 5, 6], speed: 680 },
    { title: "Level 3: Server Spike", targets: [2, 4, 8, 7, 3, 1], speed: 610 }
  ];

  const elements = {
    board: document.querySelector("#board"),
    targets: document.querySelector("#targets"),
    level: document.querySelector("#level-value"),
    scenario: document.querySelector("#scenario-value"),
    score: document.querySelector("#score-value"),
    preview: document.querySelector("#next-preview"),
    message: document.querySelector("#status-message"),
    columnStatus: document.querySelector("#column-status"),
    overlay: document.querySelector("#game-overlay"),
    overlayKicker: document.querySelector("#overlay-kicker"),
    overlayTitle: document.querySelector("#overlay-title"),
    overlayCopy: document.querySelector("#overlay-copy"),
    restart: document.querySelector("#restart-button"),
    sound: document.querySelector("#sound-button")
  };

  let board = [];
  let level = 1;
  let score = 0;
  let targetHeights = [];
  let currentPiece = null;
  let nextPiece = null;
  let active = false;
  let timerId = 0;
  let speed = 760;
  let soundEnabled = false;
  let audioContext = null;

  function track(eventName, values = {}) {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, { game_name: "Data Stacker", ...values });
    }
  }

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLUMNS).fill(0));
  }

  function cloneShape(shape) {
    return shape.map((row) => [...row]);
  }

  function randomPiece() {
    const roll = Math.random();
    const type = roll < 0.08 ? PIECES[3] : PIECES[Math.floor(Math.random() * 3)];
    return {
      name: type.name,
      shape: cloneShape(type.shape),
      rollback: Boolean(type.rollback),
      x: 0,
      y: 0
    };
  }

  function scenarioForLevel() {
    if (level <= scenarios.length) return scenarios[level - 1];
    return {
      title: `Level ${level}: Audit Mode`,
      targets: Array.from({ length: COLUMNS }, () => Math.floor(Math.random() * 8) + 1),
      speed: Math.max(280, 680 - (level - 3) * 45)
    };
  }

  function spawnPiece() {
    currentPiece = nextPiece || randomPiece();
    nextPiece = randomPiece();
    currentPiece.x = Math.floor((COLUMNS - currentPiece.shape[0].length) / 2);
    currentPiece.y = 0;
    renderPreview();
    if (!canPlace(currentPiece.x, currentPiece.y, currentPiece.shape)) endGame();
  }

  function activeCells(piece = currentPiece, x = piece?.x, y = piece?.y, shape = piece?.shape) {
    const cells = [];
    shape?.forEach((row, rowIndex) => {
      row.forEach((filled, columnIndex) => {
        if (filled) cells.push({ x: x + columnIndex, y: y + rowIndex });
      });
    });
    return cells;
  }

  function canPlace(x, y, shape) {
    return activeCells(currentPiece, x, y, shape).every((cell) =>
      cell.x >= 0
      && cell.x < COLUMNS
      && cell.y < ROWS
      && (cell.y < 0 || board[cell.y][cell.x] === 0)
    );
  }

  function columnHeights() {
    return Array.from({ length: COLUMNS }, (_, column) => {
      let height = 0;
      for (let row = ROWS - 1; row >= 0; row -= 1) {
        if (board[row][column] === 1) height += 1;
        else if (height) break;
      }
      return height;
    });
  }

  function columnStates() {
    const heights = columnHeights();
    return heights.map((height, index) => {
      if (height === targetHeights[index]) return "matched";
      if (height > targetHeights[index]) return "overflow";
      return "below";
    });
  }

  function renderPreview() {
    elements.preview.replaceChildren();
    if (!nextPiece) return;
    nextPiece.shape.forEach((row) => {
      row.forEach((filled) => {
        if (!filled) return;
        const block = document.createElement("i");
        block.className = `preview-block${nextPiece.rollback ? " rollback" : ""}`;
        elements.preview.append(block);
      });
    });
  }

  function render() {
    if (active && columnStates().every((state) => state === "matched")) {
      completeLevel();
      return;
    }
    const activeKeys = currentPiece
      ? new Set(activeCells().map((cell) => `${cell.x},${cell.y}`))
      : new Set();
    elements.board.replaceChildren();
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const cell = document.createElement("div");
        const isActive = activeKeys.has(`${column},${row}`);
        cell.className = "cell";
        cell.setAttribute("role", "gridcell");
        if (board[row][column]) {
          cell.classList.add("filled");
          const state = columnStates()[column];
          if (state === "matched") cell.classList.add("matched");
          if (state === "overflow") cell.classList.add("overflow");
        }
        if (isActive) cell.classList.add(currentPiece.rollback ? "rollback" : "active");
        elements.board.append(cell);
      }
    }
    const heights = columnHeights();
    const states = columnStates();
    elements.targets.replaceChildren();
    states.forEach((state, index) => {
      const target = document.createElement("div");
      target.className = `target${state === "matched" ? " matched" : state === "overflow" ? " overflow" : ""}`;
      target.innerHTML = `<span>Col ${index + 1}</span><b>${heights[index]}/${targetHeights[index]}</b>`;
      elements.targets.append(target);
    });
    const matched = states.filter((state) => state === "matched").length;
    elements.columnStatus.textContent = `${matched} / ${COLUMNS} matched`;
    elements.level.textContent = level;
    elements.score.textContent = score.toLocaleString();
  }

  function startTimer() {
    window.clearInterval(timerId);
    timerId = window.setInterval(tick, speed);
  }

  function tick() {
    if (!active || !currentPiece) return;
    if (canPlace(currentPiece.x, currentPiece.y + 1, currentPiece.shape)) {
      currentPiece.y += 1;
    } else {
      lockPiece();
    }
    render();
  }

  function moveHorizontal(direction) {
    if (!active || !canPlace(currentPiece.x + direction, currentPiece.y, currentPiece.shape)) return;
    currentPiece.x += direction;
    render();
    playTone(280);
  }

  function softDrop() {
    if (!active) return;
    if (canPlace(currentPiece.x, currentPiece.y + 1, currentPiece.shape)) {
      currentPiece.y += 1;
      score += 1;
      render();
    } else {
      lockPiece();
    }
  }

  function hardDrop() {
    if (!active) return;
    let distance = 0;
    while (canPlace(currentPiece.x, currentPiece.y + 1, currentPiece.shape)) {
      currentPiece.y += 1;
      distance += 1;
    }
    score += distance * 2;
    lockPiece();
    playTone(180);
  }

  function rotatePiece() {
    if (!active || currentPiece.rollback) return;
    const rotated = currentPiece.shape[0].map((_, column) =>
      currentPiece.shape.map((row) => row[column]).reverse()
    );
    const offsets = [0, -1, 1, -2, 2];
    for (const offset of offsets) {
      if (canPlace(currentPiece.x + offset, currentPiece.y, rotated)) {
        currentPiece.shape = rotated;
        currentPiece.x += offset;
        render();
        playTone(420);
        return;
      }
    }
  }

  function lockPiece() {
    if (!currentPiece) return;
    const cells = activeCells();
    if (currentPiece.rollback) {
      const column = cells[0].x;
      const topRow = board.findIndex((row) => row[column] === 1);
      if (topRow >= 0) board[topRow][column] = 0;
      score += 25;
      elements.message.textContent = `Rollback removed the top block from column ${column + 1}.`;
      playTone(130);
    } else {
      if (cells.some((cell) => cell.y < 0)) {
        endGame();
        return;
      }
      cells.forEach((cell) => {
        if (cell.y >= 0) board[cell.y][cell.x] = 1;
      });
      score += cells.length * 10;
      compactColumns();
      playTone(330);
    }

    if (columnHeights().some((height) => height > ROWS)) {
      endGame();
      return;
    }
    if (columnStates().every((state) => state === "matched")) {
      completeLevel();
      return;
    }
    const overflowIndex = columnStates().findIndex((state) => state === "overflow");
    if (overflowIndex >= 0 && !nextPiece?.rollback) {
      render();
      endGame(`Column ${overflowIndex + 1} has overflowed and the next piece is not a rollback.`);
      return;
    }
    spawnPiece();
    render();
  }

  function compactColumns() {
    for (let column = 0; column < COLUMNS; column += 1) {
      const blocks = board.map((row) => row[column]).filter(Boolean).length;
      for (let row = 0; row < ROWS - blocks; row += 1) board[row][column] = 0;
      for (let row = ROWS - blocks; row < ROWS; row += 1) board[row][column] = 1;
    }
  }

  function completeLevel() {
    if (!active) return;
    active = false;
    window.clearInterval(timerId);
    currentPiece = null;
    render();
    score += level * 500;
    elements.score.textContent = score.toLocaleString();
    elements.message.textContent = "Dataset Compiled!";
    elements.overlayKicker.textContent = `Level ${level} complete`;
    elements.overlayTitle.textContent = "Dataset Compiled!";
    elements.overlayCopy.textContent = `Perfect match. ${level * 500} bonus points added.`;
    elements.restart.textContent = "Next Level";
    elements.overlay.hidden = false;
    track("data_stacker_level_complete", { level, score });
    playTone(720);
  }

  function endGame(reason = "") {
    active = false;
    window.clearInterval(timerId);
    elements.overlayKicker.textContent = "Run ended";
    elements.overlayTitle.textContent = reason ? "No Safe Move" : "Dataset Overflow";
    elements.overlayCopy.textContent = reason
      ? `${reason} Final score: ${score.toLocaleString()}.`
      : `The stack hit the ceiling at level ${level}. Final score: ${score.toLocaleString()}.`;
    elements.restart.textContent = "Restart";
    elements.overlay.hidden = false;
    track("data_stacker_game_over", { level, score, reason: reason || "ceiling" });
  }

  function beginLevel() {
    const scenario = scenarioForLevel();
    targetHeights = [...scenario.targets];
    elements.scenario.textContent = scenario.title;
    speed = scenario.speed;
    board = emptyBoard();
    nextPiece = null;
    active = true;
    elements.overlay.hidden = true;
    elements.message.textContent = "Match all six target heights.";
    spawnPiece();
    startTimer();
    render();
    track("data_stacker_level_start", { level, title: scenario.title });
  }

  function restartOrAdvance() {
    if (elements.restart.textContent === "Next Level") {
      level += 1;
    } else {
      level = 1;
      score = 0;
    }
    beginLevel();
  }

  function playTone(frequency) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.11);
    } catch (error) {
      console.warn("Data Stacker sound is unavailable.", error);
    }
  }

  function handleAction(action) {
    const actions = {
      left: () => moveHorizontal(-1),
      right: () => moveHorizontal(1),
      rotate: rotatePiece,
      down: softDrop,
      drop: hardDrop
    };
    actions[action]?.();
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
  document.addEventListener("keydown", (event) => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
    const actionByKey = {
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
      ArrowUp: "rotate", w: "rotate", W: "rotate",
      ArrowDown: "down", s: "down", S: "down",
      " ": "drop"
    };
    const action = actionByKey[event.key];
    if (action) {
      event.preventDefault();
      handleAction(action);
    }
  });
  elements.restart.addEventListener("click", restartOrAdvance);
  elements.sound.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    elements.sound.setAttribute("aria-pressed", String(soundEnabled));
    elements.sound.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
    playTone(520);
  });

  beginLevel();
})();
