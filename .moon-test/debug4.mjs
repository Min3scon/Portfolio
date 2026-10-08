import { spawn } from "node:child_process";
const PORT = 9339;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${PORT}`, "--user-data-dir=C:/Users/jackd/Documents/Portfolio/.moon-test/profile3", "--no-first-run", "about:blank"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 50 && !page; i++) { await sleep(200); try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id) pending.get(msg.id)?.(msg); };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, (msg) => res(msg.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
console.log("reduced motion in headless:", await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"));
console.log(await evaluate(`(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const out = {};
  const variants = {
    plain: (el) => el.removeAttribute("style"),
    clearFirst: (el) => { el.style.cssText = ""; el.removeAttribute("style"); },
    syncFirst: (el) => { el.getAttribute("style"); el.removeAttribute("style"); },
  };
  for (const [name, fn] of Object.entries(variants)) {
    const el = document.body.appendChild(document.createElement("div"));
    el.style.position = "relative";
    for (let i = 0; i < 5; i++) { el.style.transform = "translate(" + i + "px, 0px)"; await frame(); }
    fn(el);
    await frame(); await frame();
    out[name] = el.getAttribute("style");
  }
  return JSON.stringify(out);
})()`));
ws.close(); chrome.kill(); process.exit(0);
