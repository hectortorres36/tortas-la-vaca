const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');

const JWT_SECRET     = process.env.JWT_SECRET     || 'cambiar_en_produccion';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Rate limit para el login: máx 10 intentos cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware de autenticación JWT
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  const token = auth.slice(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// POST /api/admin/login
router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ ok: true, token });
});

// GET /api/admin/clientes  — top clientes por gasto total
router.get('/clientes', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        cliente_nombre                          AS nombre,
        COUNT(*)                                AS total_pedidos,
        SUM(total)                              AS total_gastado,
        ROUND(AVG(total), 2)                    AS promedio_pedido,
        MAX(created_at)                         AS ultimo_pedido
      FROM pedidos
      GROUP BY cliente_nombre
      ORDER BY total_gastado DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error obteniendo clientes:', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// GET /api/admin/pedidos  — pedidos recientes con sus ítems
router.get('/pedidos', authMiddleware, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0,  0);

    const [pedidos] = await pool.execute(`
      SELECT id, cliente_nombre, notas, total, created_at
      FROM pedidos
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    if (pedidos.length === 0) return res.json([]);

    const ids = pedidos.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const [items] = await pool.execute(`
      SELECT pedido_id, nombre_item, cantidad, precio_unitario
      FROM pedido_items
      WHERE pedido_id IN (${placeholders})
    `, ids);

    const itemsMap = {};
    for (const it of items) {
      if (!itemsMap[it.pedido_id]) itemsMap[it.pedido_id] = [];
      itemsMap[it.pedido_id].push(it);
    }

    const result = pedidos.map(p => ({ ...p, items: itemsMap[p.id] || [] }));
    res.json(result);
  } catch (err) {
    console.error('Error obteniendo pedidos:', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// GET /api/admin/stats  — resumen general
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [[stats]] = await pool.execute(`
      SELECT
        COUNT(*)              AS total_pedidos,
        COALESCE(SUM(total), 0)  AS ingresos_totales,
        COALESCE(AVG(total), 0)  AS ticket_promedio,
        COUNT(DISTINCT cliente_nombre) AS clientes_unicos
      FROM pedidos
    `);

    const [[hoy]] = await pool.execute(`
      SELECT
        COUNT(*)             AS pedidos_hoy,
        COALESCE(SUM(total), 0) AS ingresos_hoy
      FROM pedidos
      WHERE DATE(created_at) = CURDATE()
    `);

    res.json({ ...stats, ...hoy });
  } catch (err) {
    console.error('Error en stats:', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

module.exports = router;
