/* ═══════════════════════════════════════════════════════
   /docs/info/info.js
   01 目录树   02 图标索引   03 说明（静态）
   ═══════════════════════════════════════════════════════ */

const $ = (s, r = document) => r.querySelector(s);

/* ── 通用：复制 + 提示 ── */
async function copyText(text, tip){
  try{
    await navigator.clipboard.writeText(text);
    toast(tip || '已复制');
  }catch{
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand('copy'); toast(tip || '已复制'); }
    catch{ toast('复制失败', true); }
    document.body.removeChild(ta);
  }
}

let toastTimer = null;
function toast(msg, isErr){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1700);
}

const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

/* ═══════════════════════════════════════════════════════
   01 · 目录树
   ---------------------------------------------------
   结构由 build/gen-site-index.mjs 扫盘生成（docs/info/site-index.js），
   所以「站里有哪些文件」永远不会和现实脱节。
   这里只保留两样扫不出来的东西：
     · DESC —— 每个节点的说明文字（人工维护，按站点绝对路径索引）
     · ICONS —— /asset/icon 的图标名单（第三方图标集，数量由校验器盯着）
   ═══════════════════════════════════════════════════════ */

const TREE = window.SITE_INDEX || { name: '/', dir: true, open: true, children: [] };

const DESC = {
  '/404.html': '404 错误页「所寻之处，一切皆空」，含返回 /Skills/ 的按钮',
  '/robots.txt': '爬虫规则：放行 GPTBot / ClaudeBot 抓 /p/，其余全站允许；指向 sitemap',
  '/sk.json': '文档站清单：分组 → 文档路径（相对 /p/），加文档改这里',
  '/site.json': '站点级目录：有哪些 collection、sitemap 额外条目、校验忽略名单',
  '/index.html': '百宝箱首页：读 site.json 找齐清单，按 collection 分组渲染卡片',
  '/public.html': '空文件（占位，没有内容也没被引用）',
  '/sitemap.xml': '站点地图（由 build/gen-site-index.mjs 生成，别手改）',
  '/favicon.svg': '站点图标（由 build/make-favicon.mjs 从 logo.svg 生成）',
  '/apple-touch-icon.svg': 'iOS 添加到主屏用的图标',
  '/author.png': '作者头像（旧版首页遗留）',

  '/lib/': '站点运行时：清单归一 + 图标注册表，四个卡片页共用这一份',
  '/lib/manifest.js': '唯一清单读取器：归一 / 排序 / 去重 / 渲染 / 图标，浏览器与构建脚本共用',
  '/lib/icons.js': '已废弃：图标注册表已并入 manifest.js，可以删掉',

  '/811/': '八年(11)班专区：作业、课程表与工具入口',
  '/811/index.html': '811 工具箱：读 811/tools.json 渲染卡片，页脚链回百宝箱与工具站',
  '/811/tools.json': '811 专区清单：加工具只改这里',
  '/811/homework.html': '今日份美味作业：读 data/homework.json，勾选状态存 localStorage',
  '/811/classtable.html': '课程表 · 811班：基础版 / 缩略版两套，可切完整课表与今日课程',
  '/811/function.html': 'Plot 图像计算器：瑞士国际主义亮/暗/绿三套主题，函数 / 隐式 / 极坐标 / 参数方程，自变量可用任意单个字母，坐标轴标签自定义，触屏双指缩放-平移-轻点撤回',
  '/811/data/': '作业数据目录',
  '/811/data/homework.json': '作业数据：按科目键 + 特殊字段「笔记」',

  '/Skills/': '工具站主目录：索引、清单、源码查看器',
  '/Skills/index.html': '目录页：读 skills.json 渲染列表，带搜索、面包屑、自定义右键菜单',
  '/Skills/skills.json': '工具站清单：加工具只改这里（格式见 MANIFEST.md）',
  '/Skills/viewer.html': '源码查看器：viewer.html?f=路径 高亮并查看任意页面源码',
  '/Skills/data/': '空目录（作业数据已迁往 /811/data）',
  '/Skills/docs/': '文档类页面与说明',
  '/Skills/docs/docs.html': 'JinSuper 奇思妙想：老地址，跳转页 → 博客首页 /p/（阅读器在 /p/docs.html）',
  '/Skills/docs/blog.html': '随笔本（写作台）：老地址，跳转页 → /p/（写作台已并入博客首页）',
  '/Skills/docs/备注.txt': 'kind 内置值说明：canvas / color / demo / doc / game / tool 的图标与适用场景',
  '/Skills/tools/': '工具',
  '/Skills/tools/homework-static.html': '作业页静态版：历史版本，读同一份 /811/data/homework.json',
  '/Skills/tools/htmlview.html': 'HTML 在线运行：三栏编辑器，HTML / CSS / JS 分标签，实时预览与控制台',
  '/Skills/tools/speedtest.html': '服务器性能测试：本机跑分 + 网络测速（延迟 / 抖动 / 下载 / 上传）',
  '/Skills/tools/test_html_20260919_d04d4f.html': '单摆计算器：周期 T 与摆长 l 任一互算',
  '/Skills/tools/hw-api.php': '作业统计云函数：热铁盒执行，GitHub Pages 上只会被当源码返回',
  '/Skills/idea/': '创意 / 试验页（暂未列入清单）',
  '/Skills/idea/moont.html': '月相演示器：三个视角看懂月球阴影',
  '/Skills/idea/tihu.html': '海风骑行日 · 鹈鹕的自行车：纯 SVG 动画，IK 反解腿部',
  '/Skills/idea/PelicanTest.html': '与 tihu.html 内容基本相同的另一版本',

  '/p/': '文章 / 文档区',
  '/p/index.html': '博客首页：最新几篇 + 标签筛选 + 时间线（活稿与 /p/archive/ 归档稿都在时间线里；构建产出，模板在 build/template/blog.html）',
  '/p/docs.html': '博客「JinSuper 奇思妙想」阅读器：构建产物，模板在 build/template/docs.html，别直接改它',
  '/p/docs-md.js': '文档站的浏览器端渲染器（构建产物）',
  '/p/docs-md.css': '阅读器与文章页的样式（构建产物，含 KaTeX 与正文排版）',
  '/p/docs-card.js': '文档站的 <card> 插件（构建时也会拷一份进 build/lib）',
  '/p/post/': '文章页：构建产出，每篇一个独立网址（给搜索引擎）',
  '/p/feed.xml': '订阅源：构建产出的 RSS 2.0',
  '/p/blog.md': '写作指南：frontmatter 字段与构建产出说明',
  '/p/fonts/': 'KaTeX 字体（20 个 woff2，站点不引用任何外部字体）',
  '/p/raw.php': '云函数：取 .md 真原文，公式才完整；别删',
  '/p/SKILL.md': 'better-theme 技能文档副本',
  '/p/color-theme.md': '配色方案库副本',
  '/p/temp-homework.md': '临时文件：英语作文题（家用机器人），尚未接入作业页',
  '/p/TEST.md': '测试文件，内容仅 sss / # a',
  '/p/para/': '文章源文件',
  '/p/para/1SetUp.md': '启程篇',
  '/p/para/homework.md': '本周作业：iframe 嵌 /811/homework.html',

  '/asset/': '设计素材：图标、配色方案与技能文档',
  '/asset/SKILL.md': 'better-theme 技能文档：反主流美学的设计规范（配色 / 布局 / 文案）',
  '/asset/color-theme.md': '配色库：21 组调色板，覆盖暖调大地 / 冷调自然 / 传统文化 / 现代极简 / 2026 趋势',
  '/asset/功能.md': 'better-interaction 技能：滚动驱动、指针响应、微交互与动效规范',
  '/asset/icon/': 'Ant Design 官方 SVG 图标库（iconfont cid=9402，整理者「竹尔」，非原创）',

  '/docs/': '站点信息文档',
  '/docs/info/': '站点信息页：目录地图 + 图标索引 + SVG 说明',
  '/docs/info/index.html': '站点信息页（本页）',
  '/docs/info/info.css': '本页样式表',
  '/docs/info/info.js': '本页脚本：说明文字（DESC）+ 图标名单（ICONS）+ 渲染逻辑',
  '/docs/info/site-index.js': '目录树数据（由 build/gen-site-index.mjs 生成，别手改）',
  '/docs/sitemap.html': '整页快照旧版：内容与 /docs/info/ 重复，已改成跳转',

  '/old/': '历史归档（不维护）',
  '/old/index.html': '目录页旧版备份',
  '/old/func-v4.html': '函数显示器 旧版 V4',
  '/old/func-v5.html': '函数显示器 旧版 V5',
  '/old/skills.json': '旧版清单：仅 func-v4 / func-v5 两条',

  '/web/': '备选首页（与根首页同构，样式不同）',
  '/web/index.html': '百宝箱：同样读 /site.json 与各清单，按 collection 分组',
  '/web/bak.html': '百宝箱旧版备份',
};

