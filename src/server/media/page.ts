import type { ModeState } from "../../shared/types.js";

/**
 * The webpage the bot streams into the meeting through Recall Output Media.
 * It is Zeno's own brand card — deliberately never a human face or avatar.
 *
 * VIDEO on  → animated listening / thinking / responding states.
 * VIDEO off → a still brand card (Output Media always carries video, so the page
 *             stays up whenever voice is on, it just stops moving).
 */
export function renderMediaPage(args: { token: string; modes: ModeState; meetingTitle: string }): string {
  const bootstrap = JSON.stringify({ token: args.token, modes: args.modes, title: args.meetingTitle });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1280, height=720, initial-scale=1" />
<title>Zeno</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #05070f; overflow: hidden; }
  body {
    font-family: ui-sans-serif, -apple-system, "Segoe UI", Inter, system-ui, sans-serif;
    color: #e8ecf8; display: grid; place-items: center;
  }
  .stage {
    position: relative; width: 1280px; height: 720px; display: grid; place-items: center;
    background:
      radial-gradient(900px 520px at 50% 22%, rgba(88, 118, 255, 0.24), transparent 65%),
      radial-gradient(700px 500px at 80% 90%, rgba(29, 210, 180, 0.16), transparent 60%),
      linear-gradient(160deg, #05070f 0%, #080c1a 55%, #05070f 100%);
  }
  .grid {
    position: absolute; inset: 0; opacity: .35;
    background-image: linear-gradient(rgba(120,140,220,.07) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(120,140,220,.07) 1px, transparent 1px);
    background-size: 64px 64px;
    mask-image: radial-gradient(circle at 50% 45%, #000 35%, transparent 78%);
  }
  .card { position: relative; text-align: center; padding: 0 64px; max-width: 1100px; }
  .mark { display: flex; align-items: center; justify-content: center; gap: 22px; }
  .orb { position: relative; width: 108px; height: 108px; display: grid; place-items: center; }
  .orb .core {
    width: 72px; height: 72px; border-radius: 26px;
    background: linear-gradient(145deg, #7aa2ff, #4f6bff 45%, #22d3b4);
    box-shadow: 0 18px 60px rgba(79,107,255,.45), inset 0 2px 12px rgba(255,255,255,.35);
  }
  .orb .ring {
    position: absolute; inset: 0; border-radius: 34px; border: 2px solid rgba(122,162,255,.45);
    opacity: 0;
  }
  .wordmark { font-size: 76px; font-weight: 700; letter-spacing: -2.5px; line-height: 1; }
  .wordmark span { background: linear-gradient(120deg, #ffffff, #b9c8ff 55%, #7ee8d2);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .tagline { margin-top: 14px; font-size: 22px; color: #96a3c8; letter-spacing: 3.5px; text-transform: uppercase; }
  .status {
    margin-top: 40px; display: inline-flex; align-items: center; gap: 14px;
    padding: 14px 28px; border-radius: 999px; font-size: 22px; font-weight: 500;
    background: rgba(148,163,214,.10); border: 1px solid rgba(148,163,214,.22); color: #cdd6f4;
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: #64748b; }
  .caption {
    margin-top: 34px; min-height: 92px; font-size: 27px; line-height: 1.45; color: #dbe4ff;
    max-width: 980px; margin-left: auto; margin-right: auto; opacity: 0; transition: opacity .35s ease;
  }
  .caption.show { opacity: 1; }
  .bars { margin-top: 30px; height: 56px; display: flex; align-items: flex-end; justify-content: center; gap: 7px; opacity: 0; transition: opacity .3s ease; }
  .bars span { width: 8px; height: 12px; border-radius: 4px; background: linear-gradient(180deg, #7aa2ff, #22d3b4); }
  .modes { position: absolute; bottom: 38px; left: 0; right: 0; display: flex; justify-content: center; gap: 12px; }
  .chip {
    font-size: 16px; letter-spacing: 1.6px; text-transform: uppercase; padding: 9px 18px; border-radius: 999px;
    border: 1px solid rgba(148,163,214,.2); color: #7c88ad; background: rgba(148,163,214,.06);
  }
  .chip.on { color: #0a0f1f; background: linear-gradient(120deg,#8fb0ff,#4ee0c0); border-color: transparent; font-weight: 600; }
  .footnote { position: absolute; top: 34px; right: 42px; font-size: 16px; color: #5d6a94; }

  /* Animated states only run while VIDEO mode is on. */
  body.animate .orb .ring { animation: ring 3.2s ease-out infinite; }
  body.animate .orb .ring:nth-child(2) { animation-delay: 1.6s; }
  body.animate.listening .dot { background: #4ee0c0; box-shadow: 0 0 0 0 rgba(78,224,192,.6); animation: pulse 2s infinite; }
  body.animate.thinking .dot { background: #f5c451; animation: pulse 1.1s infinite; }
  body.animate.responding .dot { background: #7aa2ff; animation: pulse .8s infinite; }
  body.animate.responding .bars { opacity: 1; }
  body.animate.responding .bars span { animation: bounce .9s ease-in-out infinite; }
  body.animate.responding .bars span:nth-child(2) { animation-delay: .08s }
  body.animate.responding .bars span:nth-child(3) { animation-delay: .16s }
  body.animate.responding .bars span:nth-child(4) { animation-delay: .24s }
  body.animate.responding .bars span:nth-child(5) { animation-delay: .32s }
  body.animate.responding .bars span:nth-child(6) { animation-delay: .4s }
  body.animate.responding .bars span:nth-child(7) { animation-delay: .48s }
  body.animate.responding .bars span:nth-child(8) { animation-delay: .56s }
  body.animate.responding .bars span:nth-child(9) { animation-delay: .64s }
  @keyframes ring { 0% { opacity:.55; transform: scale(.85); } 100% { opacity:0; transform: scale(1.5); } }
  @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
  @keyframes bounce { 0%,100% { height: 12px } 50% { height: 50px } }
</style>
</head>
<body class="idle">
  <div class="stage">
    <div class="grid"></div>
    <div class="card">
      <div class="mark">
        <div class="orb"><div class="ring"></div><div class="ring"></div><div class="core"></div></div>
        <div class="wordmark"><span>Zeno</span></div>
      </div>
      <div class="tagline">Meeting Intelligence</div>
      <div class="status"><span class="dot"></span><span id="status-text">Standing by</span></div>
      <div class="bars" id="bars">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="caption" id="caption"></div>
    </div>
    <div class="modes">
      <div class="chip" id="chip-text">Text</div>
      <div class="chip" id="chip-voice">Voice</div>
      <div class="chip" id="chip-video">Video</div>
    </div>
  </div>
  <audio id="player" autoplay></audio>
<script>
(() => {
  const boot = ${bootstrap};
  const body = document.body;
  const statusText = document.getElementById("status-text");
  const caption = document.getElementById("caption");
  const player = document.getElementById("player");
  const chips = { text: document.getElementById("chip-text"), voice: document.getElementById("chip-voice"), video: document.getElementById("chip-video") };
  const LABELS = { idle: "Standing by", listening: "Listening", thinking: "Thinking", responding: "Answering" };
  let modes = boot.modes;
  let state = "idle";

  function render() {
    body.className = state + (modes.video ? " animate" : "");
    statusText.textContent = modes.video || modes.voice ? LABELS[state] : "Standing by";
    for (const key of ["text", "voice", "video"]) chips[key].classList.toggle("on", !!modes[key]);
  }

  function showCaption(text) {
    caption.textContent = text;
    caption.classList.add("show");
    clearTimeout(showCaption.timer);
    showCaption.timer = setTimeout(() => caption.classList.remove("show"), 14000);
  }

  const source = new EventSource("/api/media/" + boot.token + "/stream");
  source.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "modes") { modes = message.modes; render(); }
    else if (message.type === "state") { state = message.state; render(); }
    else if (message.type === "hello") { modes = message.modes; state = message.state; render(); }
    else if (message.type === "caption") { showCaption(message.text); }
    else if (message.type === "speak") {
      showCaption(message.text);
      player.src = message.url;
      player.play().catch((error) => console.warn("playback blocked", error));
    }
  };
  source.onerror = () => { statusText.textContent = "Reconnecting…"; };

  player.addEventListener("ended", () => { state = modes.voice ? "listening" : "idle"; render(); });
  render();
})();
</script>
</body>
</html>`;
}
