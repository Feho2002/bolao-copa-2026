const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const path = require('path');
const PgSession = require('connect-pg-simple')(session);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'bolao-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// Inicializar banco de dados
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(200) NOT NULL,
      role VARCHAR(20) DEFAULT 'pending',
      balance DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS markets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      category VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'open',
      result VARCHAR(200),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      market_id UUID REFERENCES markets(id),
      type VARCHAR(10) NOT NULL,
      option VARCHAR(200) NOT NULL,
      price DECIMAL(5,2) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      status VARCHAR(20) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      type VARCHAR(30) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Banco de dados inicializado');
}

// Middleware de autenticação
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    next();
  };
}

// ==================== ROTAS DE AUTH ====================

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, 'pending']
    );
    res.json({ ok: true, message: 'Cadastro enviado! Aguarde aprovação do Admin.' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'E-mail já cadastrado' });
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }
    if (user.role === 'pending') {
      return res.status(403).json({ error: 'Cadastro aguardando aprovação do Admin' });
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ ok: true, user: req.session.user });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

// ==================== ROTAS DE ADMIN ====================

app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const result = await pool.query('SELECT id, name, email, role, balance, created_at FROM users ORDER BY created_at DESC');
  res.json(result.rows);
});

app.patch('/api/admin/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  res.json({ ok: true });
});

app.post('/api/admin/balance', requireAuth, requireRole('admin'), async (req, res) => {
  const { userId, amount, description } = req.body;
  await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId]);
  await pool.query(
    'INSERT INTO transactions (user_id, type, amount, description) VALUES ($1, $2, $3, $4)',
    [userId, amount > 0 ? 'deposit' : 'withdraw', Math.abs(amount), description]
  );
  broadcastUpdate('balances');
  res.json({ ok: true });
});

// ==================== ROTAS DE MERCADOS ====================

app.get('/api/markets', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM markets ORDER BY category, name');
  res.json(result.rows);
});

app.post('/api/markets', requireAuth, requireRole('admin', 'marketmaker'), async (req, res) => {
  const { name, category } = req.body;
  const result = await pool.query(
    'INSERT INTO markets (name, category) VALUES ($1, $2) RETURNING *',
    [name, category]
  );
  broadcastUpdate('markets');
  res.json(result.rows[0]);
});

app.patch('/api/markets/:id/settle', requireAuth, requireRole('admin', 'marketmaker'), async (req, res) => {
  const { result: marketResult } = req.body;
  await pool.query('UPDATE markets SET status = $1, result = $2 WHERE id = $3', ['settled', marketResult, req.params.id]);

  // Liquidar apostas vencedoras
  const winners = await pool.query(
    `SELECT * FROM orders WHERE market_id = $1 AND option = $2 AND status = 'open'`,
    [req.params.id, marketResult]
  );
  for (const order of winners.rows) {
    const payout = parseFloat(order.amount) * (100 / parseFloat(order.price));
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [payout, order.user_id]);
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['won', order.id]);
    await pool.query(
      'INSERT INTO transactions (user_id, type, amount, description) VALUES ($1, $2, $3, $4)',
      [order.user_id, 'payout', payout, `Ganhou aposta: ${marketResult}`]
    );
  }

  // Marcar perdedoras
  await pool.query(
    `UPDATE orders SET status = 'lost' WHERE market_id = $1 AND status = 'open'`,
    [req.params.id]
  );

  broadcastUpdate('markets');
  broadcastUpdate('balances');
  res.json({ ok: true });
});

// ==================== ROTAS DE ORDENS ====================

app.get('/api/orders/:marketId', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT o.*, u.name as user_name FROM orders o 
     JOIN users u ON o.user_id = u.id 
     WHERE o.market_id = $1 AND o.status = 'open' 
     ORDER BY o.price DESC`,
    [req.params.marketId]
  );
  res.json(result.rows);
});

app.post('/api/orders', requireAuth, requireRole('trader', 'marketmaker', 'admin'), async (req, res) => {
  const { marketId, type, option, price, amount } = req.body;

  // Verificar saldo
  const userResult = await pool.query('SELECT balance FROM users WHERE id = $1', [req.session.user.id]);
  const balance = parseFloat(userResult.rows[0].balance);
  if (balance < amount) return res.status(400).json({ error: 'Saldo insuficiente' });

  // Descontar saldo
  await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, req.session.user.id]);
  await pool.query(
    'INSERT INTO transactions (user_id, type, amount, description) VALUES ($1, $2, $3, $4)',
    [req.session.user.id, 'bet', amount, `Aposta: ${option} @ ${price}%`]
  );

  // Criar ordem
  const result = await pool.query(
    'INSERT INTO orders (user_id, market_id, type, option, price, amount) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [req.session.user.id, marketId, type, option, price, amount]
  );

  broadcastUpdate('orders');
  broadcastUpdate('balances');
  res.json(result.rows[0]);
});

app.get('/api/my-orders', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT o.*, m.name as market_name FROM orders o 
     JOIN markets m ON o.market_id = m.id 
     WHERE o.user_id = $1 ORDER BY o.created_at DESC`,
    [req.session.user.id]
  );
  res.json(result.rows);
});

app.get('/api/my-transactions', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.session.user.id]
  );
  res.json(result.rows);
});

// ==================== WEBSOCKET ====================

function broadcastUpdate(type) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type }));
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected' }));
});

// ==================== INICIAR ====================

initDB().then(() => {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
});
