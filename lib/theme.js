/* ── 站点主题（亮/暗 + 主题色）────────────────────────────────────────────
   两个维度，都写在 <html> 上，页面 CSS 只认这两个属性：

     data-appearance   light | dark      默认跟随系统（偏好 auto）
     data-accent       amber | blue      默认：暗色 = 现在的橙，亮色 = DeepSeek 蓝

   偏好存在 localStorage：`site.appearance` / `site.accent`（值 `auto` = 跟随）。
   这个脚本必须在 <head> 里同步执行（放在 <style> 前面），首屏才不会闪一下。
   右上角那组按钮也是这里注入的，三个页面共用一份，别在页面里各写一遍。
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var K_APP = 'site.appearance', K_ACC = 'site.accent';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  var subs = [];
  var state = { appearance: 'dark', accent: 'amber', appPref: 'auto', accPref: 'auto' };

  function read(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function sysLight() { return !!(mq && mq.matches); }

  function resolve() {
    var ap = read(K_APP, 'auto'), ac = read(K_ACC, 'auto');
    if (ap !== 'light' && ap !== 'dark') ap = 'auto';
    if (ac !== 'amber' && ac !== 'blue') ac = 'auto';
    var appearance = ap === 'auto' ? (sysLight() ? 'light' : 'dark') : ap;
    var accent = ac === 'auto' ? (appearance === 'light' ? 'blue' : 'amber') : ac;
    state = { appearance: appearance, accent: accent, appPref: ap, accPref: ac };
    return state;
  }

  function apply() {
    var s = resolve(), el = document.documentElement;
    el.setAttribute('data-appearance', s.appearance);
    el.setAttribute('data-accent', s.accent);
    el.setAttribute('data-appearance-pref', s.appPref);
    el.setAttribute('data-accent-pref', s.accPref);
    for (var i = 0; i < subs.length; i++) { try { subs[i](s); } catch (e) {} }
  }

  var ICON = {
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 20.5h8M12 17v3.5"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M5.6 5.6 4.1 4.1M19.9 19.9l-1.5-1.5M18.4 5.6l1.5-1.5M4.1 19.9l1.5-1.5"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.4A8.6 8.6 0 1 1 9.6 3.5a6.9 6.9 0 0 0 10.9 10.9Z"/></svg>',
    amber: '<span class="sw" style="background:#D97757"></span>',
    blue: '<span class="sw" style="background:#4D6BFE"></span>',
    both: '<span class="sw" style="background:linear-gradient(135deg,#D97757 0 50%,#4D6BFE 50% 100%)"></span>'
  };

  function label(s) {
    var ap = { auto: '跟随系统', light: '亮色', dark: '暗色' }[s.appPref];
    var ac = { auto: '跟随明暗', amber: '现在的颜色', blue: 'DeepSeek 蓝' }[s.accPref];
    return { ap: ap, ac: ac };
  }

  var CSS = [
    '.theme-ctl{position:fixed;top:12px;right:12px;z-index:120;display:flex;gap:6px;',
    'font:500 12px/1 "Inter","Segoe UI",-apple-system,"PingFang SC",sans-serif;}',
    '.theme-ctl button{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;',
    'border:1px solid var(--line,rgba(128,128,128,.3));border-radius:var(--radius-control,8px);',
    'background:var(--paper,var(--panel,var(--raised,var(--bg,#111))));',
    'background:color-mix(in srgb,var(--paper,var(--panel,var(--raised,var(--bg,#111)))) 88%,transparent);',
    'color:var(--ink-soft,var(--dim,var(--ink)));cursor:pointer;white-space:nowrap;',
    'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    'transition:border-color .18s ease,color .18s ease,background .18s ease}',
    '.theme-ctl button:hover{border-color:var(--accent);color:var(--ink)}',
    '.theme-ctl button:active{transform:translateY(1px)}',
    '.theme-ctl button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '.theme-ctl svg{width:14px;height:14px;flex:none}',
    '.theme-ctl .sw{width:10px;height:10px;border-radius:var(--radius-pill,999px);flex:none;',
    'box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}',
    '@media (max-width:560px){.theme-ctl button span{display:none}.theme-ctl button{padding:0 8px}}'
  ].join('');

  function build() {
    if (document.querySelector('.theme-ctl')) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var box = document.createElement('div');
    box.className = 'theme-ctl';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', '外观与主题色');

    var b1 = document.createElement('button');
    b1.type = 'button'; b1.className = 'tc-app';
    var b2 = document.createElement('button');
    b2.type = 'button'; b2.className = 'tc-acc';

    b1.addEventListener('click', function () {
      var order = ['auto', 'light', 'dark'];
      write(K_APP, order[(order.indexOf(state.appPref) + 1) % 3]);
      apply();
    });
    b2.addEventListener('click', function () {
      var order = ['auto', 'amber', 'blue'];
      write(K_ACC, order[(order.indexOf(state.accPref) + 1) % 3]);
      apply();
    });

    box.appendChild(b1); box.appendChild(b2);
    (document.body || document.documentElement).appendChild(box);

    subs.push(function (s) {
      var L = label(s);
      b1.innerHTML = ICON[s.appPref] + '<span>' + L.ap + '</span>';
      b2.innerHTML = ICON[s.accPref === 'auto' ? 'both' : s.accPref] + '<span>' + L.ac + '</span>';
      b1.title = '外观：' + L.ap + '（点一下换下一个）';
      b2.title = '主题色：' + L.ac + '（点一下换下一个）';
      b1.setAttribute('aria-label', b1.title);
      b2.setAttribute('aria-label', b2.title);
    });
    apply();   // 订阅刚加进来，先把按钮内容画上
  }

  // 跨标签页同步
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === K_APP || e.key === K_ACC) apply();
  });
  // 跟随系统时，系统换了就跟着换
  if (mq) {
    var onSys = function () { if (state.appPref === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  window.SiteTheme = {
    apply: apply,
    state: function () { return state; },
    set: function (appearance, accent) {
      if (appearance) write(K_APP, appearance);
      if (accent) write(K_ACC, accent);
      apply();
    },
    _subs: subs
  };

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
