const $=id=>document.getElementById(id);
const state={books:[],testament:null,book:null,chapter:1,font:Number(localStorage.getItem("bibliaFont"))||1.35};
const views=["welcome","booksView","chaptersView","readingView"];
function show(id){views.forEach(v=>$(v).hidden=v!==id);window.scrollTo({top:0,behavior:"smooth"});}
function setFont(){document.documentElement.style.setProperty("--font-size",state.font+"rem");localStorage.setItem("bibliaFont",state.font);}
function safeText(s){return String(s??"");}
async function init(){
 try{
  const r=await fetch("./dados/catalogo.json");if(!r.ok)throw Error("Não foi possível carregar o catálogo.");
  state.books=await r.json();
 }catch(e){$("welcome").insertAdjacentHTML("beforeend",'<p class="error">Não foi possível carregar os livros. Verifique se os arquivos foram publicados corretamente.</p>');}
 setFont();
 document.querySelectorAll("[data-testament]").forEach(b=>b.addEventListener("click",()=>openTestament(b.dataset.testament)));
 $("fontUp").onclick=()=>{state.font=Math.min(2.1,state.font+.1);setFont()};
 $("fontDown").onclick=()=>{state.font=Math.max(1.0,state.font-.1);setFont()};
 $("backHome").onclick=()=>show("welcome");
 $("backBooks").onclick=()=>openTestament(state.testament);
 $("backChapters").onclick=()=>openBook(state.book);
 $("previousChapter").onclick=()=>moveChapter(-1);
 $("nextChapter").onclick=()=>moveChapter(1);
 if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
}
function openTestament(testament){
 state.testament=testament;
 $("booksTitle").textContent=testament;
 const list=state.books.filter(b=>b.testamento===testament);
 $("booksList").replaceChildren();
 list.forEach(book=>{const b=document.createElement("button");b.className="book-button";b.textContent=book.livro;b.onclick=()=>openBook(book);$("booksList").append(b)});
 show("booksView");
}
function openBook(book){
 state.book=book;
 $("chaptersTitle").textContent=book.livro;
 $("chaptersList").replaceChildren();
 for(let n=1;n<=book.capitulos;n++){const b=document.createElement("button");b.className="chapter-button";b.textContent=n;b.setAttribute("aria-label","Capítulo "+n);b.onclick=()=>openChapter(n);$("chaptersList").append(b)}
 show("chaptersView");
}
async function loadBook(){
 const r=await fetch("./"+state.book.arquivo);if(!r.ok)throw Error("Falha ao abrir o livro.");
 return r.json();
}
async function openChapter(n){
 state.chapter=n;
 try{
  const data=await loadBook();
  const chapter=data.capitulos.find(c=>Number(c.numero)===n);
  if(!chapter)throw Error("Capítulo não encontrado.");
  $("readingTitle").textContent=state.book.livro+" "+n;
  $("translation").textContent="Tradução: "+(data.traducao||"");
  const article=$("verses");article.replaceChildren();
  chapter.versiculos.forEach(v=>{
   const p=document.createElement("p");p.className="verse";
   const num=document.createElement("sup");num.className="verse-number";num.textContent=v.numero;
   p.append(num,document.createTextNode(safeText(v.texto)));article.append(p);
  });
  $("previousChapter").disabled=n<=1;
  $("nextChapter").disabled=n>=state.book.capitulos;
  show("readingView");
 }catch(e){alert("Não foi possível abrir este capítulo. "+e.message)}
}
function moveChapter(delta){const n=state.chapter+delta;if(n>=1&&n<=state.book.capitulos)openChapter(n)}
init();
