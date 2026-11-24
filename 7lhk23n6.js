/* admin.js — Google sign-in gate + editor engine for academic.html (loaded in an iframe) */
(function(){
"use strict";

/* ══════════════════ CONFIG — edit these two ══════════════════ */
var GOOGLE_CLIENT_ID = "647331545737-esnkgfli12e9fbcijkbvih9ad8p69tai.apps.googleusercontent.com";
/* Gmail ignores dots — normalize before comparing so mehdi.chanaa@ and mehdichanaa@ both match */
var ALLOWED_EMAILS   = ["mehdi.chanaa@gmail.com"];
function normEmail(e){ return (e || "").toLowerCase().replace(/\./g, ""); }
var ALLOWED_NORM = ALLOWED_EMAILS.map(normEmail);
/* ══════════════════════════════════════════════════════════════ */

var SESSION_KEY = "mc-admin-session";
var ADMIN_KEY   = "mc-admin-v1";

var frame    = document.getElementById("cvFrame");
var signInEl = document.getElementById("view-signin");
var deniedEl = document.getElementById("view-denied");
var editorEl = document.getElementById("view-editor");
var userArea = document.getElementById("userArea");
var userChip = document.getElementById("userChip");
var drawer   = document.getElementById("drawer");

var iDoc = null;   /* the iframe's document, set once signed in */

/* load the preview with a cache-busting URL so it always shows the
   newest academic.html, never a stale browser-cached copy */
frame.src = "academic.html?preview=" + Date.now();

function $(id){ return document.getElementById(id); }
function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
function lsDel(k){ try { localStorage.removeItem(k); } catch(e){} }
function ssGet(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }
function ssSet(k,v){ try { sessionStorage.setItem(k,v); } catch(e){} }
function ssDel(k){ try { sessionStorage.removeItem(k); } catch(e){} }

function decodeJwt(t){
  var b = t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
  return JSON.parse(decodeURIComponent(atob(b).split("").map(function(c){
    return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
  }).join("")));
}

function toast(msg){
  var t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function(){ t.classList.add("show"); }, 10);
  setTimeout(function(){ t.classList.remove("show"); setTimeout(function(){ t.remove(); }, 400); }, 2300);
}

/* ══════════════════ views / auth ══════════════════ */
var authed = false;
function show(name){
  /* the CV (editor) stays visible underneath; only the gate overlay and
     the editing toolbar toggle */
  signInEl.hidden = name !== "signin";
  deniedEl.hidden = name !== "denied";
  document.querySelector(".e-bar").hidden = name !== "editor";
  userArea.hidden = name !== "editor";
}
function setUserChip(u){
  userChip.innerHTML = "";
  if (u && u.picture){
    var img = document.createElement("img");
    img.src = u.picture; img.alt = ""; img.referrerPolicy = "no-referrer";
    userChip.appendChild(img);
  }
  var span = document.createElement("span");
  span.textContent = u && u.email ? u.email : "";
  userChip.appendChild(span);
}
function grant(cred){
  var u;
  try { u = decodeJwt(cred); } catch(e){ return deniedView(null); }
  var email = normEmail(u.email);
  if (!email || ALLOWED_NORM.indexOf(email) === -1 || !u.email_verified)
    return deniedView(u.email);
  authed = true;
  ssSet(SESSION_KEY, JSON.stringify({ email: email, name: u.name || "", picture: u.picture || "" }));
  setUserChip(u);
  showEditor();
}
function deniedView(email){
  $("deniedEmail").textContent = email || "(unknown account)";
  authed = false;
  setUserChip(null);
  show("denied");
}

function handleCredential(resp){ grant(resp.credential); }

function initGoogle(){
  if (GOOGLE_CLIENT_ID.indexOf("YOUR_GOOGLE_CLIENT_ID") === 0){
    $("gsiSetup").hidden = false;
    return;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.id){
    return setTimeout(initGoogle, 250);
  }
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential
  });
  window.google.accounts.id.renderButton($("gsiButton"), {
    theme: document.documentElement.getAttribute("data-theme") === "dark" ? "filled_black" : "outline",
    size: "large", shape: "pill", text: "signin_with", width: 280
  });
}

