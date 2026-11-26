(() => {
  "use strict";

  const WORD_LENGTH = 6;
  const MAX_GUESSES = 6;
  const STORAGE_KEYS = {
    theme: "workdle-theme",
    stats: "workdle-stats",
    welcomed: "workdle-welcomed",
    daily: "workdle-daily-state"
  };

  // Add or remove six-letter answers here. Invalid lengths are filtered safely.
  const WORDS = [
    "SALARY", "BONUSX", "REWARD", "PEOPLE", "SKILLS", "TENURE",
    "EQUITY", "ABSENT", "RATING", "METRIC", "REPORT", "PYTHON",
    "HUMANS", "VALUES", "TALENT", "HIRING", "MANAGE", "CAREER",
    "OFFICE", "LEADER", "GROWTH", "COHORT", "SURVEY", "INCOME",
    "PAYOUT", "MERGER", "OUTPUT", "MODELS", "CHARTS", "PANDAS"
  ].filter((word) => /^[A-Z]{6}$/.test(word));

  const ACCEPTED_GUESSES = new Set(WORDS);
  const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ENTERZXCVBNM⌫"];
  const statePriority = { absent: 1, present: 2, correct: 3 };
  const elements = {
    board: document.querySelector("#board"),
    keyboard: document.querySelector("#keyboard"),
    toast: document.querySelector("#toast"),
    puzzleLabel: document.querySelector("#puzzle-label"),
    themeButton: document.querySelector("#theme-button"),
    welcomeModal: document.querySelector("#welcome-modal"),
    statsModal: document.querySelector("#stats-modal"),
    gamesPlayed: document.querySelector("#games-played"),
    gamesWon: document.querySelector("#games-won"),
    winPercentage: document.querySelector("#win-percentage"),
    resultMessage: document.querySelector("#result-message"),
    shareButton: document.querySelector("#share-button"),
    canvas: document.querySelector("#confetti")
  };

  let mode = "daily";
  let answer = "";
  let currentGuess = "";
  let guesses = [];
  let evaluations = [];
  let gameOver = false;
  let isAnimating = false;
  let toastTimer;
  let lastFocusedElement = null;

  function track(name, parameters = {}) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, { game_name: "Workdle", ...parameters });
    }
  }

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn(`Workdle could not read ${key}.`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Workdle could not save ${key}.`, error);
      return false;
    }
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function hashDate(value) {
    return [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
  }

  function selectDailyWord() {
    return WORDS[hashDate(todayKey()) % WORDS.length];
  }

  function selectRandomWord() {
    const available = WORDS.filter((word) => word !== answer);
    const pool = available.length ? available : WORDS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function getStats() {
    const stored = readStorage(STORAGE_KEYS.stats, {});
    return {
      played: Number.isInteger(stored.played) && stored.played >= 0 ? stored.played : 0,
      won: Number.isInteger(stored.won) && stored.won >= 0 ? stored.won : 0
    };
  }

  function saveStats(won) {
    const stats = getStats();
    stats.played += 1;
    if (won) stats.won += 1;
    writeStorage(STORAGE_KEYS.stats, stats);
  }

  function updateStatsDisplay() {
    const stats = getStats();
    elements.gamesPlayed.textContent = stats.played;
    elements.gamesWon.textContent = stats.won;
    elements.winPercentage.textContent = stats.played
      ? `${Math.round((stats.won / stats.played) * 100)}%`
      : "0%";
  }

  function createBoard() {
    elements.board.replaceChildren();
    for (let rowIndex = 0; rowIndex < MAX_GUESSES; rowIndex += 1) {
      const row = document.createElement("div");
      row.className = "row";
      row.setAttribute("role", "row");
      row.dataset.row = rowIndex;
      for (let columnIndex = 0; columnIndex < WORD_LENGTH; columnIndex += 1) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.setAttribute("role", "gridcell");
        tile.setAttribute("aria-label", `Row ${rowIndex + 1}, letter ${columnIndex + 1}, empty`);
        row.append(tile);
      }
      elements.board.append(row);
    }
  }

  function createKeyboard() {
    elements.keyboard.replaceChildren();
    KEYBOARD_ROWS.forEach((letters, rowIndex) => {
      const row = document.createElement("div");
      row.className = "keyboard-row";
      const characters = rowIndex === 2
        ? ["ENTER", ..."ZXCVBNM", "BACKSPACE"]
        : [...letters];
      characters.forEach((character) => {
        const button = document.createElement("button");
        button.type = "button";
        if (character === "ENTER") {
          button.className = "key wide";
          button.textContent = "ENTER";
          button.dataset.key = "ENTER";
          row.append(button);
          return;
        }
        if (character === "BACKSPACE") {
          button.className = "key wide";
          button.textContent = "⌫";
          button.dataset.key = "BACKSPACE";
          button.setAttribute("aria-label", "Backspace");
        } else {
          button.className = "key";
          button.textContent = character;
          button.dataset.key = character;
          button.setAttribute("aria-label", character);
        }
        row.append(button);
      });
      elements.keyboard.append(row);
    });
  }

  function renderCurrentGuess() {
    const tiles = elements.board.querySelectorAll(`[data-row="${guesses.length}"] .tile`);
    tiles.forEach((tile, index) => {
      const letter = currentGuess[index] || "";
      tile.textContent = letter;
      tile.classList.toggle("filled", Boolean(letter));
      tile.setAttribute("aria-label", `Row ${guesses.length + 1}, letter ${index + 1}, ${letter || "empty"}`);
    });
  }

  function evaluateGuess(guess) {
    const result = Array(WORD_LENGTH).fill("absent");
    const remaining = answer.split("");

    [...guess].forEach((letter, index) => {
      if (letter === answer[index]) {
        result[index] = "correct";
        remaining[index] = null;
      }
    });
    [...guess].forEach((letter, index) => {
      if (result[index] === "correct") return;
      const remainingIndex = remaining.indexOf(letter);
      if (remainingIndex !== -1) {
        result[index] = "present";
        remaining[remainingIndex] = null;
      }
    });
    return result;
  }

  function updateKeyboard(guess, result) {
    [...guess].forEach((letter, index) => {
      const key = elements.keyboard.querySelector(`[data-key="${letter}"]`);
      if (!key) return;
      const currentStatus = [...key.classList].find((name) => ["absent", "present", "correct"].includes(name));
      if (!currentStatus || statePriority[result[index]] > statePriority[currentStatus]) {
        key.classList.remove("absent", "present", "correct");
        key.classList.add(result[index]);
      }
    });
  }

  function resetKeyboard() {
    elements.keyboard.querySelectorAll(".key").forEach((key) => {
      key.classList.remove("absent", "present", "correct");
    });
  }

  function showToast(message, duration = 1800) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), duration);
  }

  function shakeRow() {
    const row = elements.board.querySelector(`[data-row="${guesses.length}"]`);
    row.classList.remove("shake");
    void row.offsetWidth;
    row.classList.add("shake");
  }

  function handleLetter(letter) {
    if (gameOver || isAnimating || currentGuess.length >= WORD_LENGTH) return;
    currentGuess += letter;
    renderCurrentGuess();
  }

  function handleBackspace() {
    if (gameOver || isAnimating) return;
    currentGuess = currentGuess.slice(0, -1);
    renderCurrentGuess();
  }

  async function handleSubmit() {
    if (gameOver || isAnimating) return;
    if (currentGuess.length !== WORD_LENGTH) {
      showToast("Not enough letters");
      shakeRow();
      return;
    }
    if (!ACCEPTED_GUESSES.has(currentGuess)) {
      showToast("Use a term from the Workdle list");
      shakeRow();
      return;
    }

    isAnimating = true;
    const rowIndex = guesses.length;
    const guess = currentGuess;
    const result = evaluateGuess(guess);
    const tiles = elements.board.querySelectorAll(`[data-row="${rowIndex}"] .tile`);
    for (let index = 0; index < WORD_LENGTH; index += 1) {
      await new Promise((resolve) => {
        window.setTimeout(() => {
          tiles[index].classList.add("flip");
          window.setTimeout(() => {
            tiles[index].classList.add(result[index]);
            tiles[index].setAttribute("aria-label", `${guess[index]}, ${result[index]}`);
          }, 250);
          resolve();
        }, 70);
      });
    }
    await new Promise((resolve) => window.setTimeout(resolve, 560));

    guesses.push(guess);
    evaluations.push(result);
    currentGuess = "";
    updateKeyboard(guess, result);
    saveDailyProgress();
    track("workdle_guess", { guess_number: guesses.length, mode });
    isAnimating = false;

    if (guess === answer) {
      finishGame(true);
    } else if (guesses.length >= MAX_GUESSES) {
      finishGame(false);
    }
  }

  function finishGame(won) {
    gameOver = true;
    saveStats(won);
    saveDailyProgress();
    updateStatsDisplay();
    elements.resultMessage.textContent = won
      ? `Excellent! You found ${answer} in ${guesses.length} ${guesses.length === 1 ? "try" : "tries"}.`
      : `The term was ${answer}. Try another round.`;
    elements.shareButton.hidden = false;
    if (won) {
      elements.board.querySelector(`[data-row="${guesses.length - 1}"]`)?.classList.add("win");
      launchConfetti();
    }
    track(won ? "workdle_win" : "workdle_loss", { attempts: guesses.length, mode });
    window.setTimeout(() => openModal(elements.statsModal), 650);
  }

  function saveDailyProgress() {
    if (mode !== "daily") return;
    writeStorage(STORAGE_KEYS.daily, {
      date: todayKey(),
      guesses,
      evaluations,
      complete: gameOver
    });
  }

  function restoreDailyProgress() {
    const saved = readStorage(STORAGE_KEYS.daily, null);
    if (!saved || saved.date !== todayKey() || !Array.isArray(saved.guesses)) return false;
    guesses = saved.guesses.filter((guess) => typeof guess === "string").slice(0, MAX_GUESSES);
    evaluations = guesses.map((guess) => evaluateGuess(guess));
    gameOver = Boolean(saved.complete);
    currentGuess = "";
    guesses.forEach((guess, rowIndex) => {
      const tiles = elements.board.querySelectorAll(`[data-row="${rowIndex}"] .tile`);
      tiles.forEach((tile, index) => {
        tile.textContent = guess[index];
        tile.classList.add("filled", evaluations[rowIndex][index]);
      });
      updateKeyboard(guess, evaluations[rowIndex]);
    });
    if (gameOver) elements.resultMessage.textContent = guesses.includes(answer)
      ? `Today’s Workdle is complete: ${answer}.`
      : `Today’s term was ${answer}.`;
    return gameOver;
  }

  function startGame(nextMode = mode) {
    mode = nextMode;
    answer = mode === "daily" ? selectDailyWord() : selectRandomWord();
    currentGuess = "";
    guesses = [];
    evaluations = [];
    gameOver = false;
    isAnimating = false;
    elements.resultMessage.textContent = "";
    elements.shareButton.hidden = true;
    createBoard();
    resetKeyboard();
    elements.puzzleLabel.textContent = mode === "daily"
      ? `Daily puzzle · ${todayKey()}`
      : "Free play · a new term";
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    if (mode === "daily") {
      const restoredAsComplete = restoreDailyProgress();
      if (restoredAsComplete) elements.shareButton.hidden = false;
    }
    track("workdle_start", { mode });
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

  function shareText() {
    const score = gameOver && guesses.includes(answer) ? guesses.length : "X";
    const squares = { correct: "🟩", present: "🟨", absent: "⬜" };
    const grid = evaluations.map((result) => result.map((status) => squares[status]).join("")).join("\n");
    return `Workdle ${mode === "daily" ? todayKey() : "Free Play"} ${score}/${MAX_GUESSES}\n\n${grid}\n\nPlay Workdle`;
  }

  async function shareResults() {
    const text = shareText();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Workdle", text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showToast("Results copied to clipboard");
      } else {
        const field = document.createElement("textarea");
        field.value = text;
        document.body.append(field);
        field.select();
        document.execCommand("copy");
        field.remove();
        showToast("Results copied to clipboard");
      }
      track("workdle_share", { mode });
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.warn("Workdle could not share results.", error);
        showToast("Sharing is not available in this browser");
      }
    }
  }

  function launchConfetti() {
    const canvas = elements.canvas;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    context.scale(ratio, ratio);
    const colours = ["#0756a5", "#47a8ff", "#3dddb4", "#f6c344", "#9b78bb"];
    const pieces = Array.from({ length: 130 }, () => ({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * 180,
      width: 5 + Math.random() * 7,
      height: 8 + Math.random() * 10,
      speed: 2 + Math.random() * 4,
      drift: -1.5 + Math.random() * 3,
      rotation: Math.random() * Math.PI,
      colour: colours[Math.floor(Math.random() * colours.length)]
    }));
    const started = performance.now();
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
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        context.restore();
      });
      if (now - started < 2600) requestAnimationFrame(frame);
      else context.clearRect(0, 0, innerWidth, innerHeight);
    }
    requestAnimationFrame(frame);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    elements.themeButton.textContent = theme === "dark" ? "☀" : "☾";
    elements.themeButton.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
    localStorageSafeTheme(theme);
  }

  function localStorageSafeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme));
    } catch (error) {
      console.warn("Workdle could not save the theme.", error);
    }
  }

  function bindEvents() {
    elements.keyboard.addEventListener("click", (event) => {
      const button = event.target.closest("[data-key]");
      if (!button) return;
      handleInput(button.dataset.key);
    });
    document.addEventListener("keydown", (event) => {
      if (!elements.welcomeModal.hidden || !elements.statsModal.hidden) {
        if (event.key === "Escape") {
          [elements.welcomeModal, elements.statsModal].forEach((modal) => {
            if (!modal.hidden) closeModal(modal);
          });
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      handleInput(event.key);
    });
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => startGame(button.dataset.mode));
    });
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop")));
    });
    elements.welcomeModal.addEventListener("click", (event) => {
      if (event.target === elements.welcomeModal) closeModal(elements.welcomeModal);
    });
    elements.statsModal.addEventListener("click", (event) => {
      if (event.target === elements.statsModal) closeModal(elements.statsModal);
    });
    document.querySelector("#start-button").addEventListener("click", () => {
      closeModal(elements.welcomeModal);
      writeStorage(STORAGE_KEYS.welcomed, true);
      track("workdle_welcome_complete");
    });
    document.querySelector("#help-button").addEventListener("click", () => openModal(elements.welcomeModal));
    document.querySelector("#stats-button").addEventListener("click", () => {
      updateStatsDisplay();
      openModal(elements.statsModal);
    });
    document.querySelector("#play-again-button").addEventListener("click", () => {
      closeModal(elements.statsModal);
      startGame(mode === "daily" && !gameOver ? "daily" : "free");
      track("workdle_play_again", { mode });
    });
    elements.shareButton.addEventListener("click", shareResults);
    elements.themeButton.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      track("workdle_theme", { theme: nextTheme });
    });
  }

  function handleInput(key) {
    if (/^[a-zA-Z]$/.test(key)) {
      handleLetter(key.toUpperCase());
    } else if (key === "Backspace" || key === "BACKSPACE") {
      handleBackspace();
    } else if (key === "Enter" || key === "ENTER") {
      handleSubmit();
    }
  }

  function initialise() {
    try {
      createKeyboard();
      const savedTheme = readStorage(STORAGE_KEYS.theme, null);
      const preferredTheme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      applyTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : preferredTheme);
      updateStatsDisplay();
      bindEvents();
      startGame("daily");
      if (!readStorage(STORAGE_KEYS.welcomed, false)) openModal(elements.welcomeModal);
    } catch (error) {
      console.error("Workdle could not start.", error);
      showToast("Workdle could not start. Refresh the page to try again.", 4000);
    }
  }

  initialise();
})();