const ICO = {
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  dir:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/></svg>'
};

const treeRoot = $('#treeRoot');
const flatIndex = [];               // {node, path, el}

function renderTree(){
  treeRoot.innerHTML = '';
  const rootUl = document.createElement('ul');
  TREE.children.forEach(child =>
    rootUl.appendChild(buildNode(child, '/')));
  treeRoot.appendChild(rootUl);
}

function buildNode(node, parentPath){
  const li = document.createElement('li');
  li.className = 'node' + (node.dir ? ' is-dir' : '');
  if (node.open) li.classList.add('is-open');

  const path = parentPath + node.name;
  const desc = DESC[path] || node.desc || '';      /* 说明文字人工维护，结构来自生成数据 */
  const row = document.createElement('div');
  row.className = 'row';
  if (node.dir) row.setAttribute('role', 'treeitem');

  row.innerHTML =
    (node.dir ? `<span class="tw">${ICO.chev}</span>` : '<span class="tw"></span>') +
    `<span class="fi">${node.dir ? ICO.dir : ICO.file}</span>` +
    `<span class="nm">${esc(node.name)}</span>` +
    `<span class="dq">${esc(desc)}</span>` +
    (node.ghost ? '' : `<button class="cp" type="button" data-path="${esc(path)}">复制</button>`);

  li.appendChild(row);

  const toggle = () => row.addEventListener('click', e => {
    if (e.target.closest('.cp')) return;
    li.classList.toggle('is-open');
  });

  if (node.dir && node.children && node.children.length){
    const ul = document.createElement('ul');
    node.children.forEach(c => ul.appendChild(buildNode(c, path)));
    li.appendChild(ul);
    toggle();
  } else if (node.dir && node.count){
    /* 文件太多的目录（比如 /asset/icon）：不铺开，只报个数 */
    const ul = document.createElement('ul');
    const ghost = document.createElement('li');
    ghost.className = 'node';
    ghost.innerHTML = '<div class="row"><span class="tw"></span><span class="fi"></span>' +
      `<span class="nm">……</span><span class="dq">共 ${node.count} 个文件（太多了，不逐个铺开）</span></div>`;
    ul.appendChild(ghost);
    li.appendChild(ul);
    toggle();
  }

  flatIndex.push({ node, path, li });
  return li;
}

