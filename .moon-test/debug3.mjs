import { spawn } from "node:child_process";

const OUT = "C:/Users/jackd/Documents/Portfolio/.moon-test";
const PORT = 9338;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile2`, "--no-first-run", "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 50 && !page; i++) {
  await sleep(200);
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id) return pending.get(msg.id)?.(msg);
  if (msg.method === "Runtime.consoleAPICalled") console.log("console:", msg.params.args.map((a) => a.value ?? a.description).join(" "));
  if (msg.method === "Runtime.exceptionThrown") console.log("EXCEPTION:", JSON.stringify(msg.params.exceptionDetails).slice(0, 600));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, (msg) => res(msg.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
const type = async (word) => {
  for (const ch of word) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, code: `Key${ch.toUpperCase()}`, text: ch });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch, code: `Key${ch.toUpperCase()}` });
  }
};
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*abacus.jasoncameron.dev*"] });
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  const orig = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (name) { if (name === 'style' && this.tagName === 'H1') console.log('removeAttribute H1 at', performance.now().toFixed(0)); return orig.call(this, name); };
` });
await send("Page.navigate", { url: "file:///C:/Users/jackd/Documents/Portfolio/.moon-test/wt/index.html" });
await sleep(1500); await evaluate("new MutationObserver(ms => ms.forEach(m => m.target.tagName === 'H1' && console.log('H1 style mutation', performance.now().toFixed(0), JSON.stringify(m.oldValue), '->', JSON.stringify(m.target.getAttribute('style'))))).observe(document.querySelector('h1'), { attributes: true, attributeFilter: ['style'], attributeOldValue: true }), 1");
console.log("has fix:", await evaluate("fetch('moon.js').then(r => r.text()).then(t => t.includes('removeAttribute')).catch(e => 'fetch failed ' + e)"));
await type("moon");
await sleep(1500); await evaluate("new MutationObserver(ms => ms.forEach(m => m.target.tagName === 'H1' && console.log('H1 style mutation', performance.now().toFixed(0), JSON.stringify(m.oldValue), '->', JSON.stringify(m.target.getAttribute('style'))))).observe(document.querySelector('h1'), { attributes: true, attributeFilter: ['style'], attributeOldValue: true }), 1");
await type("moon");
await sleep(2000);
console.log("styled after:", await evaluate("[...document.querySelectorAll('[style]')].map(e => e.tagName + '=' + JSON.stringify(e.getAttribute('style'))).join(' ')"));
ws.close();
chrome.kill();
process.exit(0);
