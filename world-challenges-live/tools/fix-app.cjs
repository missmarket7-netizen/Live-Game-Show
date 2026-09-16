const fs = require("fs");
const p = "public/app.js";
let s = fs.readFileSync(p, "utf8");
const i = s.indexOf("/* ===== OVERRIDE");
if (i > -1) s = s.slice(0, i);
s += `
/* ===== OVERRIDE via assignment (no re-declaration) ===== */
isFreeQuestion = function (q) { return !q || !Array.isArray(q.options) || q.options.length === 0; };
renderQuestion = function () {
  const question = state.questions[state.currentIndex]; if (!question) return;
  stopTimer(); state.isRevealed = false; state.timerValue = state.timerDuration; updateTimer(); updateScores();
  $("roundProgress").textContent = String(state.currentIndex + 1).padStart(2, "0") + " / " + String(state.questions.length).padStart(2, "0");
  $("questionCounter").textContent = "السؤال " + String(state.currentIndex + 1).padStart(2, "0") + " / " + String(state.questions.length).padStart(2, "0");
  $("questionNumber").textContent = String(state.currentIndex + 1).padStart(2, "0");
  $("categoryBadge").textContent = (categoryEmoji[question.category] || "◈") + " " + (question.category || "اختيارات متنوعة");
  $("questionText").textContent = question.question;
  $("answerText").textContent = "—"; $("explanationText").textContent = "—"; $("answerReveal").classList.add("hidden");
  $("revealBtn").disabled = false; $("nextBtn").disabled = false;
  $("sourceBadge").textContent = question.source === "ai" ? "AI BANK READY" : "LOCAL BANK READY";
  $("questionSource").textContent = question.source === "ai" ? "AUTO-SAVED / AI" : "AUTO-SAVED";
  const grid = $("optionsGrid"); grid.innerHTML = "";
  const pill = document.createElement("div");
  pill.className = "think-pill";
  pill.textContent = isFreeQuestion(question) ? "⚡ سؤال سرعة — إجابة حرة، الحكم للمضيف" : "🤔 فكّروا جيداً… الإجابة الصحيحة تظهر عند «كشف الإجابة»";
  grid.appendChild(pill);
  $$(".gift-button").forEach((b) => b.classList.remove("is-active"));
  $("activeGiftBanner").classList.add("hidden");
};
revealAnswer = function () {
  if (state.isRevealed) return;
  const question = state.questions[state.currentIndex]; if (!question) return;
  state.isRevealed = true; stopTimer();
  if (isFreeQuestion(question)) { $("answerText").textContent = "🎤 إجابة حرة — الحكم للمضيف"; }
  else { $("answerText").textContent = String.fromCharCode(65 + question.correctIndex) + ". " + question.options[question.correctIndex]; }
  $("explanationText").textContent = question.explanation || "معلومة إضافية للمقدم.";
  $("answerReveal").classList.remove("hidden"); $("revealBtn").disabled = true;
};
/* ===== Theme engine (guarded, single instance) ===== */
(function () {
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("lgs_theme_v1", t); } catch (e) {} const b = document.getElementById("themeToggleBtn"); if (b) b.textContent = (t === "light") ? "🌙" : "☀️"; }
  function cur() { try { return localStorage.getItem("lgs_theme_v1") || "dark"; } catch (e) { return "dark"; } }
  function mount() { if (document.getElementById("themeToggleBtn")) { applyTheme(cur()); return; } const b = document.createElement("button"); b.id = "themeToggleBtn"; b.type = "button"; b.className = "theme-toggle-btn"; b.addEventListener("click", function () { applyTheme(cur() === "light" ? "dark" : "light"); }); document.body.appendChild(b); applyTheme(cur()); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
`;
fs.writeFileSync(p, s);
console.log("✅ app.js fixed: override → assignments + theme engine (guarded)");