/* 复制按钮 */
treeRoot.addEventListener('click', e => {
  const b = e.target.closest('.cp');
  if (!b) return;
  e.stopPropagation();
  const p = b.getAttribute('data-path');
  copyText(p, '已复制 ' + p);
});

/* 筛选 + 展开收起 */
function nodeMatches(node, q){
  if (!q) return true;
  if ((node.name + ' ' + (node.desc || '')).toLowerCase().includes(q)) return true;
  return !!(node.children && node.children.some(c => nodeMatches(c, q)));
}

function applyTree(q){
  const qq = q.trim().toLowerCase();
  flatIndex.forEach(({ node, path, li }) => {
    const self = (node.name + ' ' + (DESC[path] || node.desc || '')).toLowerCase().includes(qq);
    const hit = nodeMatches(node, qq) || self;
    li.classList.toggle('is-hidden', !hit);
    if (qq && hit){
      if (node.dir) li.classList.add('is-open');
    }
  });
}

$('#treeq').addEventListener('input', e => {
  const v = e.target.value;
  clearTimeout($('#treeq')._t);
  $('#treeq')._t = setTimeout(() => applyTree(v), 90);
});

$('#treeExpand').addEventListener('click', () => {
  flatIndex.forEach(({ node, li }) => { if (node.dir) li.classList.add('is-open'); });
});
$('#treeCollapse').addEventListener('click', () => {
  flatIndex.forEach(({ node, li }) => { if (node.dir && !node.open) li.classList.remove('is-open'); });
});