function boot(){
  if (location.protocol === "file:") $("fileWarn").hidden = false;
  show("editor");   /* the CV preview is visible from the start */
  var raw = ssGet(SESSION_KEY);
  if (raw){
    try {
      var u = JSON.parse(raw);
      if (u.email && ALLOWED_NORM.indexOf(normEmail(u.email)) !== -1){
        authed = true;
        setUserChip(u); showEditor(); return;
      }
    } catch(e){}
  }
  show("signin");
  initGoogle();
}

/* show the editor and bind the preview (also covers an iframe that
   finished loading before sign-in completed) */
function showEditor(){
  show("editor");
  var tries = 0;
  (function bind(){
    if (iDoc) return;
    if (frame.contentDocument && frame.contentDocument.body){
      enterEditor();
      toast("Signed in — click any text in the preview to edit");
    } else if (++tries < 20){
      setTimeout(bind, 250);
    }
  })();
}

/* ══════════════════ editor engine (on iframe document) ══════════════════ */
var EDITABLE = ".side h1, .side .who, main section, footer";

function enterEditor(){
  var nd = frame.contentDocument;
  if (!nd || !nd.body){ toast("Preview not ready — try again in a second"); return; }
  if (iDoc === nd) return;          /* already bound to this document */
  iDoc = nd;
  iDoc.body.classList.add("admin-on");
  iDoc.querySelectorAll(EDITABLE).forEach(function(el){ el.setAttribute("contenteditable","true"); });
  injectControls(iDoc);
  if (!iDoc.__admBound){
    iDoc.__admBound = true;
    bindFrameEvents(iDoc);
  }
}
function exitEditor(){
  if (!iDoc) return;
  iDoc.body.classList.remove("admin-on");
  iDoc.querySelectorAll(EDITABLE).forEach(function(el){ el.removeAttribute("contenteditable"); });
  stripControls(iDoc);
  iDoc = null;
}
function injectControls(d){
  stripControls(d);   /* idempotent — never duplicates buttons */
  d.querySelectorAll("#papers .p-type").forEach(function(p){ p.setAttribute("contenteditable","false"); });
  d.querySelectorAll("#experience .resume-item, #education .resume-item, #skills .skill-block, #papers .pub")
    .forEach(function(el){
      el.insertAdjacentHTML("beforeend",
        '<button class="adm-drag" data-adm type="button" title="Drag to reorder" aria-label="Drag to reorder">⠇</button>' +
        '<button class="adm-del" data-adm type="button" aria-label="Remove this block">✕</button>');
    });
  [["experience",".resume-item","experience entry"],
   ["education",".resume-item","education entry"],
   ["skills",".skill-block","skill block"],
   ["papers",".pub","paper"]].forEach(function(cfg){
    var sec = d.getElementById(cfg[0]);
    if (!sec) return;
    sec.insertAdjacentHTML("beforeend",
      '<button class="adm-add" data-adm data-add="' + cfg[1] + '" data-sec="' + cfg[0] + '" type="button">+ Add ' + cfg[2] + '</button>');
  });
}
function stripControls(d){
  d.querySelectorAll("[data-adm]").forEach(function(el){ el.remove(); });
}
function bindFrameEvents(d){
  var dragEl = null;
  function clearCues(){
    d.querySelectorAll(".drag-cue-top, .drag-cue-bottom").forEach(function(el){
      el.classList.remove("drag-cue-top", "drag-cue-bottom");
    });
  }
  d.addEventListener("click", function(e){
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    var del = t.closest(".adm-del");
    if (del){
      var blk = del.closest(".resume-item, .skill-block, .pub");
      if (blk){ blk.remove(); toast("Block removed — press Save to keep it"); }
      return;
    }
    var add = t.closest(".adm-add");
    if (add){ addBlock(add); return; }
    /* drag handle clicked without dragging: explain how it works */
    var hd = t.closest(".adm-drag");
    if (hd){
      toast("Hold ⠇ and drag the block up or down to reorder it");
      return;
    }
    /* paper type pill: click cycles conference / journal / chapter / preprint */
    var pt = t.closest(".p-type");
    if (pt){
      var types = ["Conference paper", "Journal article", "Book chapter", "Preprint"];
      var cur = pt.textContent.trim();
      var i = types.indexOf(cur);
      pt.textContent = types[(i + 1) % types.length];
      toast("Type: " + pt.textContent + " — press Save to keep it");
      return;
    }
  });
  /* drag & drop reorder — mousedown on the handle arms the block as draggable */
  d.addEventListener("mousedown", function(e){
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    var handle = t.closest(".adm-drag");
    if (handle){
      var blk = handle.closest(".resume-item, .skill-block, .pub");
      if (blk) blk.setAttribute("draggable", "true");
    }
  });
  d.addEventListener("dragstart", function(e){
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    dragEl = t.closest('.resume-item, .skill-block, .pub') ||
             (t.hasAttribute && t.hasAttribute("draggable") ? t : null);
    if (!dragEl) return;
    try { e.dataTransfer.setData("text/plain", ""); } catch(err){}
    e.dataTransfer.effectAllowed = "move";
    dragEl.classList.add("adm-dragging");
  });
  d.addEventListener("dragover", function(e){
    if (!dragEl) return;
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    var over = t.closest(".resume-item, .skill-block, .pub");
    if (!over || over === dragEl || over.closest("section") !== dragEl.closest("section")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearCues();
    var r = over.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) over.classList.add("drag-cue-top");
    else over.classList.add("drag-cue-bottom");
  });
  d.addEventListener("drop", function(e){
    if (!dragEl) return;
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    var over = t.closest(".resume-item, .skill-block, .pub");
    if (!over || over === dragEl || over.closest("section") !== dragEl.closest("section")) return;
    e.preventDefault();
    var cue = over.classList.contains("drag-cue-top") ? "drag-cue-top" : "drag-cue-bottom";
    clearCues();
    over.insertAdjacentElement(cue === "drag-cue-top" ? "beforebegin" : "afterend", dragEl);
    toast("Reordered — press Save to keep it");
  });
  d.addEventListener("dragend", function(){
    if (dragEl) dragEl.removeAttribute("draggable");
    dragEl = null;
    clearCues();
    d.querySelectorAll('.resume-item[draggable], .skill-block[draggable], .pub[draggable]')
      .forEach(function(el){ el.removeAttribute("draggable"); });
  });
  /* links: prompt for URL instead of navigating while editing */
  d.addEventListener("click", function(e){
    var t = e.target;
    if (!t || t.nodeType !== 1) return;
    var a = t.closest("main a, .socials a, footer a");
    if (a){
      e.preventDefault();
      var w = frame.contentWindow || window;
      var url = w.prompt("Link URL:", a.getAttribute("href") || "https://");
      if (url !== null && url.trim()) a.setAttribute("href", url.trim());
    }
  }, true);
}
function addBlock(btn){
  var sec   = iDoc.getElementById(btn.getAttribute("data-sec"));
  var sel   = btn.getAttribute("data-add");
  var first = sec.querySelector(sel);
  if (!first) return;
  var cl = first.cloneNode(true);
  cl.querySelectorAll("[data-adm]").forEach(function(x){ x.remove(); });
  cl.classList.add("reveal","in");
  first.insertAdjacentElement("beforebegin", cl);   /* newest first */
  cl.insertAdjacentHTML("beforeend",
    '<button class="adm-drag" data-adm type="button" title="Drag to reorder" aria-label="Drag to reorder">⠇</button>' +
    '<button class="adm-del" data-adm type="button" aria-label="Remove this block">✕</button>');
  toast("Added at the top — edit the text, then Save");
}

