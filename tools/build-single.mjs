/* ============================================================
   tools/build-single.mjs —— 把 index.html 打成"单文件版"
   ------------------------------------------------------------
   为什么要脚本而不是手工复制粘贴：nav 和 CSS 一旦有两份手写副本，改一处忘另一处
   就会静默不一致。所以 index.html + css/ + js/ + img/ 永远是唯一源码，
   单文件版是**构建产物**，不手改；要改内容改源码再重新生成。
   门槛都是硬失败（throw），不留"找不到就当没这回事"的兜底：
     1) 引用的 css/js/img 文件不存在 → 抛错
     2) 内联后正文里还剩 href/src="css/、js/ 或 img/ → 抛错（说明有引用没被处理掉）
     3) 脚本源码里出现 </script>、样式里出现 </style> → 抛错（会提前闭合标签）
     4) 图片后缀不在 MIME 表里 → 抛错（猜一个 data:image/... 会出灰块，比报错难查）
   跑法（node 不在 PATH 上，用 Qoder 自带的 Electron 当 node）：
     脚本自己用 fileURLToPath 定位项目根，所以在哪个目录执行都一样，只写绝对路径
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
const inlined = { css: [], js: [], img: [] };

/* 图片后缀 → data URI 的 MIME。表里没有就抛错：
   猜一个 image/png 塞进 jpeg 的字节，浏览器只会画个灰块，比现在报错难查十倍。 */
const IMAGE_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif' };

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

function readImage(rel) {
  const ext = rel.split('.').pop().toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) {
    throw new Error(`不支持的图片格式：${rel}（后缀 .${ext} 不在表里，请改成 ${Object.keys(IMAGE_MIME).join('/')} 之一）`);
  }
  const p = join(ROOT, rel);
  let buf;
  try {
    buf = readFileSync(p);
  } catch (err) {
    throw new Error(`读不到图片文件：${rel}（index.html 里引用了它，但它不在）\n  ${err.message}`);
  }
  inlined.img.push(rel);
  return `data:${mime};base64,${buf.toString('base64')}`;
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

/* src="img/xxx.jpg" → data:image/jpeg;base64,…，单文件版把图也带在身边 */
out = out.replace(/src="(img\/[^"]+)"/g, (m, rel) => `src="${readImage(rel)}"`);

const leftovers = [...out.matchAll(/(?:href|src)="(?:css|js|img)\/[^"]+"/g)].map(m => m[0]);
if (leftovers.length) throw new Error(`还有引用没被内联，产物会缺样式、脚本或图片：\n  ${leftovers.join('\n  ')}`);

writeFileSync(OUT, out, 'utf8');

const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1);
console.log(`源 index.html ${kb(html)} KB → 单文件 ${kb(out)} KB`);
console.log(`内联样式 ${inlined.css.length} 个：${inlined.css.join(', ')}`);
console.log(`内联脚本 ${inlined.js.length} 个：${inlined.js.join(', ')}`);
console.log(`内联图片 ${inlined.img.length} 个：${inlined.img.join(', ')}`);
console.log(`输出 ${OUT}`);
