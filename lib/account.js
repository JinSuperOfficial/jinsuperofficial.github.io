/* ===========================================================================
   lib/account.js —— 「金旭的号」：左上角头像 + 登录 + 跨设备同步
   ---------------------------------------------------------------------------
   为什么只有金旭能登：
     账号就一个（用户指定），口令在服务端 class/data/account-api.php 里
     里校验 —— **页面源码里没有 token**（写进 JS 等于给所有人）。

   同步什么（就这两样，别扩张）：
     · 作业打勾：localStorage 里所有 `hw:<日期>:<条目哈希> = '1'`，
       上云时收成 {"2026-11-07":["a1b2c3", …]}，比一条一条存小一个量级；
     · 界面偏好：hw.skin / hw.layout（纸感/极简、单栏/双栏）。
   ★ 只增不减：两边取并集，「取消打勾」不会同步到别的设备（面板上也写明了）。
     想改这条规则得先想清楚「谁删的、什么时候删的」，别顺手加个 union 完事。

   落点（用户要「左上角显示头像」）：
     · 作业页 .head-top 的最前面
     · 811 工具箱的窗口标题栏（红绿灯后面）
     · 报表 / 抽选页的「回 811 工具箱」前面
     · 都找不到就贴在视口左上角（fixed），所以任何页面引了它都不会「消失」
   面板用 position:fixed + 读 chip 的位置来摆，避开父元素的 overflow:hidden。

   连不上怎么办（学校 / 离线副本 / GitHub Pages 上的 .php 都是源码）：
     探测拿不到合法 JSON 就不显示登录框，只写一行「这台设备连不上账号服务」，
     本地打勾照旧 —— 和留言板同一套「降级」，不弹错误框。
   =========================================================================== */
