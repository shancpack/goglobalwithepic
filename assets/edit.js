/* ==================================================================
   OWNER EDIT MODE: edit any page in place and publish with one click.

   How to use: add ?edit to any page URL, for example
   https://goglobalwithepic.com/?edit or https://goglobalwithepic.com/audit/?edit
   The first time, paste a GitHub fine-grained token (Contents: read & write
   on shancpack/goglobalwithepic only). It is stored in this browser only.

   How it works: the editor loads the page's current source straight from
   GitHub (not the animated live page), makes the text editable, and
   "Save & publish" commits the updated file back to main. GitHub Pages
   redeploys in about a minute. Visitors without the token can't save.
   ================================================================== */
(function () {
  'use strict';
  var REPO = 'shancpack/goglobalwithepic';
  var BRANCH = 'main';
  var TOKEN_KEY = 'epicEditToken';
  var API = 'https://api.github.com/repos/' + REPO + '/contents/';

  var path = decodeURIComponent(location.pathname).replace(/^\/+/, '');
  if (path === '' || path.slice(-1) === '/') path += 'index.html';

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
  }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function gh(method, token, body) {
    return fetch(API + encodeURI(path) + (method === 'GET' ? '?ref=' + BRANCH : ''), {
      method: method,
      cache: 'no-store',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ('GitHub error ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  var BAR_CSS =
    '#editbar{position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#101828;color:#fff;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px 16px;flex-wrap:wrap;font:600 14px Inter,-apple-system,sans-serif;box-shadow:0 -6px 24px rgba(0,0,0,.25)}' +
    '#editbar .hint{color:#8494ab;font-weight:400}' +
    '#editbar .status{color:#fde8c8;font-weight:600}#editbar .status a{color:#fde8c8}' +
    '#editbar button{border:0;cursor:pointer;border-radius:8px;padding:9px 16px;font:700 14px Inter,-apple-system,sans-serif}' +
    '#editbar .save{background:linear-gradient(to right,#ea580c,#c2410c);color:#fff}#editbar .save:disabled{opacity:.6;cursor:default}' +
    '#editbar .ghost{background:rgba(255,255,255,.12);color:#fff}' +
    '#editbar .link{background:transparent;color:#8494ab;padding:9px 6px}' +
    'body{padding-bottom:80px}' +
    '[contenteditable="true"] :hover{outline:1px dashed rgba(234,88,12,.35);outline-offset:2px}';

  var noscripts = [];

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }

  function setupBar(message) {
    var bar = el('<div id="editbar" contenteditable="false"><style>' + BAR_CSS + '</style>' +
      '<span>✏️ EDIT MODE</span>' +
      '<span class="hint">Click text to edit · Cmd/Ctrl+B bold</span>' +
      '<span class="status" id="editStatus">' + (message || '') + '</span>' +
      '<button class="save" id="editSave">Save &amp; publish</button>' +
      '<button class="ghost" id="editDiscard">Discard changes</button>' +
      '<button class="link" id="editExit">Exit</button>' +
      '<button class="link" id="editForget" title="Remove the GitHub token from this browser">Forget token</button></div>');
    document.body.appendChild(bar);
    return bar;
  }
  function status(html) { var s = document.getElementById('editStatus'); if (s) s.innerHTML = html; }

  function getToken() {
    var t = store(TOKEN_KEY);
    if (t) return t;
    t = prompt(
      'Paste your GitHub token to edit this site.\n\n' +
      'Create one at github.com → Settings → Developer settings → Fine-grained tokens:\n' +
      '• Repository access: only ' + REPO + '\n' +
      '• Permissions: Contents → Read and write\n\n' +
      'It is saved in this browser only.');
    if (t && t.trim()) { t = t.trim(); store(TOKEN_KEY, t); return t; }
    return null;
  }

  // Serialize the edited page back to a clean source file.
  function serialize() {
    var root = document.documentElement.cloneNode(true);
    var bar = root.querySelector('#editbar'); if (bar) bar.remove();
    // browser-extension debris (Monica, Grammarly, LanguageTool, etc.)
    root.querySelectorAll('[id*="monica"],[class*="monica-"],grammarly-desktop-integration,grammarly-extension,[data-grammarly-part]').forEach(function (n) { n.remove(); });
    root.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        if (/^(monica-|data-listener-added|data-gramm|data-new-gr|data-gr-ext|data-lt-|cz-shortcut)/.test(a.name)) n.removeAttribute(a.name);
      });
    });
    var body = root.querySelector('body');
    body.removeAttribute('contenteditable');
    body.removeAttribute('spellcheck');
    var out = '<!DOCTYPE html>\n' + root.outerHTML + '\n';
    return out.replace(/<!--EDIT-NOSCRIPT-(\d+)-->/g, function (m, i) { return noscripts[+i] || ''; });
  }

  function start() {
    var token = getToken();
    if (!token) { alert('Edit mode needs a GitHub token. Reload with ?edit to try again.'); return; }

    gh('GET', token).then(function (file) {
      var sha = file.sha;
      var source = b64decode(file.content);
      // DOMParser parses <noscript> as markup (scripting is off), which would
      // move the tracking pixel into <body>. Park each block in a comment and
      // put the original text back when saving.
      noscripts = [];
      source = source.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, function (m) {
        noscripts.push(m); return '<!--EDIT-NOSCRIPT-' + (noscripts.length - 1) + '-->';
      });
      // Swap in the pristine source: DOMParser scripts never execute, so the
      // page shows exactly what is saved, without animations or calculators.
      var doc = new DOMParser().parseFromString(source, 'text/html');
      document.replaceChild(document.adoptNode(doc.documentElement), document.documentElement);

      document.body.contentEditable = 'true';
      document.body.spellcheck = true;
      setupBar('Loaded latest version from GitHub');

      // links and forms do nothing while editing
      document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a,button,input[type=submit]');
        if (a && !a.closest('#editbar')) e.preventDefault();
      }, true);
      document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

      var dirty = false;
      document.body.addEventListener('input', function () { dirty = true; status('Unsaved changes'); });
      window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

      document.getElementById('editSave').addEventListener('click', function () {
        var btn = this; btn.disabled = true; btn.textContent = 'Publishing…';
        gh('PUT', token, {
          message: 'Edit ' + path + ' from the on-page editor',
          content: b64encode(serialize()),
          sha: sha,
          branch: BRANCH
        }).then(function (res) {
          sha = res.content.sha; dirty = false;
          status('✓ Published. Live in about a minute · <a href="' + res.commit.html_url + '" target="_blank" rel="noopener">view change</a>');
        }).catch(function (err) {
          if (err.status === 409 || err.status === 422) status('Someone changed this page since you opened it. Copy your edits, click Discard, and redo them.');
          else if (err.status === 401 || err.status === 403 || err.status === 404) status('GitHub refused the token (' + err.message + '). Click "Forget token" and paste a new one.');
          else status('Save failed: ' + err.message);
        }).then(function () { btn.disabled = false; btn.textContent = 'Save & publish'; });
      });
      document.getElementById('editDiscard').addEventListener('click', function () {
        if (!dirty || confirm('Throw away your unsaved changes?')) { dirty = false; location.reload(); }
      });
      document.getElementById('editExit').addEventListener('click', function () {
        if (!dirty || confirm('Leave without saving?')) { dirty = false; location.href = location.pathname; }
      });
      document.getElementById('editForget').addEventListener('click', function () {
        store(TOKEN_KEY, null); status('Token removed from this browser.');
      });
    }).catch(function (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404) {
        store(TOKEN_KEY, null);
        alert('GitHub refused that token (' + err.message + '). Reload with ?edit and paste a token with Contents read & write access to ' + REPO + '.');
      } else {
        alert('Could not load this page from GitHub: ' + err.message);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
