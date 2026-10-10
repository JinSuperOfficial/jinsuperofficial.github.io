/**
 * /lib/manifest.js — 清单的唯一读取器 + 唯一图标注册表
 * ---------------------------------------------------
 * 解决的事：以前 skills.json 被 5 个页面各解析一遍，各自带一套「猜 kind / 猜图标 /
 * 拼路径」逻辑，改一处漏四处；811 的 tools.json 又是另一套 schema。现在只有这一份。
 *
 *   归一（normalizeCollection）→ 排序（sortItems）→ 渲染（renderCards）/ 兜底（showEmpty）
 *
 * 页面上就三行：
 *   <script src="/lib/manifest.js"></script>
 *   <script>
 *     JSManifest.loadCollection('/class/tools.json').then(col => {
 *       JSManifest.renderCards(document.getElementById('tool-grid'), col.items,
 *         { template: '#tpl-tool-card' });
 *     });
 *   </script>
 *
 * 为什么是经典脚本 + 全局，而不是 ES module：
 *   ① 站点既有的两份运行时（p/docs-md.js、p/docs-card.js）都是经典脚本；
 *   ② 测试用的 jsdom 不执行 type="module"，而经典脚本可以用 window.eval 注入
 *      —— build/test-manifest.mjs 正是这么跑的；
 *   ③ build/*.mjs 需要同一份规则时，用 build/lib/site-lib.mjs 在 vm 里加载这个文件，
 *      逻辑永远只有一份。见 MANIFEST.md。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   /* Node（vm 里） */
  else root.JSManifest = api;                                              /* 浏览器 */
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_ORDER = 999;
  const KIND_DEFAULT = 'page';
  const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

  /* ═══════════════════════════════════════════════════
     图标注册表（全站唯一一份）
     ---------------------------------------------------
     值是 <svg> 里面的内容，两种渲染方式都能用：
       · 模板法（811 页）：模板里放好 <svg>，只填 innerHTML → iconMarkup(name)
       · 字符串法：直接拼整段 svg                      → iconSvg(name)
     加图标：在下面加一个名字，清单里写 "icon": "这个名字"。
     不想进注册表：清单里写 "iconSvg"（原始内容）或 "iconFile"（引用 /asset/icon/*.svg）。
     ═══════════════════════════════════════════════════ */
  const ICONS = {
    /* 811 专区 */
    clipboardCheck:
      '<path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z"/>' +
      '<path d="M8 6H6.5A1.5 1.5 0 0 0 5 7.5v12A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 17.5 6H16"/>' +
      '<path d="m9 13.5 2 2 4-4"/>',
    calendar:
      '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/>' +
      '<path d="M3.5 9.5h17M8.5 9.5v11M15 9.5v11"/>',
    audio:
      '<path d="M4 9.8h3.1L12 6.2v11.6L7.1 14.2H4a1 1 0 0 1-1-1v-2.4a1 1 0 0 1 1-1Z"/>' +
      '<path d="M15.6 9.6a3.5 3.5 0 0 1 0 4.8"/>' +
      '<path d="M18.2 7.2a7 7 0 0 1 0 9.6"/>',
    grid:
      '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/>' +
      '<rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/>' +
      '<rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/>' +
      '<rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',

    /* 旧的按 kind 取的图标：名字换成中性的，图形一字未改 */
    curve:   '<path d="M3 17c2.6 0 3.4-10 6.6-10S13 15 16 15s2.4-4 5-4"/>',
    palette: '<circle cx="12" cy="12" r="9"/>' +
             '<circle cx="9" cy="9.5" r="1.2" fill="currentColor" stroke="none"/>' +
             '<circle cx="15" cy="9.5" r="1.2" fill="currentColor" stroke="none"/>' +
             '<circle cx="9.5" cy="15" r="1.2" fill="currentColor" stroke="none"/>',
    monitor: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
    file:    '<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>' +
             '<path d="M14 3v6h6"/>',
    gamepad: '<rect x="2" y="7" width="20" height="11" rx="4"/>' +
             '<path d="M7 12h2M8 11v2M15.5 12h.01M17.5 13.5h.01"/>',
    wrench:  '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21H3l9.3-9.3a4 4 0 0 0 5-5l-2.6 2.6-2.2-2.2 2.6-2.6Z"/>',
    list:    '<path d="M4 7h16M4 12h16M4 17h10"/>',

    /* 兜底 */
    default: '<circle cx="12" cy="12" r="8"/>',
  };

  const ICON_NAMES = Object.keys(ICONS);

  /** <svg> 里的内容；名字不认识就回落 default */
  function iconMarkup(name) {
    return ICONS[name] || ICONS.default;
  }

  /** 整段 <svg>（字符串拼接方式用）；默认 1.9，和首页原来的卡片图标一致，别随手改 */
  function iconSvg(name, strokeWidth) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      `stroke-width="${strokeWidth == null ? 1.9 : strokeWidth}" ` +
      'stroke-linecap="round" stroke-linejoin="round">' + iconMarkup(name) + '</svg>';
  }

  /* ═══════════════════════════════════════════════════
     小工具
     ═══════════════════════════════════════════════════ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** 搜索高亮：只加 <mark>，文本全部转义 */
  function highlight(text, query) {
    const src = String(text == null ? '' : text);
    if (!query) return esc(src);
    const q = String(query);
    const idx = src.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return esc(src);
    return esc(src.slice(0, idx)) + '<mark>' + esc(src.slice(idx, idx + q.length)) + '</mark>' +
      esc(src.slice(idx + q.length));
  }

  /** 逐段 percent-encode（'.' / '..' 保持原样，中文要编码） */
  function encodePath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  /** 只给显示用：'Skills/../class/x.html' → 'class/x.html' */
  function sitePath(p) {
    const segs = [];
    for (const s of String(p).split('/')) {
      if (!s || s === '.') continue;
      if (s === '..') { segs.pop(); continue; }
      segs.push(s);
    }
    return segs.join('/');
  }

  /** 清单 URL（'/class/tools.json'）所在目录（'/class/'），相对路径的基准 */
  function dirOf(url) {
    const s = String(url == null ? '' : url).split(/[?#]/)[0];
    const i = s.lastIndexOf('/');
    if (i < 0) return '/';
    const dir = s.slice(0, i + 1);
    return dir.charAt(0) === '/' ? dir : '/';
  }

  /**
   * href 归一成站点根绝对路径。
   *   '/class/x.html'       → '/class/x.html'
   *   './x.html' + /class/  → '/class/x.html'
   *   '../x.html' + /class/ → '/x.html'
   *   外链（http:、//、data:、mailto:）原样返回；'#' / '?' 之后原样保留
   */
  function resolveHref(href, base) {
    const raw = String(href == null ? '' : href).trim();
    if (!raw) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.slice(0, 2) === '//') return raw;

    const m = /^([^?#]*)([?#][\s\S]*)?$/.exec(raw);
    const path = m[1];
    const tail = m[2] || '';

    if (path.charAt(0) === '/') return encodePath(path) + tail;

    const segs = String(base || '/').split('/').filter(Boolean);
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { segs.pop(); continue; }
      segs.push(part);
    }
    return encodePath('/' + segs.join('/')) + tail;
  }

  /* ═══════════════════════════════════════════════════
     归一
     ═══════════════════════════════════════════════════ */

  function issue(level, code, message) { return { level, code, message }; }

  /**
   * 单条归一。结构化错误（缺 id/title/href）→ 跳过该条并记 error；
   * 风格问题（旧字段、相对路径、图标名错）→ 记 warn（strict 时图标名记 error）。
   */
  function normalizeItem(raw, opts) {
    const o = opts || {};
    const base = o.base || '/';
    const collection = o.collection || 'default';
    const strict = !!o.strict;
    const issues = [];
    const badIcon = strict ? 'error' : 'warn';

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { item: null, issues: [issue('error', 'not-object', '条目不是对象，已跳过')] };
    }

    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id || !ID_RE.test(id)) {
      return {
        item: null,
        issues: [issue('error', 'bad-id',
          `${collection}: id 缺失或非法（${JSON.stringify(raw.id == null ? '' : raw.id)}），已跳过`)],
      };
    }
    const at = `${collection}/${id}`;

    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) return { item: null, issues: [issue('error', 'no-title', `${at}: 缺 title，已跳过`)] };

    const hrefRaw = typeof raw.href === 'string' ? raw.href.trim() : '';
    const fileRaw = typeof raw.file === 'string' ? raw.file.trim() : '';
    if (!hrefRaw && !fileRaw) {
      return { item: null, issues: [issue('error', 'no-href', `${at}: 缺 href，已跳过`)] };
    }
    if (!hrefRaw && fileRaw) {
      issues.push(issue('warn', 'legacy-file', `${at}: 还在用旧字段 file，已按清单所在目录解析`));
    }

    const href = resolveHref(hrefRaw || fileRaw, base);
    if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(href)) {
      issues.push(issue('error', 'relative-href', `${at}: href 不是站点根绝对路径（${href}）`));
    }

    /* 图标三选一：iconSvg（原始）> iconFile（文件）> icon（注册表名字） */
    let iconSvgRaw = typeof raw.iconSvg === 'string' ? raw.iconSvg.trim() : '';
    let icon = typeof raw.icon === 'string' ? raw.icon.trim() : '';
    if (!iconSvgRaw && icon.charAt(0) === '<') { iconSvgRaw = icon; icon = ''; }
    const iconFile = typeof raw.iconFile === 'string' ? resolveHref(raw.iconFile, base) : '';
    if (!iconSvgRaw && !iconFile) {
      if (!icon) icon = 'default';
      if (!ICONS[icon]) {
        issues.push(issue(badIcon, 'unknown-icon',
          `${at}: 图标名「${icon}」不在 lib/manifest.js 的 ICONS 里，已回落 default`));
        icon = 'default';
      }
    }

    const orderNum = Number(raw.order);
    const order = Number.isFinite(orderNum) ? orderNum : DEFAULT_ORDER;
    if (raw.order != null && !Number.isFinite(orderNum)) {
      issues.push(issue('warn', 'bad-order', `${at}: order 不是数字，按 ${DEFAULT_ORDER} 处理`));
    }

    const item = {
      id,
      key: `${collection}/${id}`,
      collection,
      title,
      desc: raw.desc == null ? '' : String(raw.desc),
      href,
      icon: iconSvgRaw || iconFile ? '' : icon,
      iconSvg: iconSvgRaw,
      iconFile,
      kind: typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : KIND_DEFAULT,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === 'string' && t.trim()) : [],
      order,
      hidden: !!raw.hidden,
      priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : null,
      raw,
    };
    return { item, issues };
  }

  /**
   * 整个 collection 归一：丢掉 hidden、按 order 升序、id 去重。
   * @returns {{collection,title,root,items,problems}}
   */
  function normalizeCollection(raw, opts) {
    const o = opts || {};
    const problems = [];
    const isObj = raw && typeof raw === 'object' && !Array.isArray(raw);
    const list = Array.isArray(raw) ? raw : (isObj && Array.isArray(raw.items) ? raw.items : null);

    if (!list) {
      return {
        collection: (isObj && raw.collection) || o.collection || 'default',
        title: (isObj && raw.title) || '',
        root: '',
        items: [],
        problems: [issue('error', 'bad-shape', '清单顶层既不是数组，也没有 items 数组')],
      };
    }

    const name = (isObj && typeof raw.collection === 'string' && raw.collection.trim())
      ? raw.collection.trim() : (o.collection || 'default');

    const items = [];
    const seen = {};
    for (const rawItem of list) {
      const r = normalizeItem(rawItem, { base: o.base, collection: name, strict: o.strict });
      problems.push.apply(problems, r.issues);
      if (!r.item) continue;
      if (seen[r.item.id]) {
        problems.push(issue('error', 'dup-id', `${name}/${r.item.id}: id 重复，只保留第一条`));
        continue;
      }
      seen[r.item.id] = true;
      if (!r.item.hidden) items.push(r.item);
    }

    return {
      collection: name,
      title: (isObj && typeof raw.title === 'string') ? raw.title : '',
      root: (isObj && typeof raw.root === 'string') ? resolveHref(raw.root, o.base) : '',
      items: sortItems(items),
      problems,
    };
  }

  /** order 升序；order 相同时按标题排，避免每次渲染顺序抖动 */
  function sortItems(items) {
    return items.slice().sort((a, b) =>
      (a.order - b.order) || String(a.title).localeCompare(String(b.title), 'zh'));
  }

  /**
   * 读一个清单。失败不抛异常，返回 ok:false + 兜底信息。
   */
  async function loadCollection(url, opts) {
    const o = opts || {};
    const base = o.base || dirOf(url);
    const doFetch = o.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    try {
      if (!doFetch) throw new Error('当前环境没有 fetch');
      const res = await doFetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const out = normalizeCollection(data, { base, collection: o.collection, strict: o.strict });
      /* 顶层结构不对（不是数组、也没有 items）算读取失败，不是「空清单」 */
      out.ok = !out.problems.some(function (p) { return p.code === 'bad-shape'; });
      return out;
    } catch (err) {
      const message = String((err && err.message) || err);
      return {
        ok: false,
        error: message,
        collection: o.collection || '',
        title: '',
        root: '',
        items: [],
        problems: [issue('error', 'load-failed', `读不到 ${url}：${message}`)],
      };
    }
  }

  /**
   * 首页用：把多个 collection 按声明顺序分组，跨集合重复 href 只留第一条。
   */
  function mergeCollections(results) {
    const groups = [];
    const problems = [];
    const seenHref = {};
    for (const r of results || []) {
      if (!r) continue;
      problems.push.apply(problems, r.problems || []);
      const items = [];
      for (const it of r.items || []) {
        if (seenHref[it.href]) {
          problems.push(issue('warn', 'dup-href',
            `${it.key}: 与前面某条指向同一地址（${it.href}），已跳过`));
          continue;
        }
        seenHref[it.href] = true;
        items.push(it);
      }
      groups.push({ collection: r.collection, title: r.title || r.collection, root: r.root || '', items });
    }
    return {
      groups,
      total: groups.reduce((n, g) => n + g.items.length, 0),
      problems,
    };
  }

  /* ═══════════════════════════════════════════════════
     渲染（DOM 部分：Node 里 import 这个文件不会碰到）
     ═══════════════════════════════════════════════════ */

  /**
   * 按模板渲染卡片。
   *   <template id="tpl-x"><a class="card"> … <svg></svg> … <h2></h2><p></p> </a></template>
   *
   * opts：
   *   template    模板元素或选择器（必填）
   *   append      true 则追加而不是替换（分组渲染用）
   *   iconSlot    默认 '.card-ico svg, .card-icon svg'
   *   titleSlot   默认 '.card-title, h2'
   *   descSlot    默认 '.card-desc, p'
   *   decorate    (card, item, index) => void，页面自己补序号 / kind 标签 / 路径 / 搜索高亮
   *   lead        true 时给第一张卡加 .card-lead（首页「首卡跨两列」用）
   */
  function renderCards(grid, items, opts) {
    const o = opts || {};
    if (!grid) throw new Error('renderCards: 找不到容器');
    const tpl = typeof o.template === 'string' ? document.querySelector(o.template) : o.template;
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) {
      throw new Error('renderCards: 找不到卡片模板（' + (o.template || '未传 template') + '）');
    }

    const iconSel = o.iconSlot || '.card-ico svg, .card-icon svg';
    const titleSel = o.titleSlot || '.card-title, h2';
    const descSel = o.descSlot || '.card-desc, p';

    const nodes = (items || []).map(function (it, index) {
      const card = tpl.content.firstElementChild.cloneNode(true);

      card.setAttribute('href', it.href);
      card.dataset.id = it.id;
      card.dataset.key = it.key;
      card.dataset.href = it.href;
      if (o.lead && index === 0) card.classList.add('card-lead');

      const icon = card.querySelector(iconSel);
      if (icon) {
        if (it.iconSvg) {
          icon.innerHTML = it.iconSvg;
        } else if (it.iconFile) {
          const img = document.createElement('img');
          img.src = it.iconFile;
          img.alt = '';
          img.width = 20;
          img.height = 20;
          icon.replaceWith(img);
        } else {
          icon.innerHTML = iconMarkup(it.icon);
        }
      }

      const title = card.querySelector(titleSel);
      if (title) title.textContent = it.title;
      const desc = card.querySelector(descSel);
      if (desc) desc.textContent = it.desc;

      if (typeof o.decorate === 'function') o.decorate(card, it, index, o);
      return card;
    });

    if (o.append) grid.append.apply(grid, nodes);
    else grid.replaceChildren.apply(grid, nodes);
    return nodes;
  }

  /** 空态 / 错误态：统一 <p class="grid-empty"> */
  function showEmpty(grid, text) {
    if (!grid) return;
    const p = document.createElement('p');
    p.className = 'grid-empty';
    p.textContent = text;
    grid.replaceChildren(p);
  }

  /** 把 problems 打到控制台（页面侧只要看得见；拦截交给 build/verify-manifests.mjs） */
  function logProblems(problems, tag) {
    const t = tag || 'manifest';
    for (const p of problems || []) {
      const say = p.level === 'error' ? console.error : console.warn;
      say('[' + t + '] ' + p.message);
    }
  }

  return {
    DEFAULT_ORDER, KIND_DEFAULT, ID_RE,
    ICONS, ICON_NAMES, iconMarkup, iconSvg,
    esc, highlight, encodePath, sitePath, dirOf, resolveHref,
    normalizeItem, normalizeCollection, sortItems,
    loadCollection, mergeCollections,
    renderCards, showEmpty, logProblems,
  };
});