/* ══════════════════ links drawer ══════════════════ */
function buildLinkRows(){
  var wrap = $("linkRows");
  wrap.innerHTML = "";
  if (!iDoc) return;
  iDoc.querySelectorAll(".socials a").forEach(function(a){
    var row = document.createElement("div"); row.className = "l-row";
    var lab = document.createElement("input");
    lab.type = "text"; lab.className = "l-name"; lab.placeholder = "Name";
    lab.value = a.getAttribute("aria-label") || "";
    var url = document.createElement("input");
    url.type = "text"; url.className = "l-url"; url.placeholder = "https://…";
    url.value = a.getAttribute("href") || "";
    var del = document.createElement("button");
    del.type = "button"; del.className = "l-del"; del.textContent = "✕"; del.setAttribute("aria-label","Remove link");
    row.appendChild(lab); row.appendChild(url); row.appendChild(del);
    wrap.appendChild(row);
  });
}
function applyLinkRows(){
  if (!iDoc) return;
  var rows    = Array.prototype.slice.call(document.querySelectorAll("#linkRows .l-row"));
  var anchors = iDoc.querySelectorAll(".socials a");
  rows.forEach(function(row, i){
    var a = anchors[i]; if (!a) return;
    var name = row.querySelector(".l-name").value.trim();
    var url  = row.querySelector(".l-url").value.trim();
    if (name){ a.setAttribute("aria-label", name); a.setAttribute("title", name); }
    if (url){ a.setAttribute("href", url); }
  });
}

