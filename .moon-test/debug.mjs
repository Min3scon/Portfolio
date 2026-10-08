import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = "C:/Users/jackd/Documents/Portfolio/.moon-test";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9337;
const W = Number(process.argv[2] || 1400);
const H = Number(process.argv[3] || 900);
const TAG = process.argv[4] || "desk";

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`,
  `--window-size=${W},${H}`, "--no-first-run", "--no-default-browser-check", "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
for (let i = 0; i < 50 && !page; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((t) => t.type === "page");
  } catch {}
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id) return pending.get(msg.id)?.(msg);
  if (msg.method === "Runtime.consoleAPICalled") console.log("console:", msg.params.type, msg.params.args.map((a) => a.value ?? a.description).join(" "));
  if (msg.method === "Runtime.exceptionThrown") console.log("EXCEPTION:", JSON.stringify(msg.params.exceptionDetails).slice(0, 600));
  if (msg.method === "Network.loadingFailed") console.log("net fail:", msg.params.errorText, msg.params.blockedReason || "");
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id;
  pending.set(i, (msg) => { if (msg.error) console.log("CDP error", method, msg.error); res(msg.result); });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
const shot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${TAG}-${name}.png`, Buffer.from(data, "base64"));
};
const type = async (word) => {
  for (const ch of word) {
    const code = `Key${ch.toUpperCase()}`;
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, code, text: ch, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch, code, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) });
  }
};
const mouse = (type, x, y, buttons = 1) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
const rects = () => evaluate(`JSON.stringify([...document.querySelectorAll('.path, .nav a, .hero h1, .hero p, .github-link, .section-head h2, .view-all, .card, .site-footer')].map(el => { const r = el.getBoundingClientRect(); return [(el.className || el.tagName).split(' ')[0], Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }))`);
const cardRect = () => evaluate(`(() => { const r = document.querySelectorAll('.card')[0].getBoundingClientRect(); return [Math.round(r.left + r.width/2), Math.round(r.top + r.height/2), Math.round(r.top), Math.round(r.bottom)]; })()`);

await send("Runtime.enable");
await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*abacus.jasoncameron.dev*"] });
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "file:///C:/Users/jackd/Documents/Portfolio/.moon-test/wt/index.html" });
await sleep(1500);

if (process.argv[5] === "scroll") {
  await evaluate("window.scrollTo({ top: 99999, behavior: 'instant' })");
  await sleep(300);
  console.log("scrolled to", await evaluate("scrollY"));
}
const before = await rects(); console.log("styled at start:", await evaluate("[...document.querySelectorAll(\"[style]\")].map(e => e.tagName).join()"));
console.log("viewport", await evaluate("JSON.stringify([innerWidth, innerHeight, document.documentElement.clientWidth, document.documentElement.clientHeight, document.documentElement.scrollHeight])"));
await shot("0-before");

await type("moon");
await sleep(500);
console.log("matter loaded:", await evaluate("typeof window.Matter"), "bodies:", await evaluate("document.querySelectorAll('.moon-body').length"));
await shot("1-falling");
const track = [];
for (let i = 0; i < 12; i++) { await sleep(500); track.push((await cardRect())[1]); }
console.log("card centre y every 0.5s while falling:", track.join(", "));
await shot("2-landed");
console.log("landed rects:", await rects());

// Drag the first card up to near the top.
const [cx, cy] = await cardRect();
await mouse("mousePressed", cx, cy);
const targetY = 150;
const lagLog = [];
for (let i = 1; i <= 30; i++) {
  const y = cy + ((targetY - cy) * i) / 30;
  await mouse("mouseMoved", cx, y);
  await sleep(16);
  if (i % 5 === 0) lagLog.push(`${Math.round(y)}->${(await cardRect())[1]}`);
}
await shot("3-dragging");
for (let i = 0; i < 6; i++) { await sleep(300); lagLog.push(`hold->${(await cardRect())[1]}`); }
console.log("pointer y -> card centre y:", lagLog.join(", "));
await shot("4-held");
await mouse("mouseReleased", cx, targetY, 0);
const fall = [];
for (let i = 0; i < 10; i++) { await sleep(300); fall.push((await cardRect())[1]); }
console.log("card centre y every 0.3s after release:", fall.join(", "));
await shot("5-dropped");

// Drag a nav link quickly for comparison.
const nav = await evaluate(`(() => { const r = document.querySelector('.nav a').getBoundingClientRect(); return [Math.round(r.left + r.width/2), Math.round(r.top + r.height/2)]; })()`);
await mouse("mousePressed", nav[0], nav[1]);
const navLog = [];
for (let i = 1; i <= 20; i++) {
  await mouse("mouseMoved", nav[0] - i * 10, nav[1] - i * 20);
  await sleep(16);
  if (i % 5 === 0) navLog.push(`${nav[1] - i * 20}->${await evaluate(`Math.round(document.querySelector('.nav a').getBoundingClientRect().top + document.querySelector('.nav a').getBoundingClientRect().height/2)`)}`);
}
console.log("nav: pointer y -> link y:", navLog.join(", "));
await mouse("mouseReleased", nav[0] - 200, nav[1] - 400, 0);
await sleep(200);
console.log("url after drag-release on link:", await evaluate("location.pathname"));

await type("moon");
await sleep(400);
await shot("6-returning");
await sleep(1600);
await shot("7-restored");
const after = await rects();
console.log("restored matches original:", before === after);
if (before !== after) console.log("before", before, "\nafter ", after);
console.log("leftover:", await evaluate(`JSON.stringify({ html: document.documentElement.className, gutter: document.documentElement.style.scrollbarGutter, bodies: document.querySelectorAll('.moon-body, .moon-held').length, styled: [...document.querySelectorAll('[style]')].map(el => el.tagName + ':' + el.getAttribute('style')) })`));

// Toggle on again and quickly off/on to exercise state handling.
await type("moon");
await sleep(1500);
await type("moon");
await sleep(200);
await type("moon");
await sleep(1500);
console.log("re-entered during landing, bodies:", await evaluate("document.querySelectorAll('.moon-body').length"), "html:", await evaluate("document.documentElement.className"));
await shot("8-again");
await send("Emulation.setDeviceMetricsOverride", { width: Math.round(W * 0.6), height: Math.round(H * 0.8), deviceScaleFactor: 1, mobile: false });
await sleep(2500);
await shot("9-resized");
console.log("after resize rects:", await rects());
console.log("after resize view:", await evaluate("JSON.stringify([innerWidth, document.documentElement.clientWidth, getComputedStyle(document.documentElement).scrollbarGutter, scrollY])"));
console.log("bodies outside view:", await evaluate(`JSON.stringify([...document.querySelectorAll('.moon-body')].filter(el => { const r = el.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 2 || r.left < -2 || r.bottom > innerHeight + 2; }).map(el => el.className))`));

ws.close();
chrome.kill();
process.exit(0);
