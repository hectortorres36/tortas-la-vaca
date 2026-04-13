require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { testConnection } = require('./db');
const ordersRouter = require('./routes/orders');
const adminRouter  = require('./routes/admin');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ── Seguridad ───────────────────────────────────────────────
app.use(helmet());

// CORS: solo permitir el frontend local y el mismo servidor
const allowedOrigins = [
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:5500',   // Live Server de VS Code
  'http://127.0.0.1:5500',
  'null',                    // file:// en navegador
];
app.use(cors({
  origin: (origin, cb) => {
    // Permitir sin origin (Postman, curl) y orígenes locales
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS bloqueado: ' + origin));
  },
  methods: ['GET', 'POST'],
}));

// Rate limit global: 200 req / 15 min por IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.json({ limit: '50kb' }));

// ── Rutas ───────────────────────────────────────────────────
app.use('/api/pedidos', ordersRouter);
app.use('/api/admin',   adminRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Inicio ──────────────────────────────────────────────────
(async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Panel admin: abre admin.html en tu navegador`);
  });
})();
