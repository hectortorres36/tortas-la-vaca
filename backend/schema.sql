-- ============================================================
-- Base de datos: Tortas La Vaca
-- Sistema de control de gastos y pedidos
-- ============================================================

CREATE DATABASE IF NOT EXISTS tortas_la_vaca
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tortas_la_vaca;

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_nombre VARCHAR(80)     NOT NULL DEFAULT 'Anónimo',
  notas         TEXT,
  total         DECIMAL(8, 2)   NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cliente (cliente_nombre),
  INDEX idx_fecha   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de ítems por pedido
CREATE TABLE IF NOT EXISTS pedido_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id       INT UNSIGNED NOT NULL,
  nombre_item     VARCHAR(120) NOT NULL,
  cantidad        TINYINT UNSIGNED NOT NULL,
  precio_unitario DECIMAL(6, 2)    NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  INDEX idx_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vista: clientes ordenados por total gastado
CREATE OR REPLACE VIEW vista_top_clientes AS
SELECT
  cliente_nombre                    AS nombre,
  COUNT(*)                          AS total_pedidos,
  SUM(total)                        AS total_gastado,
  AVG(total)                        AS promedio_por_pedido,
  MAX(created_at)                   AS ultimo_pedido
FROM pedidos
GROUP BY cliente_nombre
ORDER BY total_gastado DESC;