renderTree();

/* ═══════════════════════════════════════════════════════
   02 · 图标索引
   ═══════════════════════════════════════════════════════ */

/* 扁平清单：/asset/icon 下全部 SVG（按文件名排序）。
   这一份是人工维护的：它是第三方图标集的静态名单，几乎不变，
   所以没跟着目录树一起生成；build/verify-manifests.mjs 会在数量对不上时提醒。 */
const ICONS = [
/* A */ '1_1','Batch_folding','CI-circle-fill','CI','CodeSandbox-circle-f','CodeSandbox-square-f','CodeSandbox','Console-SQL','Dollar-circle-fill','Dollar','EURO-circle-fill','EURO','Field-Binary','Field-String','Field-number','Field-time','Function','GIF','Gitlab-fill','Gitlab','HTML5-fill','HTML5','IE-circle-fill','IE-square-fill','IE','Import','Partition','Pound-circle-fill','Pound','QQ-circle-fill','QQ-square-fill','QQ','Report','Stored_procedure','USB-fill','USB','View','YUAN-circle-fill','YUAN','Youtube-fill','Youtube','account_book-fill','account_book','add_user','addteam','aim','alert-fill','alert','alibaba','align-center','align-left','align-right','alipay-circle-fill','alipay-square-fill','alipay','aliwangwang-fill','aliwangwang','amazon-circle-fill','amazon-square-fill','amazon','android-fill','android','ant-cloud','ant_design','apartment','api-fill','api','app_store-fill','app_store','apple-fill','apple','appstore_add','area_chart','arrawsalt','arrowdown','arrowleft','arrowright','arrowup','attachment','audio-fill','audio','audio_static','audit','backward','bank-fill','bank','bar_chart','barcode','batch_folding-fill','behance-circle-fill','behance-square-fill','behance','bell-fill','bell','bg-colors','block','bold','book-fill','book','border-bottom',
/* B */ 'border-horizontal','border-inner','border-left','border-outer','border-right','border-top','border-verticle','border','box_plot-fill','box_plot','branches','bug-fill','bug','build-fill','build','bulb-fill','bulb','calculator-fill','calculator','calendar-check-fill','calendar-check','calendar-fill','calendar','camera-fill','camera','car-fill','car','caret-down','caret-left','caret-right','caret-up','carry_out-fill','carry_out','check-circle-fill','check-circle','check-square-fill','check-square','check','chrome-fill','chrome','clear','close-circle-fill','close-circle','close-square-fill','close-square','close','cloud-download','cloud-fill','cloud-server','cloud-sync','cloud-upload','cloud','cluster','code','code_library-fill','code_library','codepen-circle-fill','codepen-square-fill','codepen','collapse','colum-height','column-width','comment','compass-fill','compass','compress','contacts-fill','contacts','container-fill','container','control-fill','control','copyright-circle-fil','copyright','credit_card-fill','credit_card','crown-fill','crown','customerservice-fill','customerservice','dash','dashboard-fill','dashboard','database-fill','database','delete-fill','delete','delete_column','delete_row','delete_team','delete_user','deployment_unit','desktop','detail-fill','detail','diff-fill','diff','dingtalk-circle-fill','dingtalk-square-fill','dingtalk',
/* C */ 'disconnect','double_right','doubleleft','down-circle-fill','down-circle','down-square-fill','down-square','down','download','drag','dribbble-circle-fill','dribbble-square-fill','dribbble','dropbox-circle-fill','dropbox-square-fill','dropbox','earth','edit-fill','edit-square','edit','ellipsis','enter','error-fill','error','exclaimination','expand','expend','experiment-fill','experiment','export','eye-close','eye-fill','eye','eye_close-fill','facebook-fill','facebook','fall','fast-backward','fast-forward','file-GIF','file-add-fill','file-add','file-copy-fill','file-copy','file-excel-fill','file-excel','file-exclamation-fil','file-exclamation','file-fill','file-image-fill','file-image','file-markdown-fill','file-markdown','file-pdf-fill','file-pdf','file-ppt-fill','file-ppt','file-text-fill','file-text','file-unknown-fill','file-unknown','file-word-fill','file-word','file-zip-fill','file-zip','file','file_-exception','file_done','file_protect','file_search','file_sync','filter-fill','filter','fire-fill','fire','flag-fill','flag','folder-add-fill','folder-add','folder-fill','folder-open-fill','folder-open','folder-view','folder','font-colors','font-size','fork','format_painter-fill','format_painter','forward','frown-fill','frown','fullscreen-exit','fullscreen','fund-fill','fund','funnel_plot-fill','funnel_plot','gateway','gift-fill',
/* D */ 'gift','github-fill','gold','golden-fill','google-circle-fill','google-square-fill','google','google_plus-circle-f','google_plus-square-f','google_plus','group','heart-fill','heart','heat_map','highlight-fill','highlight','home-fill','home','hourglass-fill','hourglass','id_card-fill','id_card','image-fill','image','indent','index','info-circle-fill','info-circle','infomation','insert_row_above','insert_row_below','insert_row_left','insert_row_right','instagram-fill','instagram','insurance-fill','insurance_','interation-fill','interation','issues_close','italic','key','laptop','layout-fill','layout','left-circle-fill','left-circle','left-square-fill','left-square','left','like-fill','like','line-height','line','line_chart','link','linkedin-fill','linkedin','location-fill','location','lock-fill','lock','login','logout','mail-fill','mail','man','medicine_box-fill','medicinebox','medium-circle-fill','medium-square-fill','medium','meh-fill','meh','menu','merge-cells','message-fill','message','minus-circle-fill','minus-circle','minus-square-fill','minus-square','minus','mobile-fill','mobile','money_collect-fill','money_collect','monitor','mr','notification-fill','notification','number','ordered_list','outdent','pause','percentage','phone-fill','phone','pic-center','pic-left',
/* E */ 'pic-right','pie_chart-circle-fil','pie_chart','play-circle-fill','play-circle','play-square-fill','play-square','plus-circle-fill','plus-circle','plus-square-fill','plus-square','plus','point_map','poweroff-circle-fill','poweroff','printer-fill','printer','project-fill','project','property_safety-fill','property_safety','pushpin-fill','pushpin','qrcode','question-circle-fill','question-circle','question','radar_chart','radius-bottomleft','radius-bottomright','radius-setting','radius-upleft','radius-upright','read-fill','read','reconciliation-fill','reconciliation','red_envelope-fill','red_envelope','reddit-circle-fill','reddit-square-fill','reddit','redo','reload','reload_time','rest-fill','rest','retweet','right-circle-fill','right-circle','right-square-fill','right-square','right','rise','robot-fill','robot','rocket-fill','rocket','rollback','rotate-left','rotate-right','safety_certificate-f','safety_certificate','save-fill','save','scan','scissor','search','security_scan-fill','security_scan','select','send','setting-fill','setting','sever-fill','sever','shake','share','shop-fill','shop','shopping-fill','shopping','shortcut-fill','shortcut','shrink','signal-fill','sisternode','sketch-circle-fill','sketch-square-fill','sketch','skin-fill','skin','skype-fill','skype','slack-circle-fill','slack-square-fill','slack','sliders-fill','sliders','small-dash',
/* F */ 'smile-fill','smile','snippets-fill','snippets','solit-cells','solution','sort-ascending','sort-descending','sound-fill','sound','star-fill','star','step-backward','step-forward','stock','stop-fill','stop','strikethrough','subnode','swap-left','swap-right','swap','switch_user','sync','table','tablet-fill','tablet','tag-fill','tag','tags-fill','tags','taobao-circle-fill','taobao-square-fill','taobao','team','thunderbolt-fill','thunderbolt','time-circle-fill','time-circle','time_out','totop','trademark-circle-fil','trademark','transaction','translate','trophy-fill','trophy','twitter-circle-fill','twitter-square-fill','twitter','underline','undo','ungroup','unlike-fill','unlike','unlock-fill','unlock','unordered_list','up-circle-fill','up-circle','up-square-fill','up-square','up','upload','user','verified','vertical-align-botto','vertical-align-middl','vertical-align-top','vertical_left','vertical_right','video-fill','video','videocamera_add','wallet-fill','wallet','warning-circle-fill','warning-circle','wechat-fill','weibo-circle-fill','weibo-square-fill','weibo','whatsapp','wifi','windows-fill','windows','woman','wrench-fill','wrench','yahoo-fill','yahoo','yuque-fill','yuque','zhihu-circle-fill','zhihu-square-fill','zhihu','zoom_in','zoom_out'
];

