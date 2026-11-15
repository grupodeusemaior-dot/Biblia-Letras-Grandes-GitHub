const $ = id => document.getElementById(id);
const STORAGE_KEY = "bibliaLetrasGrandes.studyTools.v1";
const FONT_KEY = "bibliaFont";
const state = {
  books: [], testament: null, book: null, chapter: 1,
  font: Number(localStorage.getItem(FONT_KEY)) || 1.35,
  highlights: [], notes: [], pendingSelection: null, activeNoteId: null
};
const views = ["welcome", "booksView", "chaptersView", "readingView"];

function show(id) {
  views.forEach(v => $(v).hidden = v !== id);
  window.scrollTo({top: 0, behavior: "smooth"});
}
function setFont() {
  state.font = Math.max(1, Math.min(2.4, Number(state.font.toFixed(2))));
  document.documentElement.style.setProperty("--font-size", `${state.font}rem`);
  try { localStorage.setItem(FONT_KEY, String(state.font)); } catch (_) {}
}
function safeText(s) { return String(s ?? ""); }
function currentBookKey() { return state.book?.arquivo || state.book?.livro || ""; }
function loadStudyData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.highlights = Array.isArray(saved.highlights) ? saved.highlights : [];
    state.notes = Array.isArray(saved.notes) ? saved.notes : [];
  } catch (_) { state.highlights = []; state.notes = []; }
}
function saveStudyData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, highlights: state.highlights, notes: state.notes
    }));
  } catch (_) {
    alert("Não foi possível salvar. Verifique o espaço disponível no navegador.");
  }
}
function locationMatches(item, bookKey, chapter, verse) {
  return item.book === bookKey && Number(item.chapter) === Number(chapter) && Number(item.verse) === Number(verse);
}
function renderVerseText(span, text, verseNumber) {
  const bookKey = currentBookKey();
  const marks = state.highlights
    .filter(h => locationMatches(h, bookKey, state.chapter, verseNumber))
    .sort((a,b) => a.start - b.start);
  let cursor = 0;
  marks.forEach(mark => {
    const start = Math.max(cursor, Math.min(text.length, Number(mark.start)));
    const end = Math.max(start, Math.min(text.length, Number(mark.end)));
    if (start > cursor) span.append(document.createTextNode(text.slice(cursor, start)));
    if (end > start) {
      const el = document.createElement("mark");
      el.className = "verse-mark";
      el.textContent = text.slice(start, end);
      el.dataset.highlightId = mark.id;
      span.append(el);
    }
    cursor = Math.max(cursor, end);
  });
  if (cursor < text.length) span.append(document.createTextNode(text.slice(cursor)));
}
function noteId() { return "note-" + Date.now() + "-" + Math.random().toString(36).slice(2,8); }