(function () {
  'use strict';

  if (window.JSAccount) return;

  /* ---- 常量 ---- */
  var API_PATHS = ['./data/account-api.php', '/class/data/account-api.php', '/data/account-api.php'];
  var K_USER = 'hwa.user';
  var K_LAST = 'hwa.last';
  var S_RELOAD = 'hwa.reload';
  var PREF_KEYS = ['hw.skin', 'hw.layout'];
  var PUSH_DELAY = 4000;      /* 打一个勾 → 4 秒后合并上传（连着点几个只发一次） */
  var TIMEOUT = 8000;
  var MAX_IDS = 400;          /* 云端最多留 400 天的打勾，超了从最旧的扔 */
  var DONE_RE = /^hw:(.+):([^:]+)$/;

  var MOUNTS = [
    /* 作业页：挂在 <header class="head"> 的最前面（单独一行）。
       别挂进 .head-top —— 那是 `justify-content:space-between` 的横排，
       塞第三个孩子会把 kicker 挤到中间、按钮挤到第二行（真机截图抓到的）。 */
    { sel: '.head', how: 'prepend', cls: 'hwa--head' },
    { sel: '.titlebar .traffic', how: 'append', cls: 'hwa--traffic' },
    { sel: '.wrap > .back', how: 'before', cls: 'hwa--back' }
  ];

  var api = null;             /* 探测成功的接口地址 */
  var probeFailed = false;    /* 探过了、一条都不通（离线副本 / 学校网络） */
  var busy = false;
  var pushTimer = 0;
  var ui = null;              /* 渲染出来的那些节点 */
  /* 上一次的状态行：面板是整块重建的，重建完要把它贴回去，
     否则「连不上账号服务」这种话一点开就没了 */
  var lastStatus = { text: '', tone: '' };

  /* ---------------------------------------------------------------- 小工具 */
  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* 满了就算了 */ }
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }
  function readJSON(k, d) {
    var raw = lsGet(k);
    if (!raw) return d;
    try {
      var v = JSON.parse(raw);
      return v == null ? d : v;
    } catch (e) { return d; }
  }

  function getUser() {
    var u = readJSON(K_USER, null);
    if (!u || typeof u.name !== 'string' || typeof u.token !== 'string') return null;
    if (!u.name || !u.token) return null;
    return { name: u.name, token: u.token };
  }

  /* ------------------------------------------------------------ 数据收集 */
  /** localStorage 里所有打勾 → {"2026-11-07":["a1b2c3"]} */
  function collectDone() {
    var out = {};
    var n = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('hw:') !== 0) continue;
        if (localStorage.getItem(k) !== '1') continue;
        var m = DONE_RE.exec(k);
        if (!m) continue;
        if (!out[m[1]]) out[m[1]] = [];
        out[m[1]].push(m[2]);
        if (++n > 6000) break;
      }
    } catch (e) { /* 隐私模式下 localStorage 可能直接抛 */ }
    return out;
  }

  function collectPrefs() {
    var out = {};
    PREF_KEYS.forEach(function (k) {
      var v = lsGet(k);
      if (v != null && v !== '') out[k] = v;
    });
    return out;
  }

  /** 归一并排序：键顺序固定，才能拿 JSON.stringify 直接比「有没有变化」 */
  function norm(map) {
    var out = {};
    if (!map || typeof map !== 'object') return out;
    Object.keys(map).forEach(function (id) {
      var arr = map[id];
      if (!Array.isArray(arr)) return;
      var seen = {};
      var list = [];
      arr.forEach(function (h) {
        if (typeof h === 'string' && h && !seen[h]) { seen[h] = 1; list.push(h); }
      });
      if (list.length) { list.sort(); out[id] = list; }
    });
    return out;
  }

  function mergeDone(a, b) {
    var out = {};
    [a, b].forEach(function (map) {
      Object.keys(map || {}).forEach(function (id) {
        if (!out[id]) out[id] = [];
        map[id].forEach(function (h) { out[id].push(h); });
      });
    });
    return capIds(norm(out));
  }

  function capIds(map) {
    var ids = Object.keys(map).sort();
    if (ids.length > MAX_IDS) {
      ids.slice(0, ids.length - MAX_IDS).forEach(function (id) { delete map[id]; });
    }
    return map;
  }

  /** 把云端那份合进本机；返回真正写进去的条数（用来决定要不要 reload） */
  function applyCloud(done, prefs) {
    var touched = 0;
    Object.keys(done).forEach(function (id) {
      done[id].forEach(function (h) {
        var k = 'hw:' + id + ':' + h;
        if (lsGet(k) !== '1') { lsSet(k, '1'); touched++; }
      });
    });
    PREF_KEYS.forEach(function (k) {
      if (prefs && prefs[k] != null && prefs[k] !== '' && !lsGet(k)) {
        lsSet(k, String(prefs[k]));
        touched++;
      }
    });
    return touched;
  }

  /* -------------------------------------------------------------- 网络 */
  function post(url, body) {
    return new Promise(function (resolve, reject) {
      if (typeof fetch !== 'function') { reject(new Error('这个浏览器不支持 fetch')); return; }
      var ctl = null;
      try { if (typeof AbortController === 'function') ctl = new AbortController(); } catch (e) {}
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { if (ctl) ctl.abort(); } catch (e) {}
        reject(new Error('超时'));
      }, TIMEOUT);

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        signal: ctl ? ctl.signal : undefined
      }).then(function (res) {
        if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '?'));
        return res.text();
      }).then(function (txt) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var json = null;
        try { json = JSON.parse(String(txt).replace(/^\uFEFF/, '')); } catch (e) {}
        if (!json || typeof json !== 'object') { reject(new Error('不是 JSON')); return; }
        resolve(json);
      }).catch(function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /** 找到能用的接口（一次探测，之后记住） */
  function ensureApi() {
    if (api) return Promise.resolve(api);
    return new Promise(function (resolve) {
      var i = 0;
      (function next() {
        if (i >= API_PATHS.length) { probeFailed = true; resolve(null); return; }
        var url = API_PATHS[i++];
        post(url, { action: 'ping' }).then(function (json) {
          if (json && json.ok && json.service === 'hw-account') { api = url; resolve(url); }
          else next();
        }, next);
      })();
    });
  }

  /* -------------------------------------------------------------- 同步 */
  function sync(opts) {
    var initial = !!(opts && opts.initial);
    var user = getUser();
    if (!user) return Promise.resolve(null);
    if (busy) {
      /* 正在同步：等它完再补一次，别把这次打勾丢了 */
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () { sync(opts); }, 1600);
      return Promise.resolve(null);
    }
    busy = true;
    setStatus('正在同步…');
    renderBusy(true);

    return ensureApi().then(function (url) {
      if (!url) throw new Error('这台设备连不上账号服务（离线副本 / 学校网络 / 镜像站都算）');
      return post(url, { action: 'load', name: user.name, token: user.token }).then(function (res) {
        if (!res || !res.ok) {
          var msg = (res && res.error) || '读不到云端';
          var err = new Error(msg);
          err.reason = res && res.reason;
          throw err;
        }
        var data = (res.data && typeof res.data === 'object') ? res.data : {};
        var cloudDone = norm(data.done);
        var cloudPrefs = data.prefs && typeof data.prefs === 'object' ? data.prefs : {};
        var merged = mergeDone(cloudDone, collectDone());
        var touched = applyCloud(merged, cloudPrefs);
        var payload = {
          v: 1,
          done: merged,
          prefs: collectPrefs(),
          at: new Date().toISOString()
        };
        var same = JSON.stringify(cloudDone) === JSON.stringify(merged) &&
                   JSON.stringify(norm(cloudPrefs)) === JSON.stringify(norm(payload.prefs));
        lsSet(K_LAST, payload.at);
        if (same) return { touched: touched, saved: false };
        /* 发对象（不是字符串）：热铁盒会给请求再转义一层引号，字符串字段到服务端就废了；
           对象是服务端自己 encode 的，跟平台的转义无关。见 account-api.php 顶部。 */
        return post(url, { action: 'save', name: user.name, token: user.token, data: payload })
          .then(function (res2) {
            if (!res2 || !res2.ok) throw new Error((res2 && res2.error) || '存不上去');
            if (res2.at) lsSet(K_LAST, res2.at);
            return { touched: touched, saved: true };
          }, function (err) {
            /* 存失败不算致命：本机已经合过了，下次再推 */
            if (err && /超时|fetch|Network/i.test(err.message || '')) throw err;
            return { touched: touched, saved: false, warn: err && err.message };
          });
      });
    }).then(function (out) {
      busy = false;
      renderBusy(false);
      setStatus(out && out.saved ? '已同步' : '已是最新', 'ok');
      updateMeta();
      /* 云端有本机没有的勾：页面已经画完了，只能刷一次（20 秒内不重复刷） */
      if (out && out.touched && initial) {
        var last = Number(sessionStorage.getItem(S_RELOAD) || 0);
        if (!last || Date.now() - last > 20000) {
          try { sessionStorage.setItem(S_RELOAD, String(Date.now())); } catch (e) {}
          location.reload();
          return out;
        }
      }
      return out;
    }).catch(function (err) {
      busy = false;
      renderBusy(false);
      setStatus((err && err.message) || '同步失败', 'err');
      return null;
    });
  }

  function schedulePush() {
    if (!getUser()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { sync({ initial: false }); }, PUSH_DELAY);
  }

  /* ---------------------------------------------------------------- 界面 */
  function svgPerson() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"/>' +
      '<path d="M4.8 20.4c0-3.6 3.2-5.6 7.2-5.6s7.2 2 7.2 5.6"/></svg>';
  }

  function mountHost() {
    for (var i = 0; i < MOUNTS.length; i++) {
      var m = MOUNTS[i];
      var anchor = document.querySelector(m.sel);
      if (!anchor || !anchor.parentNode) continue;
      var host = el('div', 'hwa ' + m.cls);
      if (m.how === 'prepend') anchor.insertBefore(host, anchor.firstChild);
      else if (m.how === 'append') anchor.appendChild(host);
      else anchor.parentNode.insertBefore(host, anchor);
      return host;
    }
    var fixed = el('div', 'hwa hwa--fixed');
    document.body.appendChild(fixed);
    return fixed;
  }

  function build() {
    var host = mountHost();

    var chip = el('button', 'hwa-chip');
    chip.type = 'button';
    chip.setAttribute('aria-expanded', 'false');
    chip.setAttribute('aria-label', '账号');
    var face = el('span', 'hwa-face');
    var label = el('span', 'hwa-label');
    chip.appendChild(face);
    chip.appendChild(label);

    var panel = el('section', 'hwa-panel');
    panel.hidden = true;
    panel.id = 'hwa-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '金旭的号');
    chip.setAttribute('aria-controls', 'hwa-panel');

    host.appendChild(chip);
    host.appendChild(panel);

    ui = { host: host, chip: chip, face: face, label: label, panel: panel };

    chip.addEventListener('click', function () {
      if (panel.hidden) openPanel();
      else closePanel();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !panel.hidden) closePanel();
    });
    document.addEventListener('click', function (ev) {
      if (panel.hidden) return;
      if (host.contains(ev.target)) return;
      closePanel();
    });
    window.addEventListener('resize', function () { if (!panel.hidden) placePanel(); });
    window.addEventListener('scroll', function () { if (!panel.hidden) placePanel(); }, true);

    renderChip();
    renderPanel();
  }

  function placePanel() {
    if (!ui) return;
    var r = ui.chip.getBoundingClientRect();
    var w = 296;
    var left = Math.min(Math.max(12, r.left), Math.max(12, window.innerWidth - w - 12));
    var top = r.bottom + 8;
    /* 下面放不下就翻到上面（手机上尤其常见） */
    var ph = ui.panel.offsetHeight || 220;
    if (top + ph > window.innerHeight && r.top > ph) {
      top = Math.max(12, r.top - 8 - ph);
    }
    ui.panel.style.left = left + 'px';
    ui.panel.style.top = top + 'px';
  }

  function openPanel() {
    if (!ui) return;
    ui.panel.hidden = false;
    ui.chip.setAttribute('aria-expanded', 'true');
    renderPanel();
    placePanel();
    var first = ui.panel.querySelector('input');
    if (first) first.focus();
  }

  function closePanel() {
    if (!ui) return;
    ui.panel.hidden = true;
    ui.chip.setAttribute('aria-expanded', 'false');
  }

  function setStatus(text, tone) {
    lastStatus = { text: text || '', tone: tone || '' };
    if (!ui) return;
    var s = ui.panel.querySelector('.hwa-status');
    if (!s) return;
    s.textContent = lastStatus.text;
    if (lastStatus.tone) s.setAttribute('data-tone', lastStatus.tone);
    else s.removeAttribute('data-tone');
  }

  /** 重建面板之后，把上一次的状态贴回去 */
  function restoreStatus() {
    if (!lastStatus.text) return;
    var s = ui.panel.querySelector('.hwa-status');
    if (!s) return;
    s.textContent = lastStatus.text;
    if (lastStatus.tone) s.setAttribute('data-tone', lastStatus.tone);
  }

  function renderBusy(on) {
    if (!ui) return;
    var btns = ui.panel.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = !!on;
  }

  function fmtTime(iso) {
    if (!iso) return '还没同步过';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '还没同步过';
    var now = new Date();
    var same = d.toDateString() === now.toDateString();
    function two(n) { return n < 10 ? '0' + n : String(n); }
    return same
      ? '上次同步 ' + two(d.getHours()) + ':' + two(d.getMinutes())
      : '上次同步 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
        two(d.getHours()) + ':' + two(d.getMinutes());
  }

  function updateMeta() {
    if (!ui) return;
    var meta = ui.panel.querySelector('.hwa-meta');
    if (meta) meta.textContent = fmtTime(lsGet(K_LAST));
  }

  function renderChip() {
    var user = getUser();
    ui.chip.setAttribute('data-on', user ? '1' : '0');
    ui.face.textContent = '';
    if (user) {
      ui.face.textContent = String(user.name).slice(-1);
      ui.label.textContent = user.name;
      ui.chip.setAttribute('aria-label', user.name + ' · 已登录');
    } else {
      ui.face.innerHTML = svgPerson();
      ui.label.textContent = '登录';
      ui.chip.setAttribute('aria-label', '登录金旭的号');
    }
  }

  function renderPanel() {
    if (!ui) return;
    var panel = ui.panel;
    var user = getUser();
    /* 整块重建：内容少、状态只有两种，重建比 diff 稳 */
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    var title = el('h2', 'hwa-title');
    var desc = el('p', 'hwa-desc');

    if (!user) {
      title.textContent = '金旭的号 · 登录 / 注册';
      desc.textContent = '只有金旭的号能登，token 在微信找我要（别处都拿不到）。' +
        '第一次登录就等于注册。登完这台设备和学校那台看到的是同一份打勾。';
      panel.appendChild(title);
      panel.appendChild(desc);

      var form = el('form', 'hwa-form');
      var row1 = el('div', 'hwa-row');
      var nameIn = el('input', 'hwa-input');
      nameIn.name = 'name';
      nameIn.type = 'text';
      nameIn.value = '金旭';
      nameIn.setAttribute('aria-label', '名字');
      nameIn.setAttribute('autocomplete', 'username');
      row1.appendChild(nameIn);

      var row2 = el('div', 'hwa-row');
      var tokenIn = el('input', 'hwa-input');
      tokenIn.name = 'token';
      tokenIn.type = 'password';
      tokenIn.placeholder = 'token（微信找我要）';
      tokenIn.setAttribute('aria-label', 'token');
      tokenIn.setAttribute('autocomplete', 'current-password');
      row2.appendChild(tokenIn);

      var row3 = el('div', 'hwa-row');
      var go = el('button', 'hwa-btn primary');
      go.type = 'submit';
      go.textContent = '登录 / 注册';
      row3.appendChild(go);

      form.appendChild(row1);
      form.appendChild(row2);
      form.appendChild(row3);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var name = String(nameIn.value || '').trim();
        var token = String(tokenIn.value || '').trim();
        if (!name) { setStatus('先填名字', 'err'); return; }
        if (!token) { setStatus('token 还没填 —— 在微信找我要', 'err'); return; }
        setStatus('正在登录…');
        login(name, token).then(function (ok) {
          if (!ok) return;
          renderChip();
          renderPanel();
          openPanel();
          setStatus('登录好了，同步中…', 'ok');
          sync({ initial: true });
        });
      });

      panel.appendChild(form);

      var st = el('p', 'hwa-status');
      st.setAttribute('role', 'status');
      st.setAttribute('aria-live', 'polite');
      panel.appendChild(st);

      var note = el('p', 'hwa-note');
      note.textContent = '账号只有一个（金旭）。token 在服务端校验，页面源码里没有 —— ' +
        '所以别人翻源码也拿不到。';
      panel.appendChild(note);

      /* 探过了但一条都不通：直接把原因说出来（不用点登录才发现） */
      if (probeFailed) setStatus('这台设备连不上账号服务，先只记在本机', 'err');
      restoreStatus();
      return;
    }

    title.textContent = user.name + ' · 已登录';
    desc.textContent = '作业打勾会跟着你走：家里、学校那台、手机上看到的是同一份。' +
      '（只同步「已经打上的」，取消打勾不会传到别的设备。）';
    panel.appendChild(title);
    panel.appendChild(desc);

    var acts = el('div', 'hwa-row');
    var now = el('button', 'hwa-btn primary');
    now.type = 'button';
    now.textContent = '立即同步';
    now.addEventListener('click', function () {
      if (busy) return;
      setStatus('正在同步…');
      sync({ initial: true });
    });
    var out = el('button', 'hwa-btn');
    out.type = 'button';
    out.textContent = '退出登录';
    out.addEventListener('click', function () {
      lsDel(K_USER);
      lsDel(K_LAST);
      renderChip();
      renderPanel();
      openPanel();
      setStatus('已经退出（本机打勾还在）', 'ok');
    });
    acts.appendChild(now);
    acts.appendChild(out);
    panel.appendChild(acts);

    var meta = el('p', 'hwa-meta');
    meta.textContent = fmtTime(lsGet(K_LAST));
    meta.style.cssText = 'margin:8px 0 0;font-size:11px;color:var(--ink-faint,#A9A29A)';
    panel.appendChild(meta);

    var st2 = el('p', 'hwa-status');
    st2.setAttribute('role', 'status');
    st2.setAttribute('aria-live', 'polite');
    panel.appendChild(st2);

    var note2 = el('p', 'hwa-note');
    note2.textContent = 'token 就是留言板删留言那个口令。想换设备，在新设备上登一次就行。';
    panel.appendChild(note2);
    restoreStatus();
  }

  /* 登录 = login 动作（第一次就是注册）；成功才把 token 存下来 */
  function login(name, token) {
    return ensureApi().then(function (url) {
      if (!url) throw new Error('这台设备连不上账号服务（离线副本 / 学校网络 / 镜像站都算）');
      return post(url, { action: 'login', name: name, token: token });
    }).then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || '登录失败');
      lsSet(K_USER, JSON.stringify({ name: res.name || name, token: token }));
      if (res.at) lsSet(K_LAST, res.at);
      return true;
    }).catch(function (err) {
      setStatus((err && err.message) || '登录失败', 'err');
      return false;
    });
  }

  /* ------------------------------------------------------------ 变化监听 */
  function watchCheckboxes() {
    if (typeof MutationObserver !== 'function') return;
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target;
        if (t && t.classList && t.classList.contains('hw-item')) { schedulePush(); return; }
      }
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
  }

  /* ---------------------------------------------------------------- 启动 */
  function start() {
    build();
    /* 登录过的：进页面先合一次云端（只读 + 必要时回写，不动页面 DOM）。
       没登录就不打接口 —— 等用户点开头像再说，省一次请求。 */
    if (getUser()) sync({ initial: true });
    if (document.querySelector('.hw-item')) watchCheckboxes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.JSAccount = {
    sync: sync,
    user: getUser,
    collectDone: collectDone,
    api: function () { return api; }
  };
})();