const CATMETA = [
  ['nav',    '导航与方向'],
  ['file',   '文件与文档'],
  ['editor', '编辑与排版'],
  ['media',  '媒体与图像'],
  ['data',   '数据与统计'],
  ['system', '系统与状态'],
  ['users',  '用户与团队'],
  ['brand',  '品牌与平台'],
  ['misc',   '通用与其他']
];

/* 品牌 / 平台：精确名单 */
const BRAND = new Set(['alibaba','alipay-circle-fill','alipay-square-fill','alipay','aliwangwang-fill','aliwangwang','amazon-circle-fill','amazon-square-fill','amazon','android-fill','android','ant-cloud','ant_design','app_store-fill','app_store','apple-fill','apple','appstore_add','behance-circle-fill','behance-square-fill','behance','chrome-fill','chrome','codepen-circle-fill','codepen-square-fill','codepen','dingtalk-circle-fill','dingtalk-square-fill','dingtalk','dribbble-circle-fill','dribbble-square-fill','dribbble','dropbox-circle-fill','dropbox-square-fill','dropbox','facebook-fill','facebook','github-fill','gitlab-fill','gitlab','google-circle-fill','google-square-fill','google','google_plus-circle-f','google_plus-square-f','google_plus','html5-fill','html5','ie-circle-fill','ie-square-fill','ie','instagram-fill','instagram','linkedin-fill','linkedin','medium-circle-fill','medium-square-fill','medium','qq-circle-fill','qq-square-fill','qq','reddit-circle-fill','reddit-square-fill','reddit','sketch-circle-fill','sketch-square-fill','sketch','skype-fill','skype','slack-circle-fill','slack-square-fill','slack','taobao-circle-fill','taobao-square-fill','taobao','twitter-circle-fill','twitter-square-fill','twitter','wechat-fill','weibo-circle-fill','weibo-square-fill','weibo','whatsapp','windows-fill','windows','yahoo-fill','yahoo','youtube-fill','youtube','yuque-fill','yuque','zhihu-circle-fill','zhihu-square-fill','zhihu','codesandbox-circle-f','codesandbox-square-f','codesandbox','ci-circle-fill','ci','usb-fill','usb']);

