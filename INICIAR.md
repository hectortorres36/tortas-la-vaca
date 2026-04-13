# Cómo iniciar el sistema de Tortas La Vaca

## 1. Configurar MySQL

Abre MySQL y ejecuta el schema:

```sql
-- En tu cliente MySQL (Workbench, HeidiSQL, terminal, etc.)
source schema.sql
```

O copia y pega el contenido de `backend/schema.sql`.

---

## 2. Configurar credenciales

Edita el archivo `backend/.env` con tus datos de MySQL:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=TU_PASSWORD_AQUI
DB_NAME=tortas_la_vaca

PORT=3000
ADMIN_PASSWORD=admin123
JWT_SECRET=tortas_la_vaca_jwt_secret_2024_xK9mP2qR
```

---

## 3. Iniciar el backend

Abre una terminal en la carpeta `backend/` y ejecuta:

```bash
npm start
```

Deberías ver:
```
✅ Conectado a MySQL correctamente
🚀 Servidor corriendo en http://localhost:3000
```

---

## 4. Abrir la app

- **Menú (clientes):** Abre `index.html` en el navegador
- **Admin:** Abre `admin.html` en el navegador → contraseña: `admin123`

---

## Cambiar la contraseña de admin

Edita `backend/.env` y cambia `ADMIN_PASSWORD=tu_nueva_password`.
Reinicia el servidor.

---

## Notas

- Los pedidos se guardan automáticamente en MySQL cuando el cliente presiona "Enviar por WhatsApp".
- Si el backend no está corriendo, el pedido igual se envía por WhatsApp (sin guardarse).
- El panel admin muestra clientes ordenados por total gastado, pedidos recientes y estadísticas del día.
