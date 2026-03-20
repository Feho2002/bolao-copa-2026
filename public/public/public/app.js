// ========== ESTADO GLOBAL ==========
let currentUser = null;
let currentMarketId = null;
let currentSettleMarketId = null;
let currentBalanceUserId = null;
let ws = null;

const CATEGORY_LABELS = {
  champion: '🏆 Campeão do Torneio',
  topscorer: '⚽ Artilheiro',
  groups: '📊 Fase de Grupos',
  advance: '🔜 Avanço por Fase',
  matches: '🎯 Jogos Específicos'
};

// ========== INICIALIZAÇÃO ==========
window.onload = async () => {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      currentUser = await res.json();
      showMain();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
};

function showAuth() {
  document.getElementById('screen-auth').style.display = 'block';
  document.getElementById('screen-main').style.display = 'none';
}

function showMain() {
  document.getElementById('screen-auth').style.display = 'none';
  document.getElementById('screen-main').style.display = 'block';
  document.getElementById('user-name').textContent = currentUser.name;

  // Mostrar botões por papel
  if (currentUser.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  }
  if (['admin','marketmaker'].includes(currentUser.role)) {
    document.querySelectorAll('.mm-only').forEach(el => el.style.display = '');
  }

  loadBalance();
  loadMarkets();
  connectWebSocket();
}

// ========== WEBSOCKET ==========
function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'markets') loadMarkets();
    if (msg.type === 'orders' && currentMarketId) loadOrderBook(currentMarketId);
    if (msg.type === 'balances') loadBalance();
  };
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

// ========== AUTH ==========
function showLogin() {
  document.getElementById('tab-login').style.display = 'block';
  document.getElementById('tab-register').style.display = 'none';
}

function showRegister() {
  document.getElementById('tab-login').style.display = 'none';
  document.getElementById('tab-register').style.display = 'block';
}

async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) return errEl.textContent = data.error;
    currentUser = data.user;
    showMain();
  } catch {
    errEl.textContent = 'Erro de conexão';
  }
}

async function register() {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const msgEl = document.getElementById('reg-msg');
  msgEl.textContent = '';
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) return msgEl.style.color = 'var(--red)', msgEl.textContent = data.error;
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = data.message;
  } catch {
    msgEl.textContent = 'Erro de conexão';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  currentUser = null;
  if (ws) ws.close();
  showAuth();
}

// ========== NAVEGAÇÃO ==========
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  event.target.classList.add('active');

  if (tab === 'my-orders') loadMyOrders();
  if (tab === 'history') loadHistory();
  if (tab === 'admin') loadAdminUsers();
}

// ========== SALDO ==========
async function loadBalance() {
  const res = await fetch('/api/me');
  if (!res.ok) return;
  const data = await res.json();
  const users = await fetch('/api/admin/users').catch(() => null);
  // Buscar saldo atual do usuário
  try {
    const allRes = await fetch('/api/admin/users');
    if (allRes.ok) {
      const all = await allRes.json();
      const me = all.find(u => u.id === currentUser.id);
      if (me) document.getElementById('user-balance').textContent = `R$ ${parseFloat(me.balance).toFixed(2).replace('.', ',')}`;
    }
  } catch {
    // fallback silencioso
  }
}

// ========== MERCADOS ==========
async function loadMarkets() {
  const res = await fetch('/api/markets');
  if (!res.ok) return;
  const markets = await res.json();

  const container = document.getElementById('categories-container');
  container.innerHTML = '';

  // Agrupar por categoria
  const grouped = {};
  markets.forEach(m => {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  });

  if (Object.keys(grouped).length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum mercado disponível ainda.<br>Aguarde o Market Maker criar os mercados.</div>';
    return;
  }

  for (const [cat, items] of Object.entries(grouped)) {
    const block = document.createElement('div');
    block.className = 'category-block';
    block.innerHTML = `<div class="category-title">${CATEGORY_LABELS[cat] || cat}</div>`;

    const grid = document.createElement('div');
    grid.className = 'markets-grid';

    items.forEach(m => {
      const card = document.createElement('div');
      card.className = `market-card ${m.status === 'settled' ? 'settled' : ''}`;
      if (m.status === 'open') card.onclick = () => openOrderBook(m);

      const isMM = ['admin','marketmaker'].includes(currentUser?.role);
      const mmActions = isMM && m.status === 'open'
        ? `<div class="mm-actions">
             <button class="btn-sm danger" onclick="event.stopPropagation(); openSettle('${m.id}','${m.name}')">Liquidar</button>
           </div>`
        : '';

      card.innerHTML = `
        <div class="market-name">${m.name}</div>
        <div class="market-meta">
          <span class="market-status ${m.status}">${m.status === 'open' ? 'Aberto' : 'Encerrado'}</span>
          ${m.result ? `<span class="market-result">✅ ${m.result}</span>` : ''}
        </div>
        ${mmActions}
      `;
      grid.appendChild(card);
    });

    block.appendChild(grid);
    container.appendChild(block);
  }
}

