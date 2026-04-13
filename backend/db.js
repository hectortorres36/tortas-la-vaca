const mysql = require('mysql2/promise');
require('dotenv').config();

// Soporta MYSQL_URL (Railway) o variables individuales (.env local)
const poolConfig = process.env.MYSQL_URL
  ? {
      uri: process.env.MYSQL_URL,
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
    }
  : {
      host:     process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.MYSQLPORT     || process.env.DB_PORT)  || 3306,
      user:     process.env.MYSQLUSER     || process.env.DB_USER     || 'root',
      password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.MYSQLDATABASE || process.env.DB_NAME     || 'tortas_la_vaca',
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      charset:            'utf8mb4',
    };

const pool = mysql.createPool(poolConfig);

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conectado a MySQL correctamente');
    conn.release();
  } catch (err) {
    console.error('❌ Error conectando a MySQL:', err.message);
    console.error('   Verifica las credenciales en backend/.env');
    // No hacer process.exit para que Railway no reinicie en loop
  }
}

module.exports = { pool, testConnection };