/* ══════════════════ save / reset / export ══════════════════ */
function saveAll(){
  if (!iDoc) return;
  applyLinkRows();
  var d = {
    v: 1,
    name:   iDoc.querySelector(".side h1").innerHTML,
    who:    iDoc.querySelector(".side .who").innerHTML,
    footer: iDoc.querySelector("footer").innerHTML,
    socials: Array.prototype.map.call(iDoc.querySelectorAll(".socials a"), function(a){ return a.outerHTML; }),
    sections: {}
  };
  ["about","experience","education","skills","papers"].forEach(function(id){
    var el = iDoc.getElementById(id);
    if (el) d.sections[id] = el.innerHTML;
  });
  lsSet(ADMIN_KEY, JSON.stringify(d));
  toast("Saved ✓ — the CV page updates instantly");
}
function resetAll(){
  if (!confirm("Reset all saved changes back to the original CV?")) return;
  lsDel(ADMIN_KEY);
  frame.src = frame.src;   /* fresh copy, edits gone */
  toast("Reset — original content restored");
}
function buildExportHtml(){
  applyLinkRows();
  var clone = iDoc.documentElement.cloneNode(true);
  clone.querySelectorAll("[data-adm]").forEach(function(el){ el.remove(); });
  clone.querySelectorAll("[draggable]").forEach(function(el){ el.removeAttribute("draggable"); });
  clone.querySelectorAll(".adm-dragging").forEach(function(el){ el.classList.remove("adm-dragging"); });
  clone.querySelectorAll(".drag-cue-top, .drag-cue-bottom").forEach(function(el){ el.classList.remove("drag-cue-top", "drag-cue-bottom"); });
  clone.querySelectorAll("[contenteditable]").forEach(function(el){ el.removeAttribute("contenteditable"); });
  clone.querySelectorAll(".reveal.in").forEach(function(el){ el.classList.remove("in"); });
  return "<!doctype html>\n" + clone.outerHTML;
}
function exportHtml(){
  if (!iDoc) return;
  var html = buildExportHtml();
  var blob = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  var a = document.createElement("a");
  a.href = blob; a.download = "academic.html";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(blob); }, 4000);
  toast("Downloaded academic.html with your edits baked in");
}

/* ══════════════════ publish to GitHub ══════════════════ */
var GH_REPO_KEY = "mc-gh-repo";
var GH_TOKEN_KEY = "mc-gh-token";

