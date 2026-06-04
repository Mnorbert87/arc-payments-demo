// Arc Agent Guard demo. The guard logic runs client-side, mirroring arc-agent-guard:
// per-payment max, daily cap, recipient allowlist (deny by default), approval threshold.
// Allowed payments are sent as native USDC (18 decimals) through the user's wallet.

const ARC = {
  chainIdHex: "0x4cef52",            // 5042002
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};
const EXPLORER = ARC.blockExplorerUrls[0];

let provider, signer, account;

const $ = (id) => document.getElementById(id);
const todayKey = () => "spent-" + new Date().toISOString().slice(0, 10);

// ---- policy persistence ----
function loadPolicy() {
  const p = JSON.parse(localStorage.getItem("policy") || "{}");
  $("perTx").value = p.perTx ?? "";
  $("daily").value = p.daily ?? "";
  $("appr").value = p.appr ?? "";
  $("allow").value = (p.allow || []).join("\n");
  refreshSpent();
}
function savePolicy() {
  const allow = $("allow").value.split(/\s+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const p = {
    perTx: parseFloat($("perTx").value) || null,
    daily: parseFloat($("daily").value) || null,
    appr: parseFloat($("appr").value) || null,
    allow,
  };
  localStorage.setItem("policy", JSON.stringify(p));
  $("policySaved").textContent = "saved";
  setTimeout(() => ($("policySaved").textContent = ""), 1500);
  return p;
}
function policy() { return JSON.parse(localStorage.getItem("policy") || "{}"); }
function spentToday() { return parseFloat(localStorage.getItem(todayKey()) || "0"); }
function addSpent(a) { localStorage.setItem(todayKey(), String(spentToday() + a)); refreshSpent(); }
function refreshSpent() { $("spent").value = spentToday().toFixed(4) + " USDC"; }

// ---- the guard, same rules as the Python engine ----
function evaluate(to, amount) {
  const p = policy();
  to = (to || "").toLowerCase().trim();
  if (!/^0x[0-9a-f]{40}$/.test(to)) return { d: "deny", why: "recipient is not a valid 0x address" };
  if (!(amount > 0)) return { d: "deny", why: "amount must be positive" };
  const allow = p.allow || [];
  if (allow.length === 0) return { d: "deny", why: "allowlist is empty, so every recipient is denied by default" };
  if (!allow.includes(to)) return { d: "deny", why: "recipient is not in the allowlist" };
  if (p.perTx != null && amount > p.perTx) return { d: "deny", why: `amount ${amount} is over the per-payment max ${p.perTx}` };
  if (p.daily != null && spentToday() + amount > p.daily) return { d: "deny", why: `would exceed the daily cap ${p.daily} (spent ${spentToday()} today)` };
  if (p.appr != null && amount >= p.appr) return { d: "appr", why: `amount ${amount} is at or above the approval threshold ${p.appr}` };
  return { d: "allow", why: "within policy" };
}

function showDecision(kind, text) {
  const el = $("decision");
  el.className = "decision " + (kind === "allow" ? "allow" : kind === "appr" ? "appr" : "deny");
  el.textContent = text;
}

// ---- audit log ----
function logRow(to, amount, decision, tx) {
  const arr = JSON.parse(localStorage.getItem("audit") || "[]");
  arr.unshift({ t: new Date().toLocaleTimeString(), to, amount, decision, tx });
  localStorage.setItem("audit", JSON.stringify(arr.slice(0, 50)));
  renderLog();
}
function renderLog() {
  const arr = JSON.parse(localStorage.getItem("audit") || "[]");
  const body = $("log").querySelector("tbody");
  body.innerHTML = "";
  $("logEmpty").style.display = arr.length ? "none" : "block";
  for (const r of arr) {
    const tr = document.createElement("tr");
    const txCell = r.tx ? `<a href="${EXPLORER}/tx/${r.tx}" target="_blank" rel="noopener">view</a>` : "";
    tr.innerHTML = `<td>${r.t}</td><td><code>${r.to.slice(0,6)}…${r.to.slice(-4)}</code></td><td>${r.amount}</td><td>${r.decision}</td><td>${txCell}</td>`;
    body.appendChild(tr);
  }
}

// ---- wallet ----
async function connect() {
  if (!window.ethereum) { alert("MetaMask not found. Install it to use this demo."); return; }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC.chainIdHex }] });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ARC] });
    }
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  account = await signer.getAddress();
  const net = await provider.getNetwork();
  $("addr").textContent = account.slice(0, 6) + "…" + account.slice(-4);
  const onArc = Number(net.chainId) === 5042002;
  const pill = $("netpill");
  pill.textContent = onArc ? "Arc Testnet" : "wrong network";
  pill.className = "pill" + (onArc ? " ok" : "");
  await refreshBalance();
}
async function refreshBalance() {
  if (!provider || !account) return;
  const wei = await provider.getBalance(account);
  $("bal").textContent = Number(ethers.formatUnits(wei, 18)).toFixed(4);
}

async function guardedSend(force) {
  const to = $("to").value.trim();
  const amount = parseFloat($("amt").value);
  const ev = evaluate(to, amount);
  if (ev.d === "deny") { showDecision("deny", "Blocked: " + ev.why); logRow(to || "(invalid)", amount || 0, "denied", null); return; }
  if (ev.d === "appr" && !force) {
    showDecision("appr", "Needs approval: " + ev.why + ". Click Guarded send again to approve.");
    $("send").dataset.force = "1";
    return;
  }
  if (!signer) { showDecision("deny", "Connect your wallet first."); return; }
  showDecision("allow", "Allowed. Confirm the transaction in your wallet.");
  try {
    const tx = await signer.sendTransaction({ to, value: ethers.parseUnits(String(amount), 18) });
    logRow(to, amount, force ? "approved" : "executed", tx.hash);
    addSpent(amount);
    showDecision("allow", "Sent. Tx " + tx.hash.slice(0, 10) + "…");
    $("send").dataset.force = "";
    tx.wait().then(refreshBalance);
  } catch (e) {
    showDecision("deny", "Wallet rejected or failed: " + (e.shortMessage || e.message || e));
  }
}

$("connect").onclick = connect;
$("savePolicy").onclick = savePolicy;
$("check").onclick = () => {
  const ev = evaluate($("to").value.trim(), parseFloat($("amt").value));
  showDecision(ev.d, (ev.d === "allow" ? "Would allow: " : ev.d === "appr" ? "Would ask approval: " : "Would block: ") + ev.why);
};
$("send").onclick = () => guardedSend($("send").dataset.force === "1");

loadPolicy();
renderLog();
if (window.ethereum) window.ethereum.on?.("accountsChanged", () => location.reload());
