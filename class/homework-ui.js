/* 作业页顶栏：弹簧收放的导航 +「更多」面板。
   ------------------------------------------------------------
   只接管顶栏：数据、勾选、截图、留言这些都还是页面自己的脚本。
   渐进增强：html 上的 .hw-ui 在这里（<head>）先加上，body 还没解析，
   所以不会先闪一下旧工具栏；1.5 秒内没初始化完就摘掉，退回旧界面。
   ------------------------------------------------------------ */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('hw-ui');
  setTimeout(() => { if (!root.dataset.hwUiReady) root.classList.remove('hw-ui'); }, 1500);

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* 版面几何：展开态铺满视口、内边距算到正文列；收起态是一枚居中的胶囊。
     两种状态的内容宽都等于正文列，所以收缩过程中按钮不会换行、字不会左右跳。 */
  let geo = null;
  const measure = () => {
    const vw = document.documentElement.clientWidth;
    const mobile = vw <= 767;
    const gutter = mobile ? Math.min(20, Math.max(16, vw * 0.046)) : Math.min(40, Math.max(16, vw * 0.05));
    const column = Math.min(820, vw - gutter * 2);
    const pillW = Math.min(mobile ? vw - 32 : 660, column);
    const pad = mobile ? 12 : 18;
    geo = {
      mobile,
      expanded: { w: vw, h: mobile ? 64 : 72, pad: (vw - column) / 2, r: 0, top: 0 },
      pill: { w: pillW, h: mobile ? 54 : 52, pad, r: 26, top: mobile ? 8 : 12 },
      inner: pillW - pad * 2
    };
    return geo;
  };

  /* ---------- 弹簧 ----------
     进度 p 由滚动位置给出（0 → 1 用完 180px），再用一根真弹簧去追它：
     停手之后还会过冲、回弹、稳住，这才是弹簧，不是 CSS 的固定时长缓动。
     宽度 / 高度 / 内边距 / 圆角 / 顶部偏移全部由同一个 p 插值，
     所以它们是一起「长」出来的，不会有谁先跳一下。 */
  const initHeader = (header) => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const SPAN = 180;
    const s = { p: 0, target: 0, v: 0, raf: 0, last: 0 };

    const paint = () => {
      const g = geo || measure();
      const t = Math.min(1.06, Math.max(0, s.p));       // 允许一点点过冲，但不允许比视口还宽
      const a = g.expanded;
      const b = g.pill;
      header.style.width = `${lerp(a.w, b.w, t).toFixed(1)}px`;
      header.style.height = `${lerp(a.h, b.h, t).toFixed(1)}px`;
      header.style.paddingInline = `${lerp(a.pad, b.pad, t).toFixed(1)}px`;
      header.style.setProperty('--header-radius', `${lerp(a.r, b.r, t).toFixed(1)}px`);
      header.style.top = `${lerp(a.top, b.top, t).toFixed(1)}px`;
      header.style.setProperty('--hw-morph', String(Math.min(1, t)));
      header.classList.toggle('is-scrolled', s.p > 0.5);
    };

    const step = (now) => {
      const dt = Math.min(s.last ? (now - s.last) / 1000 : 1 / 60, 1 / 30);
      s.last = now;
      // 两次半步积分：低帧率下也稳
      for (let i = 0; i < 2; i += 1) {
        s.v += (-220 * (s.p - s.target) - 30 * s.v) * dt / 2;
        s.p += s.v * dt / 2;
      }
      const settled = Math.abs(s.v) < 0.0004 && Math.abs(s.p - s.target) < 0.0004;
      if (settled) { s.p = s.target; s.v = 0; }
      paint();
      if (settled) { s.raf = 0; s.last = 0; }
      else s.raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(step); } };

    const onScroll = (event) => {
      const t = event && event.target;
      // 只认文档本身的滚动；弹窗里滚动列表不该带动顶栏
      if (t && t !== document && t !== document.documentElement && t !== document.body) return;
      const y = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      s.target = clamp01(y / SPAN);
      if (motion.matches) { s.p = s.target; s.v = 0; paint(); return; }
      kick();
    };

    measure();
    s.p = s.target = clamp01((window.pageYOffset || document.documentElement.scrollTop || 0) / SPAN);
    paint();
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    motion.addEventListener?.('change', () => { s.p = s.target; s.v = 0; paint(); });
    return { paint };
  };

  const initMenu = () => {
    const header = document.getElementById('hwHeader');
    const actions = document.getElementById('hwNavActions');
    const panel = document.getElementById('headActs');
    const toggle = document.getElementById('moreToggle');
    const shade = document.getElementById('hwMenuShade');
    const brand = document.querySelector('.hw-brand');
    const tools = document.getElementById('toolsLink');
    if (!header || !actions || !panel || !toggle || !shade || !brand) return null;

    const spring = initHeader(header);

    // 常驻顶栏的两个先搬上来（搬节点，原来的 click 处理器和 id 都还在）
    ['tmBtn', 'shotBtn'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) actions.insertBefore(b, toggle);
    });

    /* 时光机 / 截图常驻顶栏；留言、更新日志「放得下就摆出来」，
       放不下才退回菜单 —— 屏幕大就多显示几个，不再永远只有两个。 */
    const fit = () => {
      const g = geo || measure();
      const msg = document.getElementById('msgBtn');
      const log = document.getElementById('logBtn');
      const tm = document.getElementById('tmBtn');
      const shot = document.getElementById('shotBtn');
      const cands = [msg, log].filter(Boolean);
      const fixed = [tm, shot].filter(Boolean);

      cands.forEach((b) => actions.insertBefore(b, toggle));   // 先摆进来，量它们在顶栏里的真实宽度
      const wasScrolled = header.classList.contains('is-scrolled');
      header.classList.add('is-scrolled');                      // 用收起态量：牌子最宽（多一条进度）
      const brandW = brand.getBoundingClientRect().width;
      const toggleW = toggle.getBoundingClientRect().width;
      header.classList.toggle('is-scrolled', wasScrolled);

      const gap = 6;
      let used = brandW + toggleW + gap * (cands.length + fixed.length + 1);
      fixed.forEach((b) => { used += b.getBoundingClientRect().width; });

      const keep = new Set(fixed);
      if (!g.mobile) {
        for (const b of cands) {
          const w = b.getBoundingClientRect().width;
          if (used + w > g.inner) break;
          used += w;
          keep.add(b);
        }
      }

      // 放不下的回菜单（更新日志在上、留言在下，和原来一致）
      [log, msg].forEach((b) => { if (b && !keep.has(b) && tools) panel.insertBefore(b, tools); });
      // 顶栏里的顺序：留言 → 更新日志 → 时光机 → 截图 → ⋯
      [msg, log, tm, shot].forEach((b) => { if (b && keep.has(b)) actions.insertBefore(b, toggle); });
    };

    /* ---------- 面板内容 ---------- */
    const label = (text) => {
      const item = document.createElement('p');
      item.className = 'hw-menu-label'; item.textContent = text;
      return item;
    };
    panel.prepend(label('显示设置'));
    const divider = document.createElement('div');
    divider.className = 'hw-menu-divider'; divider.setAttribute('role', 'separator');
    const log0 = document.getElementById('logBtn');
    panel.insertBefore(divider, log0);
    const closeButton = document.createElement('button');
    closeButton.type = 'button'; closeButton.className = 'hw-menu-close';
    closeButton.setAttribute('aria-label', '关闭更多操作'); closeButton.textContent = '×';
    panel.prepend(closeButton);

    /* ---------- 开合 ---------- */
    const mobile = window.matchMedia('(max-width:767px)');
    const canHover = window.matchMedia('(hover:hover) and (pointer:fine)');
    let open = false;
    let locked = false;
    let pinned = false;
    let hoverTimer = 0;

    const lock = (on) => {
      if (locked === on) return;
      locked = on;
      if (window.HWLock) { window.HWLock(on); return; }
      document.body.style.overflow = on ? 'hidden' : '';
    };
    const placePanel = () => {
      panel.classList.toggle('hw-mobile-sheet', mobile.matches);
      (mobile.matches ? document.body : header).append(panel);
    };
    const focusables = () => [...panel.querySelectorAll('button:not([disabled]), a[href]')]
      .filter((item) => !item.hidden && item.getClientRects().length);

    const close = (refocus = true) => {
      if (!open) return;
      clearTimeout(hoverTimer);
      open = false;
      pinned = false;
      panel.classList.remove('is-open');
      shade.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '打开更多操作');
      lock(false);
      if (refocus) toggle.focus({ preventScroll: true });
    };
    const show = (focusFirst = true, byHover = false) => {
      if (open) return;
      clearTimeout(hoverTimer);
      placePanel();
      open = true;
      pinned = !byHover;
      panel.classList.add('is-open');
      shade.classList.toggle('is-open', mobile.matches);
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', '关闭更多操作');
      if (mobile.matches) lock(true);
      if (focusFirst) focusables()[0]?.focus({ preventScroll: true });
    };

    /* 桌面：鼠标停在「⋯」上就展开（80ms 缓冲），移开 200ms 收起；
       鼠标展开的不抢焦点，点一下会「钉住」，再点才收。 */
    const hoverOpen = () => {
      if (!canHover.matches || open) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => show(false, true), 80);
    };
    const hoverClose = () => {
      if (!canHover.matches) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (open && !pinned) close(panel.contains(document.activeElement));
      }, 200);
    };
    toggle.addEventListener('mouseenter', hoverOpen);
    toggle.addEventListener('mouseleave', hoverClose);
    panel.addEventListener('mouseenter', () => { if (canHover.matches) clearTimeout(hoverTimer); });
    panel.addEventListener('mouseleave', hoverClose);
    toggle.addEventListener('click', () => {
      if (open && !pinned) { pinned = true; return; }
      if (open) close();
      else show(mobile.matches, false);
    });
    closeButton.addEventListener('click', () => close());
    shade.addEventListener('click', () => close());
    document.addEventListener('click', (event) => {
      if (open && !panel.contains(event.target) && !toggle.contains(event.target)) close(false);
    }, true);
    document.addEventListener('focusin', (event) => {
      if (open && !mobile.matches && !panel.contains(event.target) && event.target !== toggle) close(false);
    });
    document.addEventListener('keydown', (event) => {
      if (!open) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab' && mobile.matches) {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    panel.addEventListener('click', (event) => {
      const hit = event.target.closest('.more-btn');
      if (!hit || hit.hasAttribute('data-keep-open')) return;
      close(!['logBtn', 'msgBtn'].includes(hit.id));
    }, true);

    const onViewport = () => { close(); placePanel(); };
    mobile.addEventListener?.('change', onViewport);

    panel.classList.remove('is-open');
    shade.classList.remove('is-open');
    placePanel();
    fit();
    root.dataset.hwUiReady = '1';

    /* 尺寸变了重算几何、重排按钮；字体加载完再排一次（按钮宽度会变） */
    let rz = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(() => { measure(); spring.paint(); fit(); }, 120);
    }, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => fit()).catch(() => {});
    }

    return { isOpen: () => open, close: () => close() };
  };

  window.HomeworkUI = { initMenu };
})();