function b64encode(str){
  var bytes = new TextEncoder().encode(str), bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function ghPrefill(){
  try {
    $("ghRepo").value = localStorage.getItem(GH_REPO_KEY) || "";
    $("ghToken").value = localStorage.getItem(GH_TOKEN_KEY) || "";
  } catch(e){}
}
async function publishGitHub(){
  if (!iDoc){ toast("Preview not ready"); return; }
  var repo = $("ghRepo").value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
  var token = $("ghToken").value.trim();
  if (!repo || repo.indexOf("/") === -1 || !token){
    toast("Fill in your GitHub repo (user/repo) and token first — see the Links panel");
    return;
  }
  try { localStorage.setItem(GH_REPO_KEY, repo); localStorage.setItem(GH_TOKEN_KEY, token); } catch(e){}
  var html = buildExportHtml();
  toast("Publishing to GitHub…");
  try {
    var headers = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json" };
    var r = await fetch("https://api.github.com/repos/" + repo, { headers: headers });
    if (!r.ok) throw new Error("Repo not found (" + r.status + ") — check user/repo and the token's access");
    var branch = (await r.json()).default_branch || "main";
    r = await fetch("https://api.github.com/repos/" + repo + "/contents/academic.html", { headers: headers });
    if (!r.ok) throw new Error("academic.html not found in the repo (" + r.status + ")");
    var sha = (await r.json()).sha;
    r = await fetch("https://api.github.com/repos/" + repo + "/contents/academic.html", {
      method: "PUT",
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update CV from admin panel", content: b64encode(html), sha: sha, branch: branch })
    });
    if (!r.ok){
      var err = await r.json().catch(function(){ return {}; });
      var msg = err.message || ("HTTP " + r.status);
      if (r.status === 401) msg += " — token is invalid or expired";
      if (r.status === 403) msg += " — token needs Contents read/write on this repo";
      throw new Error(msg);
    }
    toast("Published ✓ — the live CV updates for everyone within about a minute");
  } catch(e){
    toast("Publish failed: " + e.message);
  }
}

/* ══════════════════ wiring ══════════════════ */
frame.addEventListener("load", function(){
  if (authed) enterEditor();
});
$("btnSave").addEventListener("click", saveAll);
$("btnExport").addEventListener("click", exportHtml);
$("btnPublish").addEventListener("click", publishGitHub);
ghPrefill();
$("btnReset").addEventListener("click", resetAll);
Array.prototype.forEach.call(document.querySelectorAll(".e-bar [data-add]"), function(btn){
  btn.addEventListener("click", function(){ if (iDoc) addBlock(btn); });
});
$("btnLinks").addEventListener("click", function(){
  var open = drawer.classList.toggle("open");
  drawer.setAttribute("aria-hidden", String(!open));
  if (open) buildLinkRows();
});
$("drawerClose").addEventListener("click", function(){
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden","true");
});
$("addLink").addEventListener("click", function(){
  if (!iDoc) return;
  var s = iDoc.querySelector(".socials");
  var a = iDoc.createElement("a");
  a.href = "https://";
  a.setAttribute("target","_blank"); a.setAttribute("rel","noopener noreferrer");
  a.setAttribute("aria-label","New link"); a.setAttribute("title","New link");
  a.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm7.93 9h-3.02a15.7 15.7 0 0 0-1.2-5.03A8.03 8.03 0 0 1 19.93 11zM12 4.06c.83 1.2 1.62 3.16 1.86 6.94h-3.72C10.38 7.22 11.17 5.26 12 4.06zM4.07 13h3.02c.14 1.86.55 3.6 1.2 5.03A8.03 8.03 0 0 1 4.07 13zm0-2a8.03 8.03 0 0 1 4.22-5.03A15.7 15.7 0 0 0 7.09 11H4.07zm6.07 2h3.72c-.24 3.78-1.03 5.74-1.86 6.94-.83-1.2-1.62-3.16-1.86-6.94zm6.57 5.03c.65-1.43 1.06-3.17 1.2-5.03h3.02a8.03 8.03 0 0 1-4.22 5.03z"/></svg>';
  s.appendChild(a);
  buildLinkRows();
  toast("Link added — set name + URL, then Save");
});
$("linkRows").addEventListener("click", function(e){
  if (e.target.classList && e.target.classList.contains("l-del")){
    var row = e.target.closest(".l-row");
    var idx = Array.prototype.indexOf.call(document.querySelectorAll("#linkRows .l-row"), row);
    var anchors = iDoc.querySelectorAll(".socials a");
    if (anchors[idx]) anchors[idx].remove();
    row.remove();
  }
});
$("btnRetry").addEventListener("click", function(){
  ssDel(SESSION_KEY);
  if (window.google && window.google.accounts && window.google.accounts.id)
    window.google.accounts.id.disableAutoSelect();
  show("signin");
  initGoogle();
});
$("btnSignOut").addEventListener("click", function(){
  ssDel(SESSION_KEY);
  if (window.google && window.google.accounts && window.google.accounts.id)
    window.google.accounts.id.disableAutoSelect();
  location.reload();
});
$("btnTheme").addEventListener("click", function(){
  var root = document.documentElement;
  var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("mc-admin-theme", next); } catch(e){}
});
(function(){
  var t = null;
  try { t = localStorage.getItem("mc-admin-theme"); } catch(e){}
  if (t) document.documentElement.setAttribute("data-theme", t);
})();

window.addEventListener("load", boot);
})();
