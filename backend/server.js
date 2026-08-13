require('dotenv').config();
const path       = require('path');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { testConnection } = require('./db');
const ordersRouter = require('./routes/orders');
const adminRouter  = require('./routes/admin');
const { iniciarWhatsappBot } = require('./whatsapp-bot');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

// Necesario para que rate-limit funcione correctamente detrás de ngrok/proxies
app.set('trust proxy', 1);

// ── Seguridad ───────────────────────────────────────────────
// CSP desactivado: el frontend usa estilos/scripts inline y fuentes de Google
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));

// CORS: permitir cualquier origen (necesario para archivos locales y Railway)
const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
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

// ── Frontend estático ──────────────────────────────────────
// Copia de los archivos de la raíz del repo: Railway solo despliega esta
// carpeta (Root Directory = /backend), así que deben vivir aquí también.
const PUBLIC_DIR = path.join(__dirname, 'public');

// HTML y el service worker deben revalidarse siempre (evita servir versiones viejas)
const NO_CACHE_FILES = ['index.html', 'admin.html', 'service-worker.js'];
// Assets que casi no cambian: se cachean fuerte en el navegador
const LONG_CACHE_FILES = ['logo.jpeg', 'logo.svg'];

NO_CACHE_FILES.forEach(file => {
  app.get(`/${file}`, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file), { maxAge: 0, cacheControl: false, headers: { 'Cache-Control': 'no-cache' } }));
});
LONG_CACHE_FILES.forEach(file => {
  app.get(`/${file}`, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, file), { maxAge: '7d' }));
});
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html'), { maxAge: 0, cacheControl: false, headers: { 'Cache-Control': 'no-cache' } }));

// ── Inicio ──────────────────────────────────────────────────
(async () => {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Panel admin: abre admin.html en tu navegador`);
  });

  // El bot no debe tumbar el servidor si falla (ej. Chromium no disponible)
  try {
    iniciarWhatsappBot();
  } catch (err) {
    console.error('❌ Error arrancando el bot de WhatsApp:', err);
  }
})();
