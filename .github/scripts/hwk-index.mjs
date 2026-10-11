/**
 * 作业清单生成（`class/data/hwk/index.json` + `class/data/index-produce.json`）
 * ---------------------------------------------------
 * 背景：作业数据是「一天一个文件」（`class/data/hwk/hwk-<id>.json`）。
 * 「有哪几天」必须落成一份**文件**，因为只有 GitHub Contents API 能列目录，
 * jsDelivr 和热铁盒/GitHub Pages 这些静态托管都列不了目录：
 *
 *   class/data/hwk/index.json          目录（裸数组，新的在前）—— 页面拿第一条当「今天这份」
 *   class/data/index-produce.json      生产清单：目录 **+ 最近 N 天的正文**
 *
 * 这份实现有**三个调用方**，所以它刻意不 import 任何项目内的东西
 * （只用 node:fs / node:path，站点根由参数传进来）：
 *
 *   1. `build/gen-hwk-index.mjs`   本地命令行（会顺手刷新 docs/info/site-index.js）
 *   2. 控制台「作业」面板的「重建清单」按钮（`console/lib/hwk.mjs` 动态 import）
 *   3. **GitHub Actions**：仓库里那份拷贝在 `dist/.github/scripts/hwk-index.mjs`，
 *      由 `build/push-github.mjs` 从 `build/lib/hwk-index.mjs` 复制过去 ——
 *      所以这个文件必须能在「只有构建产物、没有 build/ 目录」的仓库里独立跑：
 *        node .github/scripts/hwk-index.mjs [--root .] [--preview 5] [--check]
 *
 * 两条硬规矩：
 *   · **不写时间戳**。同样的输入必须产出一模一样的字节（和 gen-site-index 一个道理），
 *     否则本地生成一次、CI 再生成一次就永远「有改动」，会来回互相覆盖。
 *   · **正文一个字都不动**：produce 里的记录是把 `hwk-<id>.json` 原样搬过来，
 *     不重新排版、不改键序（页面按 `\n` 自己拆行）。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 数据目录（站点相对路径） */
export const HWK_REL = 'class/data/hwk';
/** 生产清单（站点相对路径） */
export const PRODUCE_REL = 'class/data/index-produce.json';
/** 清单里预装几天的正文（页面「加载更多」每次也就再要这么多） */
export const PREVIEW_COUNT = 5;

const INDENT = '\t';
export const dumpJson = (data) => JSON.stringify(data, null, INDENT) + '\n';

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

/** 手写的 JSON 常有多余逗号（和页面 `parseLooseJson` 一个口径） */
export function parseLoose(text) {
  return JSON.parse(String(text).replace(/,\s*([}\]])/g, '$1'));
}

