const fs = require('fs');
const path = require('path');
const qrcodeTerminal = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { pool } = require('./db');

const DATA_PATH = process.env.WWEBJS_DATA_PATH || path.join(__dirname, '.wwebjs_auth');

// El contenedor anterior puede morir sin cerrar Chromium limpiamente y dejar
// un lock de perfil que impide arrancar en el contenedor nuevo (mismo volumen)
const LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
function limpiarLocksDeChromium(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      limpiarLocksDeChromium(full);
    } else if (LOCK_FILES.includes(entry.name)) {
      try {
        fs.unlinkSync(full);
        console.log('🧹 Lock de Chromium eliminado:', full);
      } catch (err) {
        console.error('No se pudo eliminar lock', full, err.message);
      }
    }
  }
}

const TRIGGER_LISTA = /^(pedidos|lista)$/i;
const TRIGGER_LISTA_HOY = /^(pedidos hoy|lista hoy|hoy)$/i;
const TRIGGER_LISTO = /^(listo|hecho)\s+(\d+)$/i;
const TRIGGER_AYUDA = /^(ayuda|help)$/i;

// Estado del ultimo QR generado, para poder servirlo por HTTP (ver getEstadoQR)
const estado = { qr: null, listo: false };
function getEstadoQR() {
  return estado;
}

async function obtenerPedidosPendientes(soloHoy = false) {
  const [pedidos] = await pool.query(
    `SELECT id, cliente_nombre, notas, hora_entrega, total, created_at
     FROM pedidos
     WHERE estado = 'pendiente' ${soloHoy ? 'AND DATE(created_at) = CURDATE()' : ''}
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

function formatearPedido(p) {
  let bloque = `*#${p.id}* - ${p.cliente_nombre}`;
  if (p.hora_entrega) bloque += ` - 🕒 ${p.hora_entrega}`;
  bloque += '\n';
  bloque += p.items.map(i => `• ${i.cantidad}x ${i.nombre_item}`).join('\n');
  bloque += `\nTotal: $${Number(p.total).toFixed(2)}`;
  if (p.notas) bloque += `\n📝 ${p.notas}`;
  return bloque;
}

function formatearLista(pedidos, soloHoy = false) {
  if (pedidos.length === 0) {
    return soloHoy ? '🎉 No hay pedidos pendientes para hoy.' : '🎉 No hay pedidos pendientes.';
  }

  const hoyKey = new Date().toISOString().slice(0, 10);
  const grupos = new Map();
  for (const p of pedidos) {
    const key = new Date(p.created_at).toISOString().slice(0, 10);
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(p);
  }

  const secciones = [...grupos.keys()].sort().map(key => {
    const fechaLegible = new Date(`${key}T12:00:00`).toLocaleDateString('es-SV', {
      weekday: 'long', day: 'numeric', month: 'long',
    });
    const titulo = key === hoyKey ? `📅 *Hoy* (${fechaLegible})` : `📅 *${fechaLegible}*`;
    const bloques = grupos.get(key).map(formatearPedido);
    return `${titulo}\n\n${bloques.join('\n\n')}`;
  });

  return `📋 *Pedidos pendientes (${pedidos.length})*\n\n${secciones.join('\n\n')}\n\n_Responde "listo <numero>" para marcar un pedido como entregado._`;
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
  limpiarLocksDeChromium(DATA_PATH);

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: DATA_PATH }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', qr => {
    estado.qr = qr;
    estado.listo = false;
    console.log('📱 Escanea este QR con el WhatsApp del negocio (WhatsApp > Dispositivos vinculados > Vincular un dispositivo):');
    console.log('   O abre: ' + '/api/admin/whatsapp-qr?password=TU_ADMIN_PASSWORD');
    qrcodeTerminal.generate(qr, { small: true });
  });

  client.on('ready', () => {
    estado.qr = null;
    estado.listo = true;
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

      if (TRIGGER_LISTA_HOY.test(texto)) {
        const pendientes = await obtenerPedidosPendientes(true);
        await msg.reply(formatearLista(pendientes, true));
        return;
      }

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
        await msg.reply('Comandos disponibles:\n• *pedidos* / *lista* - ver todos los pedidos pendientes\n• *pedidos hoy* / *hoy* - ver solo los pendientes de hoy\n• *listo <numero>* - marcar un pedido como entregado');
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

module.exports = { iniciarWhatsappBot, getEstadoQR };
