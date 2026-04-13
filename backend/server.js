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

// Necesario para que rate-limit funcione correctamente detrás de ngrok/proxies
app.set('trust proxy', 1);

// ── Seguridad ───────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));

// CORS: permitir cualquier origen (necesario para archivos locales y Railway)
const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Manejar preflight OPTIONS explícitamente

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