async function init() {
  loadStudyData();
  try {
    const r = await fetch("./dados/catalogo.json");
    if (!r.ok) throw Error("Não foi possível carregar o catálogo.");
    state.books = await r.json();
  } catch (e) {
    $("welcome").insertAdjacentHTML("beforeend", '<p class="error">Não foi possível carregar os livros. Verifique se os arquivos foram publicados corretamente.</p>');
  }
  setFont();
  document.querySelectorAll("[data-testament]").forEach(b => b.addEventListener("click", () => openTestament(b.dataset.testament)));
  $("fontUp").addEventListener("click", () => { state.font += .1; setFont(); });
  $("fontDown").addEventListener("click", () => { state.font -= .1; setFont(); });
  $("backHome").onclick = () => show("welcome");
  $("backBooks").onclick = () => openTestament(state.testament);
  $("backChapters").onclick = () => openBook(state.book);
  $("previousChapter").onclick = () => moveChapter(-1);
  $("nextChapter").onclick = () => moveChapter(1);

  $("highlightSelection").onclick = addHighlight;
  $("removeHighlight").onclick = removeHighlight;
  $("annotateSelection").onclick = createNote;
  $("closeNotePanel").onclick = () => $("notePanel").hidden = true;
  $("editNote").onclick = editActiveNote;
  $("deleteNote").onclick = deleteActiveNote;
  $("cancelNote").onclick = () => $("noteDialog").close();
  $("noteForm").addEventListener("submit", saveNoteFromDialog);
  document.addEventListener("selectionchange", updateSelectionTools);
  document.addEventListener("mouseup", updateSelectionTools);
  document.addEventListener("touchend", () => setTimeout(updateSelectionTools, 250));
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
}
function openTestament(testament) {
  state.testament = testament;
  $("booksTitle").textContent = testament;
  $("booksList").replaceChildren();
  state.books.filter(b => b.testamento === testament).forEach(book => {
    const b = document.createElement("button");
    b.className = "book-button"; b.textContent = book.livro; b.onclick = () => openBook(book);
    $("booksList").append(b);
  });
  show("booksView");
}
function openBook(book) {
  state.book = book;
  $("chaptersTitle").textContent = book.livro;
  $("chaptersList").replaceChildren();
  for (let n=1; n<=book.capitulos; n++) {
    const b = document.createElement("button");
    b.className = "chapter-button"; b.textContent = n;
    b.setAttribute("aria-label", "Capítulo " + n); b.onclick = () => openChapter(n);
    $("chaptersList").append(b);
  }
  show("chaptersView");
}
async function loadBook() {
  const r = await fetch("./" + state.book.arquivo);
  if (!r.ok) throw Error("Falha ao abrir o livro.");
  return r.json();
}
async function openChapter(n) {
  state.chapter = n;
  try {
    const data = await loadBook();
    const chapter = data.capitulos.find(c => Number(c.numero) === n);
    if (!chapter) throw Error("Capítulo não encontrado.");
    $("readingTitle").textContent = state.book.livro + " " + n;
    $("translation").textContent = "Tradução: " + (data.traducao || "");
    const article = $("verses"); article.replaceChildren();
    chapter.versiculos.forEach(v => {
      const p = document.createElement("p"); p.className = "verse";
      const num = document.createElement("sup"); num.className = "verse-number"; num.textContent = v.numero;
      const span = document.createElement("span"); span.className = "verse-text";
      const text = safeText(v.texto);
      renderVerseText(span, text, v.numero);
      p.append(num, span);
      const notesForVerse = state.notes.filter(note => locationMatches(note, currentBookKey(), n, v.numero));
      if (notesForVerse.length) {
        const arrow = document.createElement("button");
        arrow.type = "button"; arrow.className = "note-arrow";
        arrow.setAttribute("aria-label", `Abrir anotação do versículo ${v.numero}`);
        arrow.title = "Ver anotação";
        arrow.onclick = () => openNote(notesForVerse[0].id);
        p.append(arrow);
        if (notesForVerse.length > 1) {
          const count = document.createElement("small"); count.className = "note-count";
          count.textContent = ` ${notesForVerse.length} anotações`; p.append(count);
        }
      }
      article.append(p);
    });
    $("notePanel").hidden = true;
    $("previousChapter").disabled = n <= 1;
    $("nextChapter").disabled = n >= state.book.capitulos;
    $("selectionTools").hidden = true;
    show("readingView");
  } catch (e) { alert("Não foi possível abrir este capítulo. " + e.message); }
}
function moveChapter(delta) {
  const n = state.chapter + delta;
  if (n >= 1 && n <= state.book.capitulos) openChapter(n);
}
function getSelectionData() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
  const startSpan = startEl?.closest?.(".verse-text");
  const endSpan = endEl?.closest?.(".verse-text");
  if (!startSpan || startSpan !== endSpan) return null;
  const verse = startSpan.closest(".verse");
  const number = Number(verse?.querySelector(".verse-number")?.textContent);
  const pre = range.cloneRange(); pre.selectNodeContents(startSpan); pre.setEnd(range.startContainer, range.startOffset);
  const selectedText = range.toString();
  const start = pre.toString().length;
  if (!selectedText.trim()) return null;
  return {book: currentBookKey(), chapter: state.chapter, verse: number, start, end: start + selectedText.length, text: selectedText.trim()};
}
function updateSelectionTools() {
  if (!$("readingView") || $("readingView").hidden) return;
  const data = getSelectionData();
  $("selectionTools").hidden = !data;
  if (data) state.pendingSelection = data;
}
function addHighlight() {
  const data = state.pendingSelection || getSelectionData();
  if (!data) return;
  const overlaps = state.highlights.some(h => locationMatches(h, data.book, data.chapter, data.verse) && data.start < h.end && data.end > h.start);
  if (!overlaps) state.highlights.push({...data, id: noteId(), text: undefined});
  else {
    state.highlights = state.highlights.filter(h => !(locationMatches(h, data.book, data.chapter, data.verse) && data.start < h.end && data.end > h.start));
    state.highlights.push({...data, id: noteId(), text: undefined});
  }
  saveStudyData(); refreshCurrentChapter(); clearSelection();
}
function removeHighlight() {
  const data = state.pendingSelection || getSelectionData();
  if (!data) return;
  state.highlights = state.highlights.filter(h => !(locationMatches(h, data.book, data.chapter, data.verse) && data.start < h.end && data.end > h.start));
  saveStudyData(); refreshCurrentChapter(); clearSelection();
}
function clearSelection() {
  window.getSelection()?.removeAllRanges();
  state.pendingSelection = null; $("selectionTools").hidden = true;
}
function refreshCurrentChapter() { openChapter(state.chapter); }
function createNote() {
  state.activeNoteId = null;
  const data = state.pendingSelection || getSelectionData();
  if (!data) return;
  state.pendingSelection = data;
  $("noteDialogTitle").textContent = "Nova anotação";
  $("noteDialogQuote").textContent = `“${data.text}” — ${state.book.livro} ${data.chapter}:${data.verse}`;
  $("noteInput").value = "";
  $("noteDialog").showModal();
}
function saveNoteFromDialog(event) {
  event.preventDefault();
  const content = $("noteInput").value.trim();
  if (!content) { alert("Escreva sua anotação antes de salvar."); return; }
  if (state.activeNoteId) {
    const note = state.notes.find(n => n.id === state.activeNoteId);
    if (note) note.content = content;
  } else if (state.pendingSelection) {
    state.notes.push({...state.pendingSelection, id: noteId(), content});
  }
  saveStudyData();
  $("noteDialog").close();
  state.activeNoteId = null;
  clearSelection();
  refreshCurrentChapter();
}
function openNote(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  state.activeNoteId = id;
  $("notePanelQuote").textContent = `“${note.text}” — ${state.book.livro} ${note.chapter}:${note.verse}`;
  $("notePanelContent").textContent = note.content;
  $("notePanel").hidden = false;
  $("notePanel").scrollIntoView({behavior:"smooth", block:"nearest"});
}
function editActiveNote() {
  const note = state.notes.find(n => n.id === state.activeNoteId);
  if (!note) return;
  $("noteDialogTitle").textContent = "Editar anotação";
  $("noteDialogQuote").textContent = `“${note.text}” — ${state.book.livro} ${note.chapter}:${note.verse}`;
  $("noteInput").value = note.content;
  $("noteDialog").showModal();
}
function deleteActiveNote() {
  if (!state.activeNoteId || !confirm("Apagar esta anotação?")) return;
  state.notes = state.notes.filter(n => n.id !== state.activeNoteId);
  saveStudyData(); state.activeNoteId = null; $("notePanel").hidden = true;
  refreshCurrentChapter();
}
init();
