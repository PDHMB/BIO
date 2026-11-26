(() => {
  "use strict";

  const SYMBOLS = ["SQL", "PBI", "PYT", "DAX", "ETL", "KPI", "HRA", "CSV", "XLS"];
  const SYMBOL_META = {
    SQL: { name: "Database", icon: "🗄️", className: "sql" },
    PBI: { name: "Power BI", icon: "📊", className: "pbi" },
    PYT: { name: "Python", icon: "🐍", className: "pyt" },
    DAX: { name: "Power BI Language", icon: "📘", className: "dax" },
    ETL: { name: "Data Pipeline", icon: "🔄", className: "etl" },
    KPI: { name: "Metric", icon: "📈", className: "kpi" },
    HRA: { name: "HR Analytics", icon: "👥", className: "hra" },
    CSV: { name: "Dataset", icon: "📄", className: "csv" },
    XLS: { name: "Excel Spreadsheet", icon: "📗", className: "xls" }
  };
  const DIFFICULTIES = {
    easy: { clues: 44, multiplier: 1 },
    medium: { clues: 36, multiplier: 1.35 },
    hard: { clues: 28, multiplier: 1.7 }
  };
  const STORAGE_KEYS = {
    progress: "datadoku-progress",
    records: "datadoku-records",
    achievements: "datadoku-achievements",
    theme: "datadoku-theme",
    sound: "datadoku-sound",
    welcomed: "datadoku-welcomed"
  };

  const elements = {
    board: document.querySelector("#board"),
    pad: document.querySelector("#symbol-pad"),
    timer: document.querySelector("#timer"),
    hintsLeft: document.querySelector("#hints-left"),
    score: document.querySelector("#score"),
    difficultyLabel: document.querySelector("#difficulty-label"),
    message: document.querySelector("#message"),
    leaderboard: document.querySelector("#leaderboard"),
    achievements: document.querySelector("#achievements"),
    welcomeModal: document.querySelector("#welcome-modal"),
    winModal: document.querySelector("#win-modal"),
    themeButton: document.querySelector("#theme-button"),
    soundButton: document.querySelector("#sound-button"),
    canvas: document.querySelector("#confetti")
  };

  let solution = [];
  let puzzle = [];
  let values = [];
  let givens = [];
  let selectedIndex = -1;
  let difficulty = "medium";
  let daily = false;
  let elapsed = 0;
  let startedAt = 0;
  let timerId = 0;
  let hintsUsed = 0;
  let completed = false;
  let soundEnabled = false;
  let lastFocusedElement = null;
  let audioContext = null;
  let placedIndex = -1;

  /* ---------- Storage and analytics ---------- */

  function track(name, parameters = {}) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, { game_name: "DataDoku", ...parameters });
    }
  }

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn(`DataDoku could not read ${key}.`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`DataDoku could not save ${key}.`, error);
      return false;
    }
  }

  function dailyKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function createSeed(text) {
    let seed = 2166136261;
    [...text].forEach((character) => {
      seed ^= character.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    });
    return seed >>> 0;
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let result = state;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random = Math.random) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  /* ---------- Puzzle generation and validation ---------- */

  function pattern(row, column) {
    return (row * 3 + Math.floor(row / 3) + column) % 9;
  }

  function generateSolution(random) {
    const rowGroups = shuffle([0, 1, 2], random);
    const columnGroups = shuffle([0, 1, 2], random);
    const rows = rowGroups.flatMap((group) => shuffle([0, 1, 2], random).map((row) => group * 3 + row));
    const columns = columnGroups.flatMap((group) => shuffle([0, 1, 2], random).map((column) => group * 3 + column));
    const numbers = shuffle([...Array(9)].map((_, index) => index), random);
    return rows.flatMap((row) => columns.map((column) => numbers[pattern(row, column)]));
  }

  function boardConflicts(board) {
    const conflicts = new Set();
    const checkGroup = (indexes) => {
      const seen = new Map();
      indexes.forEach((index) => {
        const value = board[index];
        if (value === -1) return;
        if (seen.has(value)) {
          conflicts.add(index);
          conflicts.add(seen.get(value));
        } else {
          seen.set(value, index);
        }
      });
    };
    for (let unit = 0; unit < 9; unit += 1) {
      checkGroup([...Array(9)].map((_, column) => unit * 9 + column));
      checkGroup([...Array(9)].map((_, row) => row * 9 + unit));
    }
    for (let boxRow = 0; boxRow < 3; boxRow += 1) {
      for (let boxColumn = 0; boxColumn < 3; boxColumn += 1) {
        checkGroup([...Array(9)].map((_, offset) => {
          const row = boxRow * 3 + Math.floor(offset / 3);
          const column = boxColumn * 3 + (offset % 3);
          return row * 9 + column;
        }));
      }
    }
    return conflicts;
  }

  function isPlaceable(board, index, value) {
    const row = Math.floor(index / 9);
    const column = index % 9;
    const boxRow = Math.floor(row / 3) * 3;
    const boxColumn = Math.floor(column / 3) * 3;
    for (let offset = 0; offset < 9; offset += 1) {
      if (board[row * 9 + offset] === value) return false;
      if (board[offset * 9 + column] === value) return false;
      const boxIndex = (boxRow + Math.floor(offset / 3)) * 9 + boxColumn + (offset % 3);
      if (board[boxIndex] === value) return false;
    }
    return true;
  }

  function countSolutions(input, limit = 2) {
    const board = [...input];
    let count = 0;
    function solve() {
      if (count >= limit) return;
      let bestIndex = -1;
      let bestOptions = null;
      for (let index = 0; index < 81; index += 1) {
        if (board[index] !== -1) continue;
        const options = [];
        for (let value = 0; value < 9; value += 1) {
          if (isPlaceable(board, index, value)) options.push(value);
        }
        if (!options.length) return;
        if (!bestOptions || options.length < bestOptions.length) {
          bestIndex = index;
          bestOptions = options;
          if (options.length === 1) break;
        }
      }
      if (bestIndex === -1) {
        count += 1;
        return;
      }
      bestOptions.forEach((value) => {
        if (count >= limit) return;
        board[bestIndex] = value;
        solve();
        board[bestIndex] = -1;
      });
    }
    solve();
    return count;
  }

  function removeClues(fullBoard, targetClues, random) {
    const puzzleBoard = [...fullBoard];
    let clues = 81;
    for (const index of shuffle([...Array(81)].map((_, item) => item), random)) {
      if (clues <= targetClues) break;
      const previous = puzzleBoard[index];
      puzzleBoard[index] = -1;
      if (countSolutions(puzzleBoard, 2) === 1) {
        clues -= 1;
      } else {
        puzzleBoard[index] = previous;
      }
    }
    return puzzleBoard;
  }

  function generatePuzzle(level, isDaily) {
    const random = isDaily
      ? seededRandom(createSeed(`DataDoku-${dailyKey()}-${level}`))
      : Math.random;
    const solved = generateSolution(random);
    const targetClues = DIFFICULTIES[level].clues;
    return { solution: solved, puzzle: removeClues(solved, targetClues, random) };
  }

  /* ---------- Game state ---------- */

  function startTimer() {
    stopTimer();
    startedAt = Date.now() - elapsed * 1000;
    timerId = window.setInterval(() => {
      if (completed) return;
      elapsed = Math.floor((Date.now() - startedAt) / 1000);
      renderStatus();
      saveProgress();
    }, 1000);
  }

  function stopTimer() {
    if (timerId) window.clearInterval(timerId);
    timerId = 0;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function currentScore() {
    if (!completed) return Math.max(0, Math.round((10000 - elapsed * 7 - hintsUsed * 500) * DIFFICULTIES[difficulty].multiplier));
    return Math.max(100, Math.round((10000 - elapsed * 7 - hintsUsed * 500) * DIFFICULTIES[difficulty].multiplier));
  }

  function saveProgress() {
    if (completed || !puzzle.length) return;
    writeStorage(STORAGE_KEYS.progress, {
      difficulty, daily, date: dailyKey(), solution, puzzle, values, elapsed, hintsUsed
    });
  }

  function restoreProgress() {
    const saved = readStorage(STORAGE_KEYS.progress, null);
    if (!saved || saved.daily !== daily || !Array.isArray(saved.values) || saved.values.length !== 81) return false;
    if (daily && saved.date !== dailyKey()) return false;
    if (!DIFFICULTIES[saved.difficulty]) return false;
    difficulty = saved.difficulty;
    solution = saved.solution;
    puzzle = saved.puzzle;
    values = saved.values;
    givens = puzzle.map((value) => value !== -1);
    elapsed = Number(saved.elapsed) || 0;
    hintsUsed = Number(saved.hintsUsed) || 0;
    completed = false;
    return true;
  }

  function newGame(options = {}) {
    if (options.difficulty) difficulty = options.difficulty;
    if (typeof options.daily === "boolean") daily = options.daily;
    selectedIndex = -1;
    elapsed = 0;
    hintsUsed = 0;
    completed = false;
    const generated = generatePuzzle(difficulty, daily);
    solution = generated.solution;
    puzzle = generated.puzzle;
    values = [...puzzle];
    givens = puzzle.map((value) => value !== -1);
    renderAll();
    startTimer();
    saveProgress();
    track("datadoku_start", { difficulty, mode: daily ? "daily" : "free" });
  }

  function resetGame() {
    values = [...puzzle];
    selectedIndex = -1;
    elapsed = 0;
    hintsUsed = 0;
    completed = false;
    renderAll();
    startTimer();
    saveProgress();
    setMessage("Puzzle reset. Your original clues are unchanged.");
    track("datadoku_reset", { difficulty, mode: daily ? "daily" : "free" });
  }

  /* ---------- UI ---------- */

  function createSymbolPad() {
    elements.pad.replaceChildren();
    [...SYMBOLS].sort().forEach((symbol) => {
      const index = SYMBOLS.indexOf(symbol);
      const meta = SYMBOL_META[symbol];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `symbol-button symbol-${meta.className}`;
      button.innerHTML = `<span class="symbol-badge symbol-${meta.className}" aria-hidden="true"><span class="symbol-icon">${meta.icon}</span>${symbol}</span>`;
      button.dataset.value = index;
      button.dataset.symbol = symbol;
      button.dataset.tooltip = `${symbol} = ${meta.name}`;
      button.title = `${symbol} = ${meta.name}`;
      button.setAttribute("aria-label", `${symbol}: ${meta.name}`);
      elements.pad.append(button);
    });
    const erase = document.createElement("button");
    erase.type = "button";
    erase.className = "symbol-button erase";
    erase.textContent = "⌫";
    erase.dataset.value = "-1";
    erase.setAttribute("aria-label", "Erase selected cell");
    elements.pad.append(erase);
  }

  function isRelated(first, second) {
    const rowA = Math.floor(first / 9);
    const rowB = Math.floor(second / 9);
    const columnA = first % 9;
    const columnB = second % 9;
    return rowA === rowB || columnA === columnB
      || (Math.floor(rowA / 3) === Math.floor(rowB / 3) && Math.floor(columnA / 3) === Math.floor(columnB / 3));
  }

  function sameRow(first, second) {
    return Math.floor(first / 9) === Math.floor(second / 9);
  }

  function sameColumn(first, second) {
    return first % 9 === second % 9;
  }

  function sameBox(first, second) {
    return Math.floor(first / 27) === Math.floor(second / 27)
      && Math.floor((first % 9) / 3) === Math.floor((second % 9) / 3);
  }

  function updateCompletedSymbols() {
    const complete = new Set(
      SYMBOLS.filter((_, value) => values.filter((entry) => entry === value).length === 9)
    );
    document.querySelectorAll(".symbol-button[data-symbol], [data-symbol]").forEach((element) => {
      element.classList.toggle("symbol-complete", complete.has(element.dataset.symbol));
      element.setAttribute("aria-disabled", String(complete.has(element.dataset.symbol)));
    });
  }

  function renderBoard() {
    elements.board.replaceChildren();
    const conflicts = boardConflicts(values);
    for (let index = 0; index < 81; index += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = index;
      cell.setAttribute("role", "gridcell");
      const value = values[index];
      if (value !== -1) {
        const symbol = SYMBOLS[value];
        const meta = SYMBOL_META[symbol];
        cell.innerHTML = `<span class="symbol-badge symbol-${meta.className}" title="${symbol} = ${meta.name}"><span class="symbol-icon" aria-hidden="true">${meta.icon}</span><span>${symbol}</span></span>`;
      }
      cell.setAttribute("aria-label", `Row ${Math.floor(index / 9) + 1}, column ${(index % 9) + 1}, ${value === -1 ? "empty" : `${SYMBOLS[value]}: ${SYMBOL_META[SYMBOLS[value]].name}`}${givens[index] ? ", given" : ""}`);
      if (givens[index]) cell.classList.add("given");
      if (index === selectedIndex) cell.classList.add("selected");
      if (selectedIndex >= 0 && index !== selectedIndex) {
        if (sameRow(index, selectedIndex)) cell.classList.add("related-row");
        if (sameColumn(index, selectedIndex)) cell.classList.add("related-column");
        if (sameBox(index, selectedIndex)) cell.classList.add("related-box");
        if (value !== -1 && value === values[selectedIndex]) cell.classList.add("same");
      }
      if (conflicts.has(index)) cell.classList.add("conflict");
      if (index === placedIndex) cell.classList.add("placed");
      elements.board.append(cell);
    }
    placedIndex = -1;
    updateCompletedSymbols();
  }

  function renderStatus() {
    elements.timer.textContent = formatTime(elapsed);
    elements.hintsLeft.textContent = Math.max(0, 3 - hintsUsed);
    elements.score.textContent = puzzle.length && values.includes(-1) ? currentScore() : (completed ? currentScore() : "—");
    elements.difficultyLabel.textContent = difficulty[0].toUpperCase() + difficulty.slice(1);
    document.querySelectorAll("[data-difficulty]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty));
    });
    document.querySelector("#daily-button").setAttribute("aria-pressed", String(daily));
  }

  function renderAll() {
    renderBoard();
    renderStatus();
    renderRecords();
    renderAchievements();
  }

  function setMessage(message, type = "") {
    elements.message.textContent = message;
    elements.message.className = `message${type ? ` ${type}` : ""}`;
  }

  function renderRecords() {
    const records = readStorage(STORAGE_KEYS.records, [])
      .filter((record) => record && Number.isFinite(record.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    elements.leaderboard.replaceChildren();
    if (!records.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "Complete a puzzle to set your first score.";
      elements.leaderboard.append(empty);
      return;
    }
    records.forEach((record) => {
      const item = document.createElement("li");
      item.innerHTML = `<strong>${record.score.toLocaleString()}</strong> · ${record.difficulty} · ${formatTime(record.elapsed)}`;
      elements.leaderboard.append(item);
    });
  }

  function renderAchievements() {
    const unlocked = new Set(readStorage(STORAGE_KEYS.achievements, []));
    const definitions = [
      ["first", "✓", "First model", "Complete your first puzzle"],
      ["clean", "◎", "Clean analysis", "Win without using a hint"],
      ["fast", "⚡", "Quick query", "Finish in under ten minutes"],
      ["hard", "◆", "Deep dive", "Complete a hard puzzle"]
    ];
    elements.achievements.replaceChildren();
    definitions.forEach(([id, icon, title, description]) => {
      const item = document.createElement("div");
      item.className = `achievement${unlocked.has(id) ? " unlocked" : ""}`;
      item.innerHTML = `<span class="achievement-icon">${icon}</span><span><strong>${title}</strong><span>${description}</span></span>`;
      elements.achievements.append(item);
    });
  }

  function saveRecord() {
    const records = readStorage(STORAGE_KEYS.records, []);
    records.push({ score: currentScore(), elapsed, difficulty, date: new Date().toISOString() });
    writeStorage(STORAGE_KEYS.records, records.sort((a, b) => b.score - a.score).slice(0, 10));
    const achievements = new Set(readStorage(STORAGE_KEYS.achievements, []));
    achievements.add("first");
    if (hintsUsed === 0) achievements.add("clean");
    if (elapsed < 600) achievements.add("fast");
    if (difficulty === "hard") achievements.add("hard");
    writeStorage(STORAGE_KEYS.achievements, [...achievements]);
    localStorage.removeItem(STORAGE_KEYS.progress);
  }

  /* ---------- Interactions ---------- */

  function selectCell(index) {
    if (completed) return;
    selectedIndex = index;
    renderBoard();
  }

  function enterValue(value) {
    if (completed) return;
    if (selectedIndex < 0) {
      setMessage("Select an empty cell first.", "error");
      return;
    }
    if (givens[selectedIndex]) {
      setMessage("This clue is fixed by the puzzle.", "error");
      playTone("error");
      return;
    }
    values[selectedIndex] = value;
    placedIndex = selectedIndex;
    renderBoard();
    saveProgress();
    const conflicts = boardConflicts(values);
    if (conflicts.has(selectedIndex) && value !== -1) {
      setMessage(`Conflict: ${SYMBOLS[value]} is already used in this row, column, or section.`, "error");
      playTone("error");
    } else {
      setMessage(value === -1 ? "Cell cleared." : `${SYMBOLS[value]} added.`);
      playTone("place");
    }
    if (!values.includes(-1) && boardConflicts(values).size === 0 && values.every((entry, index) => entry === solution[index])) {
      finishGame();
    }
  }

  function useHint() {
    if (completed) return;
    if (hintsUsed >= 3) {
      setMessage("You have used all three hints.", "error");
      return;
    }
    const emptyIndexes = values.map((value, index) => value !== solution[index] && !givens[index] ? index : -1).filter((index) => index >= 0);
    if (!emptyIndexes.length) {
      checkSolution();
      return;
    }
    const index = emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
    selectedIndex = index;
    values[index] = solution[index];
    hintsUsed += 1;
    renderAll();
    const cell = elements.board.querySelector(`[data-index="${index}"]`);
    cell?.classList.add("hinted");
    saveProgress();
    setMessage(`Hint used: ${SYMBOLS[solution[index]]} is correct in this cell.`);
    playTone("hint");
    track("datadoku_hint", { hints_used: hintsUsed, difficulty });
    if (!values.includes(-1) && values.every((entry, cellIndex) => entry === solution[cellIndex])) finishGame();
  }

  function checkSolution() {
    if (completed) return;
    const conflicts = boardConflicts(values);
    const incorrect = values.some((value, index) => value !== -1 && value !== solution[index]);
    if (conflicts.size) {
      renderBoard();
      setMessage(`There are ${conflicts.size} conflicting cells.`, "error");
    } else if (incorrect) {
      setMessage("No row conflicts, but at least one entered symbol does not match the solution.", "error");
    } else if (values.includes(-1)) {
      setMessage("Everything entered so far is correct. Keep analysing.", "success");
    } else {
      finishGame();
    }
    playTone(incorrect || conflicts.size ? "error" : "hint");
  }

  function finishGame() {
    completed = true;
    stopTimer();
    saveRecord();
    const score = currentScore();
    document.querySelector("#win-time").textContent = formatTime(elapsed);
    document.querySelector("#win-score").textContent = score.toLocaleString();
    document.querySelector("#win-hints").textContent = hintsUsed;
    document.querySelector("#win-message").textContent = `You completed the ${difficulty} ${daily ? "daily challenge" : "puzzle"} with all nine analytics concepts.`;
    renderAll();
    setMessage(`Solved in ${formatTime(elapsed)}. Score: ${score.toLocaleString()}.`, "success");
    openModal(elements.winModal);
    launchConfetti();
    playTone("win");
    track("datadoku_complete", { difficulty, mode: daily ? "daily" : "free", elapsed, score, hints: hintsUsed });
  }

  function openModal(modal) {
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    modal.querySelector("button")?.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    lastFocusedElement?.focus();
  }

  /* ---------- Audio, theme, and celebration ---------- */

  function playTone(type) {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const frequencies = { place: 340, hint: 560, error: 150, win: 720 };
      oscillator.frequency.value = frequencies[type] || 340;
      oscillator.type = type === "error" ? "square" : "sine";
      gain.gain.setValueAtTime(0.04, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + (type === "win" ? 0.35 : 0.12));
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + (type === "win" ? 0.36 : 0.13));
    } catch (error) {
      console.warn("DataDoku sound is unavailable.", error);
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    elements.themeButton.textContent = theme === "dark" ? "☀" : "☾";
    elements.themeButton.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
    writeStorage(STORAGE_KEYS.theme, theme);
  }

  function setSound(enabled) {
    soundEnabled = Boolean(enabled);
    elements.soundButton.setAttribute("aria-pressed", String(soundEnabled));
    elements.soundButton.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
    elements.soundButton.textContent = soundEnabled ? "♪" : "♫";
    writeStorage(STORAGE_KEYS.sound, soundEnabled);
  }

  function launchConfetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = elements.canvas;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    context.scale(ratio, ratio);
    const colours = ["#f2c811", "#0756a5", "#47a8ff", "#3dddb4", "#7f5af0"];
    const pieces = Array.from({ length: 150 }, () => ({
      x: Math.random() * innerWidth,
      y: -40 - Math.random() * 220,
      speed: 2 + Math.random() * 4,
      drift: -1.5 + Math.random() * 3,
      size: 5 + Math.random() * 8,
      rotation: Math.random() * Math.PI,
      colour: colours[Math.floor(Math.random() * colours.length)]
    }));
    const start = performance.now();
    function frame(now) {
      context.clearRect(0, 0, innerWidth, innerHeight);
      pieces.forEach((piece) => {
        piece.y += piece.speed;
        piece.x += piece.drift;
        piece.rotation += 0.08;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.colour;
        context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.65);
        context.restore();
      });
      if (now - start < 3000) requestAnimationFrame(frame);
      else context.clearRect(0, 0, innerWidth, innerHeight);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Events and initialisation ---------- */

  function bindEvents() {
    elements.board.addEventListener("click", (event) => {
      const cell = event.target.closest(".cell");
      if (cell) selectCell(Number(cell.dataset.index));
    });
    elements.pad.addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (button) enterValue(Number(button.dataset.value));
    });
    document.addEventListener("keydown", (event) => {
      if (!elements.welcomeModal.hidden || !elements.winModal.hidden) {
        if (event.key === "Escape") {
          [elements.welcomeModal, elements.winModal].forEach((modal) => {
            if (!modal.hidden) closeModal(modal);
          });
        }
        return;
      }
      const number = Number(event.key);
      if (number >= 1 && number <= 9) enterValue(number - 1);
      else if (event.key === "Backspace" || event.key === "Delete") enterValue(-1);
      else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        moveSelection(event.key);
      }
    });
    document.querySelectorAll("[data-difficulty]").forEach((button) => {
      button.addEventListener("click", () => newGame({ difficulty: button.dataset.difficulty, daily: false }));
    });
    document.querySelector("#daily-button").addEventListener("click", () => newGame({ daily: !daily }));
    document.querySelector("#new-game-button").addEventListener("click", () => newGame({ daily: false }));
    document.querySelector("#reset-button").addEventListener("click", resetGame);
    document.querySelector("#hint-button").addEventListener("click", useHint);
    document.querySelector("#check-button").addEventListener("click", checkSolution);
    document.querySelector("#win-new-game").addEventListener("click", () => {
      closeModal(elements.winModal);
      newGame({ daily: false });
    });
    document.querySelector("#help-button").addEventListener("click", () => openModal(elements.welcomeModal));
    document.querySelector("#start-button").addEventListener("click", () => {
      closeModal(elements.welcomeModal);
      writeStorage(STORAGE_KEYS.welcomed, true);
    });
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop")));
    });
    [elements.welcomeModal, elements.winModal].forEach((modal) => {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal(modal);
      });
    });
    elements.themeButton.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
    elements.soundButton.addEventListener("click", () => {
      setSound(!soundEnabled);
      playTone("place");
    });
    window.addEventListener("beforeunload", saveProgress);
  }

  function moveSelection(key) {
    if (selectedIndex < 0) {
      selectedIndex = 0;
    } else {
      const row = Math.floor(selectedIndex / 9);
      const column = selectedIndex % 9;
      if (key === "ArrowUp" && row > 0) selectedIndex -= 9;
      if (key === "ArrowDown" && row < 8) selectedIndex += 9;
      if (key === "ArrowLeft" && column > 0) selectedIndex -= 1;
      if (key === "ArrowRight" && column < 8) selectedIndex += 1;
    }
    renderBoard();
  }

  function initialise() {
    try {
      createSymbolPad();
      const savedTheme = readStorage(STORAGE_KEYS.theme, null);
      applyTheme(savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
      setSound(readStorage(STORAGE_KEYS.sound, false));
      bindEvents();
      if (!restoreProgress()) {
        newGame({ difficulty: "medium", daily: false });
      } else {
        renderAll();
        startTimer();
      }
      if (!readStorage(STORAGE_KEYS.welcomed, false)) openModal(elements.welcomeModal);
    } catch (error) {
      console.error("DataDoku could not start.", error);
      setMessage("DataDoku could not start. Refresh the page to try again.", "error");
    }
  }

  initialise();
})();
