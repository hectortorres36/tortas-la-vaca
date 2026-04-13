const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'tortas_la_vaca',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conectado a MySQL correctamente');
    conn.release();
  } catch (err) {
    console.error('❌ Error conectando a MySQL:', err.message);
    console.error('   Verifica las credenciales en backend/.env');
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
