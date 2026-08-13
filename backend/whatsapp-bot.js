const path = require('path');
const qrcodeTerminal = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { pool } = require('./db');

const DATA_PATH = process.env.WWEBJS_DATA_PATH || path.join(__dirname, '.wwebjs_auth');

const TRIGGER_LISTA = /^(pedidos|lista)$/i;
const TRIGGER_LISTO = /^(listo|hecho)\s+(\d+)$/i;
const TRIGGER_AYUDA = /^(ayuda|help)$/i;

async function obtenerPedidosPendientes() {
  const [pedidos] = await pool.query(
    `SELECT id, cliente_nombre, notas, hora_entrega, total, created_at
     FROM pedidos
     WHERE estado = 'pendiente'
     ORDER BY (hora_entrega IS NULL), hora_entrega ASC, created_at ASC`
  );
  if (pedidos.length === 0) return [];

  const ids = pedidos.map(p => p.id);
  const [items] = await pool.query(
    'SELECT pedido_id, nombre_item, cantidad FROM pedido_items WHERE pedido_id IN (?)',
    [ids]
  );
  const itemsMap = {};
  for (const it of items) {
    if (!itemsMap[it.pedido_id]) itemsMap[it.pedido_id] = [];
    itemsMap[it.pedido_id].push(it);
  }
  return pedidos.map(p => ({ ...p, items: itemsMap[p.id] || [] }));
}

function formatearLista(pedidos) {
  if (pedidos.length === 0) return '🎉 No hay pedidos pendientes.';

  const bloques = pedidos.map(p => {
    let bloque = `*#${p.id}* - ${p.cliente_nombre}`;
    if (p.hora_entrega) bloque += ` - 🕒 ${p.hora_entrega}`;
    bloque += '\n';
    bloque += p.items.map(i => `• ${i.cantidad}x ${i.nombre_item}`).join('\n');
    bloque += `\nTotal: $${Number(p.total).toFixed(2)}`;
    if (p.notas) bloque += `\n📝 ${p.notas}`;
    return bloque;
  });

  return `📋 *Pedidos pendientes (${pedidos.length})*\n\n${bloques.join('\n\n')}\n\n_Responde "listo <numero>" para marcar un pedido como entregado._`;
}

async function marcarListo(id) {
  const [result] = await pool.execute(
    `UPDATE pedidos SET estado = 'listo' WHERE id = ? AND estado = 'pendiente'`,
    [id]
  );
  if (result.affectedRows === 0) {
    const [[pedido]] = await pool.execute('SELECT id FROM pedidos WHERE id = ?', [id]);
    return pedido ? `⚠️ El pedido #${id} ya estaba marcado como listo.` : `⚠️ No encontré el pedido #${id}.`;
  }
  const [[pedido]] = await pool.execute('SELECT cliente_nombre FROM pedidos WHERE id = ?', [id]);
  return `✅ Pedido #${id} (${pedido.cliente_nombre}) marcado como listo.`;
}

function iniciarWhatsappBot() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: DATA_PATH }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', qr => {
    console.log('📱 Escanea este QR con el WhatsApp del negocio (WhatsApp > Dispositivos vinculados > Vincular un dispositivo):');
    qrcodeTerminal.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ Bot de WhatsApp listo. Escribete a ti mismo "pedidos" para ver la lista.');
  });

  client.on('auth_failure', msg => {
    console.error('❌ Fallo de autenticacion de WhatsApp:', msg);
  });

  client.on('disconnected', reason => {
    console.error('⚠️ WhatsApp desconectado:', reason);
  });

  // message_create incluye los mensajes que el propio numero se envia a si mismo
  client.on('message_create', async msg => {
    try {
      if (!msg.fromMe) return; // solo el numero del negocio puede pedir la lista
      const texto = (msg.body || '').trim();

      if (TRIGGER_LISTA.test(texto)) {
        const pendientes = await obtenerPedidosPendientes();
        await msg.reply(formatearLista(pendientes));
        return;
      }

      const matchListo = texto.match(TRIGGER_LISTO);
      if (matchListo) {
        const respuesta = await marcarListo(parseInt(matchListo[2], 10));
        await msg.reply(respuesta);
        return;
      }

      if (TRIGGER_AYUDA.test(texto)) {
        await msg.reply('Comandos disponibles:\n• *pedidos* / *lista* - ver pedidos pendientes\n• *listo <numero>* - marcar un pedido como entregado');
      }
    } catch (err) {
      console.error('Error procesando comando de WhatsApp:', err);
      try { await msg.reply('⚠️ Ocurrió un error consultando los pedidos.'); } catch {}
    }
  });

  client.initialize().catch(err => {
    console.error('❌ No se pudo inicializar el bot de WhatsApp:', err);
  });

  return client;
}

module.exports = { iniciarWhatsappBot };
