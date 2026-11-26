(() => {
  "use strict";

  const DIFFICULTIES = {
    8: { hackers: 10 },
    10: { hackers: 15 }
  };
  const SAFE_SUBJECTS = [
    "Q3 Payroll Summary", "Team Meeting Notes", "Annual Leave Approved",
    "Dashboard Refresh Complete", "Benefits Enrolment", "Recruitment Update",
    "Monthly Finance Report", "Training Session Reminder", "Project Delivery Plan"
  ];
  const FLAG_SUBJECTS = [
    "Urgent Wire Transfer", "Password Expiry Action", "Unknown Shared File",
    "Prize Claim Required", "CEO Payment Request", "Verify Account Now"
  ];

  const elements = {
    board: document.querySelector("#board"),
    remaining: document.querySelector("#remaining-value"),
    flagProgress: document.querySelector("#flag-progress"),
    timer: document.querySelector("#timer-value"),
    difficulty: document.querySelector("#difficulty-select"),
    preview: document.querySelector("#subject-preview"),
    status: document.querySelector("#status-message"),
    overlay: document.querySelector("#game-overlay"),
    overlayTitle: document.querySelector("#overlay-title"),
    overlayMessage: document.querySelector("#overlay-message"),
    helpModal: document.querySelector("#help-modal")
  };

  let board = [];
  let size = 8;
  let hackerCount = 10;
  let interactionMode = "open";
  let firstMove = true;
  let ended = false;
  let flags = 0;
  let elapsed = 0;
  let timerId = 0;

  function track(name, parameters = {}) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, { game_name: "Inbox Sweeper", ...parameters });
    }
  }

  function createBoardState() {
    return Array.from({ length: size * size }, (_, index) => ({
      index,
      hacker: false,
      revealed: false,
      flagged: false,
      adjacent: 0
    }));
  }

  function neighbors(index) {
    const row = Math.floor(index / size);
    const column = index % size;
    const found = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        if (nextRow >= 0 && nextRow < size && nextColumn >= 0 && nextColumn < size) {
          found.push(nextRow * size + nextColumn);
        }
      }
    }
    return found;
  }

  function placeHackers(safeIndex) {
    const safeZone = new Set([safeIndex, ...neighbors(safeIndex)]);
    const candidates = Array.from({ length: size * size }, (_, index) => index)
      .filter((index) => !safeZone.has(index));
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
    }
    candidates.slice(0, hackerCount).forEach((index) => {
      board[index].hacker = true;
    });
    board.forEach((cell) => {
      if (!cell.hacker) {
        cell.adjacent = neighbors(cell.index).filter((index) => board[index].hacker).length;
      }
    });
  }

  function startTimer() {
    window.clearInterval(timerId);
    elapsed = 0;
    elements.timer.textContent = "0s";
    timerId = window.setInterval(() => {
      elapsed += 1;
      elements.timer.textContent = `${elapsed}s`;
    }, 1000);
  }

  function floodReveal(startIndex) {
    const queue = [startIndex];
    const visited = new Set();
    while (queue.length) {
      const index = queue.shift();
      if (visited.has(index)) continue;
      visited.add(index);
      const cell = board[index];
      if (cell.revealed || cell.flagged || cell.hacker) continue;
      cell.revealed = true;
      if (cell.adjacent === 0) {
        neighbors(index).forEach((neighbor) => {
          if (!visited.has(neighbor) && !board[neighbor].hacker && !board[neighbor].flagged) {
            queue.push(neighbor);
          }
        });
      }
    }
  }

  function revealCell(index) {
    if (ended) return;
    const cell = board[index];
    if (cell.revealed || cell.flagged) return;
    if (firstMove) {
      placeHackers(index);
      firstMove = false;
      startTimer();
    }
    if (cell.hacker) {
      cell.revealed = true;
      showBreachWarning(cell);
      return;
    }
    floodReveal(index);
    elements.preview.textContent = `Safe: ${SAFE_SUBJECTS[Math.floor(Math.random() * SAFE_SUBJECTS.length)]}`;
    setStatus(cell.adjacent ? `${cell.adjacent} suspicious email${cell.adjacent === 1 ? "" : "s"} nearby.` : "Clear section opened.");
    checkWin();
    render();
  }

  function toggleFlag(index) {
    if (ended) return;
    const cell = board[index];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flags += cell.flagged ? 1 : -1;
    elements.preview.textContent = cell.flagged
      ? `Flagged: ${FLAG_SUBJECTS[Math.floor(Math.random() * FLAG_SUBJECTS.length)]}`
      : "Flag removed. Review the inbox carefully.";
    render();
    checkWin();
  }

  function checkWin() {
    const safeRemaining = board.filter((cell) => !cell.hacker && !cell.revealed).length;
    const correctFlags = board.filter((cell) => cell.hacker && cell.flagged).length;
    if (safeRemaining === 0 && correctFlags === hackerCount) endGame(true);
  }

  function showBreachWarning(cell) {
    if (ended) return;
    ended = true;
    window.clearInterval(timerId);
    cell.triggered = true;
    setStatus("⚠ Breach in progress — dangerous email opened!", "danger");
    render();
    window.setTimeout(() => endGame(false, true), 3000);
  }

  function endGame(success, delayedBreach = false) {
    ended = true;
    window.clearInterval(timerId);
    if (!success) {
      board.forEach((cell) => {
        if (cell.hacker) cell.revealed = true;
      });
      elements.overlayTitle.textContent = "Breach Detected!";
      elements.overlayMessage.textContent = `A hacker email was opened after ${elapsed} seconds.`;
      setStatus("Breach detected. Review the revealed hacker emails.", "danger");
    } else {
      elements.overlayTitle.textContent = "Inbox Secured!";
      elements.overlayMessage.textContent = `All safe emails are open and all ${hackerCount} hacker emails are correctly flagged. Time: ${elapsed} seconds.`;
      setStatus("Inbox secured. Excellent work.", "success");
    }
    elements.overlay.hidden = false;
    render();
    track(success ? "inbox_sweeper_win" : "inbox_sweeper_breach", { size, elapsed, flags, delayedBreach });
  }

  function setStatus(message, type = "") {
    elements.status.textContent = message;
    elements.status.className = `status-message${type ? ` ${type}` : ""}`;
  }

  function cellLabel(cell) {
    const position = `Row ${Math.floor(cell.index / size) + 1}, column ${(cell.index % size) + 1}`;
    if (cell.flagged && !ended) return `${position}, flagged spam`;
    if (!cell.revealed) return `${position}, unopened email`;
    if (cell.hacker) return `${position}, hacker email`;
    return `${position}, safe email, ${cell.adjacent} nearby hackers`;
  }

  function render() {
    elements.board.style.setProperty("--size", size);
    elements.board.replaceChildren();
    board.forEach((cell) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mail-cell";
      button.dataset.index = cell.index;
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", cellLabel(cell));
      if (cell.revealed) button.classList.add("revealed");
      if (cell.triggered) button.classList.add("triggered");
      if (cell.flagged) {
        button.classList.add("flagged");
        button.textContent = "🚩";
      } else if (cell.revealed && cell.hacker) {
        button.classList.add("hacker");
        button.textContent = "⚠️";
      } else if (cell.revealed && cell.adjacent > 0) {
        button.classList.add(`count-${cell.adjacent}`);
        button.textContent = cell.adjacent;
      } else if (cell.revealed) {
        button.classList.add("safe-zero");
        button.textContent = "📨";
      }
      elements.board.append(button);
    });
    elements.remaining.textContent = Math.max(0, hackerCount - flags);
    const correctFlags = board.filter((cell) => cell.hacker && cell.flagged).length;
    elements.flagProgress.textContent = `${correctFlags} / ${hackerCount} correctly flagged`;
  }

  function newGame() {
    size = Number(elements.difficulty.value);
    hackerCount = DIFFICULTIES[size].hackers;
    board = createBoardState();
    firstMove = true;
    ended = false;
    flags = 0;
    elapsed = 0;
    window.clearInterval(timerId);
    elements.timer.textContent = "0s";
    elements.overlay.hidden = true;
    elements.preview.textContent = "Safe first click: Q3 Payroll Summary";
    setStatus("Open an email to start. Your first click is safe.");
    render();
    track("inbox_sweeper_start", { size, hackers: hackerCount });
  }

  function handleCell(index, forceFlag = false) {
    if (forceFlag || interactionMode === "flag") toggleFlag(index);
    else revealCell(index);
  }

  elements.board.addEventListener("click", (event) => {
    const cell = event.target.closest(".mail-cell");
    if (cell) handleCell(Number(cell.dataset.index));
  });
  elements.board.addEventListener("contextmenu", (event) => {
    const cell = event.target.closest(".mail-cell");
    if (!cell) return;
    event.preventDefault();
    handleCell(Number(cell.dataset.index), true);
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      interactionMode = button.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate.dataset.mode === interactionMode));
      });
      elements.preview.textContent = interactionMode === "flag"
        ? "Flag Spam mode: tap suspicious emails."
        : "Open mode: tap an email to inspect it.";
    });
  });
  elements.difficulty.addEventListener("change", newGame);
  document.querySelector("#new-game-button").addEventListener("click", newGame);
  document.querySelector("#retry-button").addEventListener("click", newGame);
  document.querySelector("#help-button").addEventListener("click", () => {
    elements.helpModal.hidden = false;
    document.querySelector("#start-button").focus();
  });
  function closeHelp() {
    elements.helpModal.hidden = true;
  }
  document.querySelector("#close-help").addEventListener("click", closeHelp);
  document.querySelector("#start-button").addEventListener("click", closeHelp);
  elements.helpModal.addEventListener("click", (event) => {
    if (event.target === elements.helpModal) closeHelp();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelp();
  });

  newGame();
})();
