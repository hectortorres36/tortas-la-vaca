const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const QRCode  = require('qrcode');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { getEstadoQR } = require('../whatsapp-bot');

const JWT_SECRET     = process.env.JWT_SECRET     || process.env.JWT_SECRETO     || 'cambiar_en_produccion';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_CONTRASEÑA || 'admin123';

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

// GET /api/admin/whatsapp-qr?password=...  — imagen del QR para vincular el bot de WhatsApp
router.get('/whatsapp-qr', loginLimiter, async (req, res) => {
  if (!req.query.password || req.query.password !== ADMIN_PASSWORD) {
    return res.status(401).send('Contraseña incorrecta.');
  }
  const { qr, listo } = getEstadoQR();
  if (listo) {
    return res.status(200).send('✅ El bot de WhatsApp ya está vinculado. No hay QR pendiente.');
  }
  if (!qr) {
    return res.status(202).send('⏳ El bot todavía no generó un QR. Espera unos segundos y recarga esta página.');
  }
  try {
    const png = await QRCode.toBuffer(qr, { width: 500, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (err) {
    console.error('Error generando QR de WhatsApp:', err);
    res.status(500).send('Error generando el QR.');
  }
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

    const [pedidos] = await pool.query(
      `SELECT id, cliente_nombre, notas, hora_entrega, estado, total, created_at
       FROM pedidos
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    );

    if (pedidos.length === 0) return res.json([]);

    const ids = pedidos.map(p => p.id);
    const [items] = await pool.query(
      'SELECT pedido_id, nombre_item, cantidad, precio_unitario FROM pedido_items WHERE pedido_id IN (?)',
      [ids]
    );

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

// PATCH /api/admin/pedidos/:id/estado  — marcar un pedido como pendiente/listo
router.patch('/pedidos/:id/estado', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const { estado } = req.body;
  if (!id || id < 1) return res.status(400).json({ error: 'ID inválido.' });
  if (estado !== 'pendiente' && estado !== 'listo') {
    return res.status(400).json({ error: 'Estado inválido.' });
  }
  try {
    const [result] = await pool.execute('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json({ ok: true, estado });
  } catch (err) {
    console.error('Error actualizando estado del pedido:', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// DELETE /api/admin/clientes/:nombre  — eliminar todos los pedidos de un cliente (limpieza de pedidos de prueba)
router.delete('/clientes/:nombre', authMiddleware, async (req, res) => {
  const nombre = (req.params.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Nombre inválido.' });
  try {
    const [result] = await pool.execute('DELETE FROM pedidos WHERE cliente_nombre = ?', [nombre]);
    res.json({ ok: true, eliminados: result.affectedRows });
  } catch (err) {
    console.error('Error eliminando pedidos del cliente:', err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// DELETE /api/admin/pedidos/:id  — eliminar pedido
router.delete('/pedidos/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [result] = await pool.execute('DELETE FROM pedidos WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error eliminando pedido:', err);
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
