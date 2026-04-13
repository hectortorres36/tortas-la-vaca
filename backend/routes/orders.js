const express  = require('express');
const router   = express.Router();
const { pool } = require('../db');

// POST /api/pedidos  — guarda un pedido nuevo
router.post('/', async (req, res) => {
  const { cliente_nombre, items, notas } = req.body;

  // Validaciones básicas
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un ítem.' });
  }

  for (const item of items) {
    if (typeof item.nombre !== 'string' || item.nombre.trim().length === 0) {
      return res.status(400).json({ error: 'Nombre de ítem inválido.' });
    }
    if (typeof item.precio !== 'number' || item.precio < 0) {
      return res.status(400).json({ error: 'Precio de ítem inválido.' });
    }
    if (typeof item.qty !== 'number' || item.qty < 1 || !Number.isInteger(item.qty)) {
      return res.status(400).json({ error: 'Cantidad de ítem inválida.' });
    }
  }

  const nombre  = (cliente_nombre || 'Anónimo').trim().substring(0, 80);
  const notasSan = (notas || '').trim().substring(0, 500);
  const total   = items.reduce((sum, i) => sum + i.precio * i.qty, 0);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      'INSERT INTO pedidos (cliente_nombre, notas, total) VALUES (?, ?, ?)',
      [nombre, notasSan || null, total.toFixed(2)]
    );
    const pedidoId = result.insertId;

    const itemRows = items.map(i => [
      pedidoId,
      i.nombre.trim().substring(0, 120),
      i.qty,
      parseFloat(i.precio.toFixed(2)),
    ]);

    await conn.query(
      'INSERT INTO pedido_items (pedido_id, nombre_item, cantidad, precio_unitario) VALUES ?',
      [itemRows]
    );

    await conn.commit();
    res.status(201).json({ ok: true, pedido_id: pedidoId, total: parseFloat(total.toFixed(2)) });
  } catch (err) {
    await conn.rollback();
    console.error('Error guardando pedido:', err);
    res.status(500).json({ error: 'Error interno al guardar el pedido.' });
  } finally {
    conn.release();
  }
});

module.exports = router;