const RE = {
  users:  /(^user$|_user$|^add_user$|team|customerservice|contacts|^smile|^frown|^meh|^man$|^woman$|^mr$|^group$|^ungroup$|switch_user)/,
  file:   /^(file|folder|book|read|account_book|index$|attachment|snippets|code_library|detail$|detail-fill$|reconciliation|diff|audit$|report$|solution$|partition$|import$|view$|batch_folding|stored_procedure$)/,
  media:  /^(play|pause|stop|step-|fast-|sound|audio|video|videocamera|camera|image|eye|like|unlike|heart|star|message|comment|notification|bell|share|send|mail|phone|pushpin|tag|tags|filter|scissor$|highlight)/,
  editor: /^(bold$|italic$|underline$|strikethrough$|font-colors$|font-size$|line-height$|align-|unordered_list$|ordered_list$|indent$|outdent$|format_painter|edit|delete|clear$|select$|border|radius|merge-cells$|colum-height$|column-width$|insert_row|table$|pic-|drag$|block$|key$|translate$|bg-colors$)/,
  data:   /(chart|_plot|^fund|^stock$|^percentage$|^number$|^heat_map$|field-|^function$|^gateway$|^cluster$|^database|^deployment_unit$|^sisternode$|^subnode$|^branches$|^fork$|^container|^transaction$|^property_safety|^safety_certificate|^security_scan|^insurance|^money_collect|^wallet|^credit_card|^red_envelope|^gold|^golden|^gift|^console-sql$|^partition$|^stored_procedure$|^field)/,
  system: /^(setting|control|sliders|build|wrench|experiment|check|close|plus|minus|info|infomation$|question|exclaimination$|warning|error|alert|disconnect$|poweroff|scan$|qrcode$|barcode$|printer|save|wifi$|signal|thunderbolt|hourglass|calendar|time|reload_time$|bug|issues_close$|verified$|copyright|trademark|id_card|lock|unlock|sever|shake$|solution$|api)/,
  nav:    /^(arrow|caret|arrawsalt|up|down|left|right|double|swap|expand$|expend$|shrink$|compress$|enter$|login$|logout$|forward$|backward$|fall$|rise$|sort-|rollback$|undo$|redo$|retweet$|reload$|sync$|rotate-|fullscreen|menu$|totop$|upload$|download$|export$|collapse$)/
};