// ========== ORDER BOOK ==========
async function openOrderBook(market) {
  currentMarketId = market.id;
  document.getElementById('ob-market-name').textContent = market.name;
  document.getElementById('bet-error').textContent = '';
  document.getElementById('modal-orderbook').style.display = 'flex';
  await loadOrderBook(market.id);
}

async function loadOrderBook(marketId) {
  const res = await fetch(`/api/orders/${marketId}`);
  if (!res.ok) return;
  const orders = await res.json();

  const bids = orders.filter(o => o.type === 'buy').sort((a,b) => b.price - a.price);
  const asks = orders.filter(o => o.type === 'sell').sort((a,b) => a.price - b.price);

  const bidsEl = document.getElementById('ob-bids');
  const asksEl = document.getElementById('ob-asks');

  bidsEl.innerHTML = bids.length ? bids.map(o => `
    <div class="ob-row bid">
      <span>${o.option}</span>
      <span>${o.price}%</span>
      <span>R$ ${parseFloat(o.amount).toFixed(2)}</span>
    </div>
  `).join('') : '<div class="ob-empty">Sem ordens de compra</div>';

  asksEl.innerHTML = asks.length ? asks.map(o => `
    <div class="ob-row ask">
      <span>${o.option}</span>
      <span>${o.price}%</span>
      <span>R$ ${parseFloat(o.amount).toFixed(2)}</span>
    </div>
  `).join('') : '<div class="ob-empty">Sem ordens de venda</div>';
}

// Calcular retorno potencial
document.addEventListener('input', (e) => {
  if (['bet-price','bet-amount'].includes(e.target.id)) {
    const price = parseFloat(document.getElementById('bet-price').value) || 0;
    const amount = parseFloat(document.getElementById('bet-amount').value) || 0;
    const ret = price > 0 ? (amount * (100 / price)).toFixed(2) : '0.00';
    document.getElementById('bet-return').textContent = `R$ ${ret.replace('.', ',')}`;
  }
});

async function placeOrder() {
  const option = document.getElementById('bet-option').value.trim();
  const type = document.getElementById('bet-type').value;
  const price = parseFloat(document.getElementById('bet-price').value);
  const amount = parseFloat(document.getElementById('bet-amount').value);
  const errEl = document.getElementById('bet-error');
  errEl.textContent = '';

  if (!option || !price || !amount) return errEl.textContent = 'Preencha todos os campos';
  if (price < 1 || price > 99) return errEl.textContent = 'Preço deve ser entre 1 e 99';
  if (amount < 1) return errEl.textContent = 'Valor mínimo: R$ 1,00';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketId: currentMarketId, type, option, price, amount })
    });
    const data = await res.json();
    if (!res.ok) return errEl.textContent = data.error;
    errEl.style.color = 'var(--green)';
    errEl.textContent = '✅ Aposta registrada!';
    loadBalance();
    loadOrderBook(currentMarketId);
    setTimeout(() => errEl.textContent = '', 3000);
  } catch {
    errEl.textContent = 'Erro de conexão';
  }
}

