/* ============================================================
   tools/build-single.mjs —— 把 index.html 打成"单文件版"
   ------------------------------------------------------------
   为什么要脚本而不是手工复制粘贴：nav 和 CSS 一旦有两份手写副本，改一处忘另一处
   就会静默不一致。所以 index.html + css/ + js/ 永远是唯一源码，
   单文件版是**构建产物**，不手改；要改内容改源码再重新生成。
   门槛都是硬失败（throw），不留"找不到就当没这回事"的兜底：
     1) 引用的 css/js 文件不存在 → 抛错
     2) 内联后正文里还剩 href="css/ 或 src="js/ → 抛错（说明有引用没被处理掉）
     3) 脚本源码里出现 </script>、样式里出现 </style> → 抛错（会提前闭合标签）
   跑法（node 不在 PATH 上，用 Qoder 自带的 Electron 当 node）：
     cd /c/Users/NIUMAG/AppData/Local/Temp/jiyao_tools 时也能跑，这里用相对项目根的路径
     ELECTRON_RUN_AS_NODE=1 "/c/Users/NIUMAG/AppData/Local/Programs/Qoder CN/Qoder CN.exe" \
       "E:/网页/友南开发技术/tools/build-single.mjs"
   ============================================================ */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'index.html');
const OUT = join(ROOT, '友南开发技术-单文件版.html');

const html = readFileSync(SRC, 'utf8');
const inlined = { css: [], js: [] };

function readAsset(rel, kind) {
  const p = join(ROOT, rel);
  let text;
  try {
    text = readFileSync(p, 'utf8');
  } catch (err) {
    throw new Error(`读不到${kind}文件：${rel}（index.html 里引用了它，但它不在）\n  ${err.message}`);
  }
  const closing = kind === 'js' ? '</scr' + 'ipt>' : '</sty' + 'le>';
  if (text.includes(closing)) {
    throw new Error(`${rel} 里含有 ${closing}，内联会把标签提前闭合，先去转义再打包`);
  }
  return text;
}

/* <link rel="stylesheet" href="css/base.css"> → <style>…</style>
   只替换标签本身，标签后面那句 HTML 注释（"不要它就删掉这行…"）原样留着。 */
let out = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (m, rel) => {
  const css = readAsset(rel, 'css');
  inlined.css.push(rel);
  return `<style>\n/* ========== 内联自 ${rel}（构建产物，要改请改 ${rel} 再重新生成）========== */\n${css}</style>`;
});

/* <script src="js/reveal.js"></script> → <script>…</script>，同样保留行尾注释 */
out = out.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, rel) => {
  const js = readAsset(rel, 'js');
  inlined.js.push(rel);
  return `<script>\n/* ---- 内联自 ${rel} ---- */\n${js}\n</script>`;
});

const leftovers = [...out.matchAll(/(?:href|src)="(?:css|js)\/[^"]+"/g)].map(m => m[0]);
if (leftovers.length) throw new Error(`还有引用没被内联，产物会缺样式或脚本：\n  ${leftovers.join('\n  ')}`);

writeFileSync(OUT, out, 'utf8');

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1);
console.log(`源 index.html ${kb(html)} KB → 单文件 ${kb(out)} KB`);
console.log(`内联样式 ${inlined.css.length} 个：${inlined.css.join(', ')}`);
console.log(`内联脚本 ${inlined.js.length} 个：${inlined.js.join(', ')}`);
console.log(`输出 ${OUT}`);