function catOf(n){
  const low = n.toLowerCase();
  if (BRAND.has(low))                      return 'brand';
  if (RE.users.test(low))                  return 'users';
  if (RE.file.test(low))                   return 'file';
  if (RE.media.test(low))                  return 'media';
  if (RE.editor.test(low))                 return 'editor';
  if (RE.data.test(low))                   return 'data';
  if (RE.system.test(low))                 return 'system';
  if (RE.nav.test(low))                    return 'nav';
  return 'misc';
}

const CATLBL = Object.fromEntries(CATMETA);
const counts = {};
ICONS.forEach(n => { const c = catOf(n); counts[c] = (counts[c] || 0) + 1; });

const gridEl  = $('#iconGrid');
const noneEl  = $('#iconNone');
const catEl   = $('#iconCats');
let activeCat = 'all';
let iconQuery = '';

/* 分类 chips */
catEl.innerHTML =
  `<button class="chip on" data-cat="all" type="button">全部<span class="c">${ICONS.length}</span></button>` +
  CATMETA.filter(([id]) => counts[id])
    .map(([id, label]) =>
      `<button class="chip" data-cat="${id}" type="button">${label}<span class="c">${counts[id]}</span></button>`)
    .join('');

catEl.addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  activeCat = b.dataset.cat;
  catEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
  renderIcons();
});

function renderIcons(){
  const q = iconQuery.trim().toLowerCase();
  const list = ICONS.filter(n =>
    (activeCat === 'all' || catOf(n) === activeCat) &&
    (!q || n.toLowerCase().includes(q))
  );

  $('#iconCount').textContent = ICONS.length;
  noneEl.hidden = list.length !== 0;

  gridEl.innerHTML = list.map(n => `
    <div class="ic" role="listitem" tabindex="0" data-name="${esc(n)}" title="${esc(n)}.svg">
      <span class="glyph"><img loading="lazy" alt="" src="/asset/icon/${encodeURIComponent(n)}.svg"></span>
      <span class="cap">${esc(n)}</span>
    </div>`).join('');
}

/* 点击复制引用 */
async function grab(el){
  const n = el.getAttribute('data-name');
  await copyText(`/asset/icon/${n}.svg`, '已复制 /asset/icon/' + n + '.svg');
}
gridEl.addEventListener('click', e => {
  const el = e.target.closest('.ic');
  if (el) grab(el);
});
gridEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('.ic');
  if (el){ e.preventDefault(); grab(el); }
});

$('#iconq').addEventListener('input', e => {
  iconQuery = e.target.value;
  clearTimeout($('#iconq')._t);
  $('#iconq')._t = setTimeout(renderIcons, 90);
});

renderIcons();