// ========== MINHAS APOSTAS ==========
async function loadMyOrders() {
  const res = await fetch('/api/my-orders');
  if (!res.ok) return;
  const orders = await res.json();
  const el = document.getElementById('my-orders-list');

  if (!orders.length) {
    el.innerHTML = '<div class="empty-state">Você ainda não fez nenhuma aposta.</div>';
    return;
  }

  el.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-info">
        <div class="order-market">${o.market_name}</div>
        <div class="order-detail">
          ${o.type === 'buy' ? '🟢 Compra' : '🔴 Venda'} · 
          ${o.option} · 
          ${o.price}% · 
          R$ ${parseFloat(o.amount).toFixed(2)}
        </div>
      </div>
      <span class="order-status ${o.status}">${
        o.status === 'open' ? 'Aberta' :
        o.status === 'won' ? '✅ Ganhou' : '❌ Perdeu'
      }</span>
    </div>
  `).join('');
}

// ========== HISTÓRICO ==========
async function loadHistory() {
  const res = await fetch('/api/my-transactions');
  if (!res.ok) return;
  const txs = await res.json();
  const el = document.getElementById('history-list');

  if (!txs.length) {
    el.innerHTML = '<div class="empty-state">Nenhuma transação ainda.</div>';
    return;
  }

  el.innerHTML = txs.map(t => {
    const positive = ['deposit','payout'].includes(t.type);
    return `
      <div class="tx-card">
        <div>
          <div>${t.description || t.type}</div>
          <div class="tx-desc">${new Date(t.created_at).toLocaleString('pt-BR')}</div>
        </div>
        <div class="tx-amount ${positive ? 'positive' : 'negative'}">
          ${positive ? '+' : '-'} R$ ${parseFloat(t.amount).toFixed(2)}
        </div>
      </div>
    `;
  }).join('');
}

// ========== ADMIN ==========
async function loadAdminUsers() {
  const res = await fetch('/api/admin/users');
  if (!res.ok) return;
  const users = await res.json();
  const el = document.getElementById('admin-users-list');

  el.innerHTML = users.map(u => `
    <div class="user-card">
      <div class="user-info">
        <div class="user-name-text">${u.name} <span class="role-badge ${u.role}">${u.role}</span></div>
        <div class="user-email">${u.email} · Saldo: R$ ${parseFloat(u.balance).toFixed(2)}</div>
      </div>
      <div class="user-actions">
        ${u.role === 'pending' ? `
          <button class="btn-sm" onclick="setRole('${u.id}','trader')">Aprovar como Trader</button>
          <button class="btn-sm" onclick="setRole('${u.id}','marketmaker')">Market Maker</button>
          <button class="btn-sm" onclick="setRole('${u.id}','admin')">Admin</button>
        ` : `
          <select onchange="setRole('${u.id}', this.value)" style="background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:12px;">
            <option value="pending" ${u.role==='pending'?'selected':''}>Pendente</option>
            <option value="trader" ${u.role==='trader'?'selected':''}>Trader</option>
            <option value="marketmaker" ${u.role==='marketmaker'?'selected':''}>Market Maker</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
          </select>
        `}
        <button class="btn-sm" onclick="openBalance('${u.id}','${u.name}')">💰 Saldo</button>
      </div>
    </div>
  `).join('');
}

async function setRole(userId, role) {
  await fetch(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
  loadAdminUsers();
}

function openBalance(userId, userName) {
  currentBalanceUserId = userId;
  document.getElementById('balance-user-name').textContent = userName;
  document.getElementById('balance-amount').value = '';
  document.getElementById('balance-desc').value = '';
  document.getElementById('modal-balance').style.display = 'flex';
}

async function adjustBalance() {
  const amount = parseFloat(document.getElementById('balance-amount').value);
  const description = document.getElementById('balance-desc').value;
  if (!amount) return;
  await fetch('/api/admin/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentBalanceUserId, amount, description })
  });
  closeModal('modal-balance');
  loadAdminUsers();
  loadBalance();
}

// ========== LIQUIDAÇÃO ==========
function openSettle(marketId, marketName) {
  currentSettleMarketId = marketId;
  document.getElementById('settle-market-name').textContent = marketName;
  document.getElementById('settle-result').value = '';
  document.getElementById('modal-settle').style.display = 'flex';
}

async function settleMarket() {
  const result = document.getElementById('settle-result').value.trim();
  if (!result) return;
  await fetch(`/api/markets/${currentSettleMarketId}/settle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ result })
  });
  closeModal('modal-settle');
  loadMarkets();
}

// ========== NOVO MERCADO ==========
function openNewMarketModal() {
  document.getElementById('new-market-name').value = '';
  document.getElementById('modal-new-market').style.display = 'flex';
}

async function createMarket() {
  const name = document.getElementById('new-market-name').value.trim();
  const category = document.getElementById('new-market-category').value;
  if (!name) return;
  await fetch('/api/markets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category })
  });
  closeModal('modal-new-market');
  loadMarkets();
}

// ========== UTILS ==========
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}
