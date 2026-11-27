const translations = window.exampleTranslations;
const root = document.documentElement;
const themeButton = document.querySelector("#theme-toggle");
const navigation = document.querySelector(".navigation");
const aboutLink = navigation?.querySelector('[data-i18n="about"]');
if (aboutLink) {
  const homeUrl = aboutLink.href.split("#")[0];
  aboutLink.href = `${homeUrl}#hobbies-title`;
  if (!navigation.querySelector('[data-i18n="games"]')) {
    const gamesLink = document.createElement("a");
    gamesLink.href = `${homeUrl}#games-title`;
    gamesLink.dataset.i18n = "games";
    gamesLink.textContent = translations.en.games;
    navigation.append(gamesLink);
  }
}
let language = localStorage.getItem("example-v1-language") === "pl" ? "pl" : "en";
let theme = localStorage.getItem("example-v1-theme");
if (theme !== "light" && theme !== "dark") {
  theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const articleTranslationScript = document.querySelector("#article-translations");
const articleTranslations = articleTranslationScript
  ? JSON.parse(articleTranslationScript.textContent)
  : {};
function articleLookupKey(value) {
  return normalizedText(value).replace(/\s+/g, "");
}
const articleTranslationLookup = new Map(
  Object.entries(articleTranslations).map(([key, value]) => [articleLookupKey(key), value])
);
const articleElements = Array.from(document.querySelectorAll(
  "[data-article-translate], .article-body h2, .article-body h3, .article-body p, .article-body ul > li, .article-body ol > li, .article-body figcaption, .article-body blockquote, .article-body th, .article-body td, .resource-links > a"
));
const originalArticleContent = new Map(
  articleElements.map((element) => [element, element.innerHTML])
);
const articleHeading = document.querySelector(".article-header h1");
const originalArticleHeading = articleHeading?.innerHTML;
const timeElements = Array.from(document.querySelectorAll("time"));
const originalTimeContent = new Map(timeElements.map((element) => [element, element.textContent]));
const articleLinks = Array.from(document.querySelectorAll(
  '.home-page .card h3 a[href*="articles/"], main .article-list a[href*="articles/"], .article-navigation a'
));
const originalArticleLinks = new Map(articleLinks.map((link) => [link, link.textContent]));
const months = {
  January: ["styczeń", "stycznia"], Jan: ["sty", "sty"],
  February: ["luty", "lutego"], Feb: ["lut", "lut"],
  March: ["marzec", "marca"], Mar: ["mar", "mar"],
  April: ["kwiecień", "kwietnia"], Apr: ["kwi", "kwi"],
  May: ["maj", "maja"],
  June: ["czerwiec", "czerwca"], Jun: ["cze", "cze"],
  July: ["lipiec", "lipca"], Jul: ["lip", "lip"],
  August: ["sierpień", "sierpnia"], Aug: ["sie", "sie"],
  September: ["wrzesień", "września"], Sep: ["wrz", "wrz"],
  October: ["październik", "października"], Oct: ["paź", "paź"],
  November: ["listopad", "listopada"], Nov: ["lis", "lis"],
  December: ["grudzień", "grudnia"], Dec: ["gru", "gru"]
};

function normalizedText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function textFromHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return normalizedText(container.textContent);
}