/** `2026-10-10` / `2026/10/10` → `2026-10-10`；不认识就返回 '' */
export function normalizeDate(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (!m) return '';
  const [, y, mo, d] = m;
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const dt = new Date(`${y}-${mm}-${dd}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return '';
  if (dt.getFullYear() !== Number(y) || dt.getMonth() + 1 !== Number(mm) || dt.getDate() !== Number(dd)) return '';
  return `${y}-${mm}-${dd}`;
}

/** id → 日期：n261011 → 2026-10-11（认不出返回 ''） */
export function dateFromId(id) {
  const m = /^n(\d{2})(\d{2})(\d{2})$/.exec(String(id || ''));
  return m ? normalizeDate(`20${m[1]}-${m[2]}-${m[3]}`) : '';
}

/** 目录里那些 `hwk-*.json`（只看文件名，不看内容） */
export function hwkFilesOf(hwkDir) {
  if (!isDir(hwkDir)) return [];
  return fs.readdirSync(hwkDir)
    .filter((n) => /^hwk-.+\.json$/.test(n))
    .sort();
}

/**
 * 扫一遍数据目录 → 目录条目（新的在前）
 * ---------------------------------------------------
 * 读不动的文件（坏 JSON / 不是对象）**跳过并在 problems 里说一声**：
 * 一份坏文件不该让整份清单生不出来。
 */
export function scanHwk(hwkDir) {
  const entries = [];
  const problems = [];
  for (const name of hwkFilesOf(hwkDir)) {
    const file = path.join(hwkDir, name);
    let rec = null;
    try {
      rec = parseLoose(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      problems.push(`${name} 读不了：${e.message}`);
      continue;
    }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      problems.push(`${name} 顶层不是对象`);
      continue;
    }
    const id = String(rec.id || name.replace(/^hwk-/, '').replace(/\.json$/, '')).trim();
    entries.push({
      id,
      name,
      date: normalizeDate(rec.date) || dateFromId(id),
      title: String(rec.title || ''),
    });
  }
  /* 新的在前：日期倒序，同一天按 id 倒序（确定性的，跟插入顺序无关） */
  entries.sort((a, b) =>
    String(b.date || b.id).localeCompare(String(a.date || a.id)) ||
    String(b.id).localeCompare(String(a.id)));
  return { entries, problems };
}

/** index.json 该长什么样（裸数组 + 制表符缩进，和手工写的那份一致） */
export function indexJsonOf(entries) {
  return dumpJson(entries);
}

/**
 * 生产清单该长什么样：目录 + 最近 `preview` 天的**完整记录**
 * ---------------------------------------------------
 * 页面在 GitHub API 不通时先读它：一次请求就把列表和最近几天的正文都拿到，
 * 往后的日子再按目录逐份要（每次 5 个）。键是文件名，页面按 `name` 查。
 */
export function produceOf(hwkDir, { preview = PREVIEW_COUNT, entries = null } = {}) {
  const scanned = entries ? { entries, problems: [] } : scanHwk(hwkDir);
  const list = scanned.entries;
  const picked = {};
  const missing = [];
  list.slice(0, Math.max(0, preview)).forEach((e) => {
    try {
      picked[e.name] = parseLoose(fs.readFileSync(path.join(hwkDir, e.name), 'utf8'));
    } catch (err) {
      missing.push(e.name);
    }
  });
  const data = {
    note: '构建生成：作业目录 + 最近 ' + Math.max(0, preview) + ' 天的正文。'
      + '页面在 GitHub API 读不通时先读它（CDN / 同源），更早的日子再按目录逐份取。',
    source: HWK_REL,
    count: list.length,
    previewCount: Object.keys(picked).length,
    entries: list,
    preview: picked,
  };
  return { data, problems: scanned.problems.concat(missing.map((n) => n + ' 读不了，没进清单的 preview')), list };
}

/**
 * 生成两个文件
 * ---------------------------------------------------
 * @param {string} siteRoot 站点根（本地是 `jinsuper.rth1.xyz/`；CI 里是仓库根）
 * @param {object} opts { preview, check }
 * @returns {{ writes: Array<{rel,file,text,changed}>, changed: string[], problems: string[], entries: Array }}
 */
export function buildAll(siteRoot, { preview = PREVIEW_COUNT, check = false } = {}) {
  const hwkDir = path.join(siteRoot, ...HWK_REL.split('/'));
  const indexFile = path.join(hwkDir, 'index.json');
  const produceFile = path.join(siteRoot, ...PRODUCE_REL.split('/'));

  const scanned = scanHwk(hwkDir);
  const indexText = indexJsonOf(scanned.entries);
  const { data: produceData, problems } = produceOf(hwkDir, { preview, entries: scanned.entries });
  const produceText = dumpJson(produceData);

  const writes = [
    { rel: HWK_REL + '/index.json', file: indexFile, text: indexText },
    { rel: PRODUCE_REL, file: produceFile, text: produceText },
  ].map((w) => {
    const before = isFile(w.file) ? fs.readFileSync(w.file, 'utf8') : null;
    return { ...w, changed: before !== w.text, existed: before !== null };
  });

  const changed = writes.filter((w) => w.changed).map((w) => w.rel);
  if (!check) {
    for (const w of writes) {
      if (!w.changed) continue;                       /* 内容一样就不动它，mtime 保持稳定 */
      fs.mkdirSync(path.dirname(w.file), { recursive: true });
      fs.writeFileSync(w.file, w.text, 'utf8');
    }
  }
  return { writes, changed, problems: problems.concat(scanned.problems), entries: scanned.entries };
}

/* ═══════════════════════════════════════════════════
   命令行（本地 `build/gen-hwk-index.mjs` 与 CI 共用）
   ═══════════════════════════════════════════════════ */

/**
 * @param {string[]} argv
 * @param {string} defaultRoot 不给 --root 时用哪个根（CI 里是当前目录）
 * @returns {number} 退出码
 */
export function main(argv = [], defaultRoot = process.cwd()) {
  const at = argv.indexOf('--root');
  const root = path.resolve(at >= 0 && argv[at + 1] ? argv[at + 1] : defaultRoot);
  const pat = argv.indexOf('--preview');
  const preview = pat >= 0 && argv[pat + 1] ? Number(argv[pat + 1]) : PREVIEW_COUNT;
  const check = argv.includes('--check');
  const quiet = argv.includes('--quiet');

  const res = buildAll(root, { preview, check });
  if (!quiet) {
    console.log('');
    console.log('  作业清单 → ' + root);
    console.log('  目录 ' + res.entries.length + ' 天 · preview ' + Math.min(preview, res.entries.length) + ' 天');
    for (const w of res.writes) {
      console.log('   ' + (w.changed ? (check ? '会更新 ' : '已写入 ') : '没变化 ') + w.rel);
    }
    for (const p of res.problems) console.log('  ⚠ ' + p);
    console.log('');
  }
  if (check && res.changed.length) return 1;
  return 0;
}
