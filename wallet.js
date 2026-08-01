/* ============================================================
   Wallet connection logic for the Aurora Finance demo.

   Handles: the wallet-select modal, EIP-6963 multi-wallet discovery,
   and connect handlers for MetaMask / Phantom / Coinbase Wallet /
   WalletConnect. No backend or real contract calls -- see index.html.

   Depends on showToast(), shortAddr(), mockGetClaimAmount(), and
   animateNumber() from index.html's inline script. That's safe even
   though those are defined in a different <script> tag: every function
   here that calls them only runs inside a later event handler (a click,
   an eip6963 announcement), by which point every script on the page
   has already finished its initial run.
   ============================================================ */

// ---------- Wallet connection state ----------
let provider = null;
let signer = null;
let currentAddress = null;
let isConnected = false;

const walletModal = document.getElementById('walletModal');
function openModal(){ walletModal.classList.add('show'); requestWalletDiscovery(); }
function closeModal(){ walletModal.classList.remove('show'); }

document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
walletModal.addEventListener('click', (e) => { if(e.target === walletModal) closeModal(); });

const WALLET_LABELS = { metamask: 'MetaMask', coinbase: 'Coinbase Wallet', phantom: 'Phantom' };

// Wallets that both set isMetaMask=true for compatibility (Phantom is a known
// offender) make window.ethereum unreliable for telling wallets apart. EIP-6963
// fixes this: every modern wallet announces itself with its own rdns + icon, so
// clicking "Phantom" can never resolve to the MetaMask provider or vice versa.
const RDNS = { metamask: 'io.metamask', coinbase: 'com.coinbase.wallet', phantom: 'app.phantom' };
const discoveredWallets = {}; // rdns -> { info, provider }

window.addEventListener('eip6963:announceProvider', (event) => {
  const { info, provider } = event.detail;
  discoveredWallets[info.rdns] = { info, provider };
  const kind = Object.keys(RDNS).find(k => RDNS[k] === info.rdns);
  if(!kind) return;

  const row = document.getElementById('opt-' + kind);
  const iconEl = document.getElementById('icon-' + kind);
  const statusEl = document.getElementById('status-' + kind);
  const trailingEl = document.getElementById('trailing-' + kind);

  if(row) row.classList.remove('disabled');
  if(iconEl && info.icon) iconEl.innerHTML = `<img src="${info.icon}" alt="${info.name}" width="24" height="24" style="border-radius:6px;" />`;
  if(statusEl) statusEl.textContent = 'Detected — click to connect';
  if(trailingEl) trailingEl.innerHTML = '<span class="wallet-arrow">→</span>';
});
function requestWalletDiscovery(){
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
requestWalletDiscovery();

// Fallback for the rare wallet that hasn't adopted EIP-6963 yet. Explicitly
// excludes providers claiming to be Phantom so a spoofed isMetaMask flag can't
// hijack the MetaMask/Coinbase buttons.
function findLegacyInjectedProvider(kind){
  if(kind === 'phantom') return window.phantom && window.phantom.ethereum;
  const candidates = [];
  if(window.ethereum && window.ethereum.providers && window.ethereum.providers.length){
    candidates.push(...window.ethereum.providers);
  }
  if(window.ethereum) candidates.push(window.ethereum);
  const flag = kind === 'coinbase' ? 'isCoinbaseWallet' : 'isMetaMask';
  return candidates.find(p => p && p[flag] && !p.isPhantom);
}

async function connectInjected(kind){
  const rdns = RDNS[kind];
  const eth = (discoveredWallets[rdns] && discoveredWallets[rdns].provider) || findLegacyInjectedProvider(kind);
  if(!eth){
    showToast(`${WALLET_LABELS[kind]} not detected. Install the ${WALLET_LABELS[kind]} extension to use it.`);
    return;
  }
  try{
    provider = new ethers.BrowserProvider(eth);
    await provider.send('eth_requestAccounts', []);
    signer = await provider.getSigner();
    currentAddress = await signer.getAddress();
    const network = await provider.getNetwork();
    onConnected(currentAddress, network);
  }catch(err){
    console.error(err);
    showToast(err && err.message ? err.message : 'Wallet connection was rejected.');
  }
}

async function connectWalletConnect(){
  showToast('WalletConnect requires a project ID from cloud.walletconnect.com — wire this up with @walletconnect/ethereum-provider before going live.', 4500);
}

['metamask', 'phantom', 'coinbase'].forEach((kind) => {
  const row = document.getElementById('opt-' + kind);
  row.addEventListener('click', () => {
    if(row.classList.contains('disabled')) return; // not installed — the "Get" link handles this case
    closeModal();
    connectInjected(kind);
  });
});
document.getElementById('opt-walletconnect').addEventListener('click', () => { closeModal(); connectWalletConnect(); });

function onConnected(address, network){
  isConnected = true;
  document.getElementById('claimCard').style.display = 'block';
  document.getElementById('walletAddr').textContent = shortAddr(address);
  document.getElementById('walletNet').textContent = network && network.name ? network.name : 'Connected';

  const amount = mockGetClaimAmount(address);
  animateNumber(document.getElementById('claimAmount'), amount);
  document.getElementById('claimUsd').textContent = `≈ $${(amount * 0.42).toLocaleString(undefined,{maximumFractionDigits:2})} USD (mock price)`;

  const claimBtn = document.getElementById('claimBtn');
  claimBtn.textContent = 'Claim Now';

  showToast('Wallet connected: ' + shortAddr(address));
  document.getElementById('claim').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// React to account/network changes if an injected wallet is present.
if(typeof window.ethereum !== 'undefined'){
  window.ethereum.on && window.ethereum.on('accountsChanged', (accounts) => {
    if(accounts.length === 0){
      location.reload();
    }
  });
  window.ethereum.on && window.ethereum.on('chainChanged', () => location.reload());
}