function renderArticle() {
  articleElements.forEach((element) => {
    const originalHtml = originalArticleContent.get(element);
    const key = textFromHtml(originalHtml);
    element.innerHTML = language === "pl"
      ? (articleTranslations[key] || articleTranslationLookup.get(articleLookupKey(key)) || originalHtml)
      : originalHtml;
  });
  const title = articleTranslationScript?.dataset.title;
  const polishTitle = articleTranslationScript?.dataset.polishTitle;
  if (title) {
    document.title = language === "pl" ? polishTitle : title;
  }
  if (articleHeading) {
    const polishHeading = (polishTitle || "").split(" — Magdalena Bronowska")[0];
    articleHeading.innerHTML = language === "pl" && polishHeading
      ? polishHeading
      : originalArticleHeading;
    articleHeading.lang = language;
  }
  document.querySelectorAll(".article-body[lang]").forEach((article) => {
    article.lang = language;
  });
  timeElements.forEach((element) => {
    const original = originalTimeContent.get(element);
    if (language !== "pl") {
      element.textContent = original;
      return;
    }
    const hasDay = /^\s*\d{1,2}\b/.test(original);
    element.textContent = original.replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/,
      (match) => months[match][hasDay ? 1 : 0]
    );
  });
  articleLinks.forEach((link) => {
    const filename = link.getAttribute("href").split("/").pop().split("#")[0];
    const original = originalArticleLinks.get(link);
    const polishTitle = window.articleTitleTranslations[filename];
    if (language !== "pl" || !polishTitle) {
      link.textContent = original;
      return;
    }
    const previous = original.trim().startsWith("←") ? "← " : "";
    const next = original.trim().endsWith("→") ? " →" : "";
    link.textContent = previous + polishTitle + next;
  });
  document.querySelectorAll(".copy-button").forEach((button) => {
    button.textContent = language === "pl" ? "Kopiuj" : "Copy";
    button.setAttribute("aria-label", language === "pl" ? "Kopiuj kod" : "Copy code");
  });
}

function addCopyButtons() {
  document.querySelectorAll(".code-wrap pre").forEach((pre) => {
    const wrap = pre.closest(".code-wrap");
    if (!wrap || wrap.querySelector(".copy-button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-button";
    button.textContent = language === "pl" ? "Kopiuj" : "Copy";
    button.setAttribute("aria-label", language === "pl" ? "Kopiuj kod" : "Copy code");
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(pre.innerText);
      button.textContent = language === "pl" ? "Skopiowano!" : "Copied!";
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = language === "pl" ? "Kopiuj" : "Copy";
        button.classList.remove("copied");
      }, 2000);
    });
    wrap.appendChild(button);
  });
}

function renderPreferences() {
  const text = translations[language];
  root.lang = language;
  root.dataset.theme = theme;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = text[element.dataset.i18n];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = text[element.dataset.i18nPlaceholder];
  });
  document.querySelectorAll("[data-i18n-label]").forEach((element) => {
    element.setAttribute("aria-label", text[element.dataset.i18nLabel]);
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.language === language));
  });
  themeButton.textContent = theme === "dark" ? "☀️" : "🌙";
  themeButton.title = text[theme === "dark" ? "switchLight" : "switchDark"];
  themeButton.setAttribute("aria-label", text[theme === "dark" ? "switchLight" : "switchDark"]);
  themeButton.setAttribute("aria-pressed", String(theme === "dark"));
  renderArticle();
  filterArticles();
}

document.querySelectorAll("[data-language]").forEach((button) => {
  button.addEventListener("click", () => {
    language = button.dataset.language;
    localStorage.setItem("example-v1-language", language);
    renderPreferences();
  });
});
themeButton.addEventListener("click", () => {
  theme = theme === "dark" ? "light" : "dark";
  localStorage.setItem("example-v1-theme", theme);
  renderPreferences();
});

const search = document.querySelector("#search");
const category = document.querySelector("#category");
const tag = document.querySelector("#tag");
const results = document.querySelector("#results");
function filterArticles() {
  if (!search) return;
  const query = search.value.trim().toLocaleLowerCase();
  let count = 0;
  document.querySelectorAll("[data-article]").forEach((item) => {
    const matches = item.textContent.toLocaleLowerCase().includes(query)
      && (!category.value || item.dataset.category === category.value)
      && (!tag.value || item.dataset.tags.split(" ").includes(tag.value));
    item.hidden = !matches;
    if (matches) count += 1;
  });
  results.textContent = count ? `${count} ${translations[language].results}` : translations[language].noResults;
}
if (search) {
  search.addEventListener("input", filterArticles);
  category.addEventListener("change", filterArticles);
  tag.addEventListener("change", filterArticles);
}
addCopyButtons();
document.querySelectorAll("[data-track-game]").forEach((link) => {
  link.addEventListener("click", () => {
    if (typeof window.gtag === "function") {
      const gameNames = { datadoku: "DataDoku", "data-stacker": "Data Stacker", "inbox-sweeper": "Inbox Sweeper" };
      const gameName = gameNames[link.dataset.trackGame] || "Workdle";
      window.gtag("event", "portfolio_game_open", { game_name: gameName });
    }
  });
});
renderPreferences();
