# Desplegar Competition Manager en Dokploy

Guía paso a paso para dejar la aplicación en producción: base de datos, API y
frontend en un solo despliegue con `docker-compose`.

Al terminar tendrás la aplicación en tu dominio, con HTTPS, la base de datos
creada automáticamente y el administrador listo para el primer ingreso.

---

## Qué se despliega

Un único `docker-compose.yml` con tres contenedores:

| Servicio   | Imagen            | Puerto | Expuesto a Internet |
| ---------- | ----------------- | ------ | ------------------- |
| `mysql`    | `mysql:8.0`       | 3306   | No                  |
| `backend`  | build de `backend/`  | 3001   | No                  |
| `frontend` | build de `frontend/` | 80     | **Sí** (tu dominio) |

Solo `frontend` es accesible desde fuera. Sirve la aplicación y reenvía por la
red interna `/api` y `/socket.io` al backend. Al compartir origen no hay
problemas de CORS ni de cookies entre dominios.

**No hay que ejecutar ningún `.sql` a mano.** El backend crea la base de datos,
las tablas y el usuario administrador al arrancar, y vuelve a comprobarlo en
cada despliegue sin tocar los datos existentes.

### ¿Compose o un solo Dockerfile?

**Compose.** No son alternativas rivales: `backend/` y `frontend/` ya tienen
**su propio Dockerfile**, y el `docker-compose.yml` es lo que los orquesta
(orden de arranque, red interna, healthchecks, el único puerto expuesto y las
variables de entorno). Un Dockerfile construye **una** imagen/un proceso; esta
app son tres servicios que deben convivir, así que "desplegar con un Dockerfile"
solo sería o un contenedor monolítico (mysql+node+nginx juntos, un antipatrón
que rompe backups, actualizaciones y escalado) o lanzar los tres a mano con
`docker run` (reinventar, peor, lo que hace compose). Un Dockerfile suelto solo
tiene sentido si despliegas **un único servicio** en un PaaS por-servicio
(Railway, Render, Fly) con una base de datos gestionada aparte.

---

## Antes de empezar

- Un servidor con Dokploy instalado y funcionando.
- Un dominio o subdominio apuntando por DNS (registro `A`) a la IP del servidor.
  Ejemplo: `evento.tudominio.com`.
- El repositorio del proyecto en GitHub, GitLab o Bitbucket.

---

## Paso 1 · Generar el secreto de sesión

En tu equipo, ejecuta:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copia el resultado: es el valor de `JWT_SECRET`. Debe tener al menos 32
caracteres y no compartirse. Si lo cambias más adelante, todas las sesiones
abiertas se cierran.

---

## Paso 2 · Crear el proyecto en Dokploy

1. Entra en el panel de Dokploy.
2. **Projects → Create Project**.
3. Nombre: `competition-manager`. Guarda.

---

## Paso 3 · Crear el servicio Compose

1. Dentro del proyecto: **Create Service → Compose**.
2. Nombre: `competition-manager`.
3. **Provider**: `Git`.
4. Rellena:
   - **Repository**: la URL de tu repositorio.
   - **Branch**: `master` (o la rama que uses).
   - **Compose Path**: `./docker-compose.yml`
5. Guarda.

> Si el repositorio es privado, añade antes la credencial en
> **Settings → Git Providers** y selecciónala aquí.

---

## Paso 4 · Configurar las variables de entorno

Abre la pestaña **Environment** del servicio y pega este bloque, sustituyendo
los valores marcados:

```env
# --- Base de datos ---
MYSQL_ROOT_PASSWORD=una-clave-larga-y-aleatoria
MYSQL_DATABASE=hyrox_db
MYSQL_USER=hyrox_user
MYSQL_PASSWORD=otra-clave-larga-y-aleatoria

# --- Sesiones ---
JWT_SECRET=pega-aqui-el-secreto-del-paso-1
JWT_EXPIRES_IN=24h

# --- Dominio ---
CORS_ORIGIN=https://evento.tudominio.com
TRUST_PROXY=2

# --- Administrador inicial ---
SEED_ADMIN_CEDULA=0000000000
SEED_ADMIN_PASSWORD=UnaClaveSegura123!
SEED_DEMO=false

# --- Puerto publicado ---
FRONTEND_PORT=80
```

Detalles que importan:

- **`CORS_ORIGIN`** debe ser el dominio exacto con `https://` y **sin barra
  final**. Si no coincide, el navegador rechazará las peticiones y el login
  fallará sin mensaje claro.
- **`TRUST_PROXY=2`** cuenta los dos proxies que hay delante del backend (el
  nginx del frontend y el de Dokploy). Sin esto, el limitador de peticiones
  vería a todos los visitantes como una sola IP y bloquearía el acceso.
- **`SEED_ADMIN_PASSWORD`** solo se usa la primera vez, con la base de datos
  vacía. En el primer ingreso el sistema obliga a cambiarla.
- **`SEED_DEMO=false`** en producción. Ponlo en `true` solo si quieres datos
  de ejemplo para una demostración.
- **`FRONTEND_PORT=80`**: déjalo así salvo que ese puerto ya esté ocupado en el
  servidor.

Guarda los cambios.

---

## Paso 5 · Asignar el dominio

1. Pestaña **Domains → Add Domain**.
2. Rellena:
   - **Host**: `evento.tudominio.com`
   - **Service Name**: `frontend`  ← el servicio del compose, no otro
   - **Container Port**: `80`
   - **HTTPS**: activado
   - **Certificate Provider**: `Let's Encrypt`
3. Guarda.

> El certificado solo se emite si el DNS ya resuelve a la IP del servidor.
> Compruébalo antes con `nslookup evento.tudominio.com`.

---

## Paso 6 · Desplegar

1. Pulsa **Deploy**.
2. Sigue la salida en **Logs**. El primer despliegue tarda varios minutos
   porque compila las dos imágenes.

Sabrás que fue bien cuando en los logs del backend aparezca:

```
[db] esquema listo en mysql:3306/hyrox_db
Database connected successfully
API escuchando en el puerto 3001 (production)
```

Y, si la base de datos estaba vacía, el recuadro con las credenciales:

```
┌─────────────────────────────────────────────────┐
│  Administrador inicial creado                   │
│  Cedula:     0000000000                         │
│  Contrasena: UnaClaveSegura123!                 │
│  Se pedira cambiarla en el primer ingreso.      │
└─────────────────────────────────────────────────┘
```

---

## Paso 7 · Comprobar que todo funciona

Abre tu dominio y verifica en este orden:

1. **`https://evento.tudominio.com/api/health`** devuelve
   `{"status":"ok","database":"ok"}`.
   Si no, el backend no llega a MySQL: revisa `MYSQL_PASSWORD`.

2. **`https://evento.tudominio.com/leaderboard`** carga sin pedir sesión.
   Es la pantalla que se proyecta en el evento.

3. **`https://evento.tudominio.com/login`** con la cédula y la contraseña
   del administrador. Te pedirá una contraseña nueva: defínela y guárdala.

4. **La clasificación en vivo.** Abre `/leaderboard/<id>` en una pestaña y, en
   otra, registra un resultado como juez. La tabla debe reordenarse sola, sin
   recargar. Si no ocurre, el WebSocket no está pasando: mira más abajo.

---

## Puesta en marcha del evento

Con la sesión de administrador:

1. **Competencias → Nueva competencia**: nombre y wods (ejercicio, tipo de medición y
   puntaje máximo). El orden de la lista es el orden del evento.
2. **Jueces → Nuevo juez**: se genera una contraseña temporal. **Anótala: solo
   se muestra una vez.** El juez deberá cambiarla al entrar.
3. **Atletas → Nuevo atleta**: entran con su cédula y su fecha de nacimiento.
4. **Asignaciones**: elige la competencia, marca jueces y atletas, y pulsa *Asignar*.
   Un juez solo puede medir en las competencias que tenga asignados.
5. **Clasificación**: deja `/leaderboard/<id>` abierto en la pantalla del
   evento. El botón de pantalla completa oculta la cabecera.

---

## Mantenimiento

### Actualizar la aplicación

Sube los cambios a la rama configurada y pulsa **Deploy**. La base de datos no
se toca: el volumen `mysql_data` persiste entre despliegues.

### Copia de seguridad de la base de datos

Desde el servidor:

```bash
# Exportar
docker exec <contenedor-mysql> mysqldump -u root -p<MYSQL_ROOT_PASSWORD> hyrox_db > respaldo.sql

# Restaurar
cat respaldo.sql | docker exec -i <contenedor-mysql> mysql -u root -p<MYSQL_ROOT_PASSWORD> hyrox_db
```

Obtén el nombre del contenedor con `docker ps | grep mysql`.

Hazla **antes de cada evento** y **al terminar**.

### Ver logs

En Dokploy, pestaña **Logs**, seleccionando el servicio. O por terminal:

```bash
docker logs -f <contenedor-backend>
```

---

## Problemas frecuentes

### El login dice "Sin conexión con el servidor"

`CORS_ORIGIN` no coincide con el dominio real. Debe llevar `https://` y no
terminar en barra. Corrígelo y vuelve a desplegar.

### La clasificación no se actualiza sola

El WebSocket no está llegando. Comprueba:

- En **Domains**, que el servicio apuntado es `frontend` y el puerto `80`.
- En la consola del navegador (F12), si hay errores en `/socket.io/`.
- Que Dokploy no tenga activo un WAF o caché delante que corte las conexiones
  largas.

Mientras tanto la aplicación sigue funcionando: los datos se cargan por HTTP al
entrar, solo se pierde la actualización automática.

### El backend reinicia en bucle

Mira sus logs:

- `ECONNREFUSED` → MySQL aún no está listo. El compose ya espera a su
  *healthcheck*; si persiste, el servidor puede ir corto de memoria.
- `ER_ACCESS_DENIED_ERROR` → `MYSQL_PASSWORD` no coincide con la que se usó al
  crear el volumen. **Cambiar la contraseña no actualiza una base de datos ya
  creada**: o restauras la contraseña original, o borras el volumen
  `mysql_data` (se pierden los datos).
- `JWT_SECRET: debe tener al menos 32 caracteres` → falta o es demasiado corto.

### Olvidé la contraseña del administrador

Ver *Anexo A → Restablecer la contraseña de un administrador*.

### Los certificados HTTPS no se emiten

El DNS todavía no resuelve a la IP del servidor, o los puertos 80 y 443 están
ocupados o cerrados en el firewall. Verifica con `nslookup` y espera a que
propague antes de reintentar.

---

## Anexo A · Credenciales de cada tipo de usuario

Hay tres formas de entrar y una cuarta que no necesita cuenta.

| Tipo              | Usuario | Contraseña             | Pestaña en el login | Va a               |
| ----------------- | ------- | ---------------------- | ------------------- | ------------------ |
| **Administrador** | cédula  | contraseña             | Admin / Juez        | `/admin`           |
| **Juez**          | cédula  | contraseña             | Admin / Juez        | `/juez`            |
| **Atleta**        | cédula  | **fecha de nacimiento** | Atleta              | `/participante`    |
| **Público**       | —       | —                      | —                   | `/leaderboard`     |

### Administrador

Se crea solo, la primera vez que arranca el backend con la base de datos
vacía. Sus datos salen de estas dos variables:

```env
SEED_ADMIN_CEDULA=0000000000
SEED_ADMIN_PASSWORD=CambiaEstaClave123!
```

En el primer ingreso **el sistema obliga a cambiar esa contraseña** y no deja
navegar a ninguna otra pantalla hasta hacerlo. La nueva debe tener 8 caracteres
o más, una mayúscula, una minúscula, un número y un símbolo.

Las credenciales aparecen también en los logs del backend al arrancar:

```
┌─────────────────────────────────────────────────┐
│  Administrador inicial creado                   │
│  Cedula:     0000000000                         │
│  Contrasena: CambiaEstaClave123!                │
│  Se pedira cambiarla en el primer ingreso.      │
└─────────────────────────────────────────────────┘
```

> Solo se crea si **no existe ningún usuario**. Si ya hay uno, cambiar
> `SEED_ADMIN_PASSWORD` y volver a desplegar no tiene ningún efecto.

### Jueces

No se configuran por variables: los crea el administrador desde
**Jueces → Nuevo juez**. Al guardar, la aplicación genera una contraseña
temporal aleatoria y la muestra en pantalla.

⚠️ **Se muestra una sola vez.** Cópiala en ese momento y entrégasela al juez;
él definirá la suya en su primer ingreso. Si se pierde, hay que borrar el juez
y volver a crearlo (se pierden también sus asignaciones).

### Atletas

Los crea el administrador en **Atletas → Nuevo atleta**. No tienen contraseña:
entran con su **cédula** y su **fecha de nacimiento**, así que ese dato debe
estar bien introducido o no podrán acceder.

### Público

La clasificación es abierta: `https://tu-dominio.com/leaderboard` no pide nada.
Es la dirección que se deja fija en la pantalla del evento.

### Datos de demostración (`SEED_DEMO=true`)

Solo si activas esa variable **y la base de datos está vacía**, se cargan estos
datos de prueba. La contraseña del juez de demostración es la misma que
`SEED_ADMIN_PASSWORD`.

| Tipo   | Nombre           | Cédula     | Contraseña / fecha       |
| ------ | ---------------- | ---------- | ------------------------ |
| Juez   | Carlos Garcia    | `12345678` | la de `SEED_ADMIN_PASSWORD` |
| Atleta | Maria Lopez      | `87654321` | `1990-05-15`             |
| Atleta | Juan Perez       | `11223344` | `1985-08-20`             |
| Atleta | Ana Rodriguez    | `55667788` | `1992-12-10`             |
| Atleta | Diego Martinez   | `99887766` | `1994-03-02`             |

Incluye además una competencia ("Competencia 1 - Funcional") con tres wods y los cuatro
atletas ya asignados, listo para probar la clasificación en vivo.

**Deja `SEED_DEMO=false` en producción.**

### Restablecer la contraseña de un administrador

```bash
# 1. Generar el hash (en tu equipo, dentro de la carpeta backend)
node -e "require('bcrypt').hash('NuevaClave123!', 12).then(console.log)"

# 2. Aplicarlo (password_cambiado=0 fuerza a definir otra al entrar)
docker compose exec mysql mysql -u root -p<MYSQL_ROOT_PASSWORD> hyrox_db \
  -e "UPDATE usuarios SET password='<hash>', password_cambiado=0 WHERE cedula='0000000000';"
```

---

## Anexo B · Levantarlo con Docker Compose (sin Dokploy)

Sirve para cualquier servidor con Docker, y también para probarlo en tu equipo
antes de desplegar. Es el mismo `docker-compose.yml` que usa Dokploy.

### Requisitos

Docker Engine 20.10 o superior con el plugin Compose v2. Compruébalo:

```bash
docker --version
docker compose version
```

> Es `docker compose` (con espacio), no el antiguo `docker-compose`.

### Paso 1 · Obtener el proyecto

```bash
git clone <url-del-repositorio>
cd proyecto-evento
```

### Paso 2 · Crear el archivo .env

```bash
cp .env.example .env
```

Genera el secreto de sesión:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Y edita `.env`:

```env
MYSQL_ROOT_PASSWORD=una-clave-larga-y-aleatoria
MYSQL_DATABASE=hyrox_db
MYSQL_USER=hyrox_user
MYSQL_PASSWORD=otra-clave-larga-y-aleatoria

JWT_SECRET=pega-aqui-el-secreto-generado
JWT_EXPIRES_IN=24h

# En un servidor: https://tu-dominio.com
# En tu equipo:   http://localhost
CORS_ORIGIN=http://localhost

TRUST_PROXY=1

SEED_ADMIN_CEDULA=0000000000
SEED_ADMIN_PASSWORD=CambiaEstaClave123!
SEED_DEMO=false

FRONTEND_PORT=80
```

`TRUST_PROXY=1` aquí (solo nginx delante). En Dokploy son 2, porque añade su
propio proxy.

Si el puerto 80 está ocupado, pon `FRONTEND_PORT=8080` y ajusta `CORS_ORIGIN` a
`http://localhost:8080`.

### Paso 3 · Levantar

```bash
docker compose up -d --build
```

La primera vez tarda varios minutos porque compila las dos imágenes.

### Paso 4 · Comprobar

```bash
# Los tres servicios deben estar "running"; mysql y backend, además, "healthy"
docker compose ps

# Espera a ver "API escuchando en el puerto 3001" y las credenciales del admin
docker compose logs -f backend
```

Y desde el navegador o la terminal:

```bash
curl http://localhost/api/health
# {"status":"ok","database":"ok","timestamp":"..."}
```

Abre `http://localhost` y entra con la cédula y la contraseña del Anexo A.

### Comandos habituales

```bash
docker compose logs -f backend       # ver logs de un servicio
docker compose logs -f               # de todos
docker compose restart backend       # reiniciar solo la API
docker compose stop                  # parar sin borrar nada
docker compose up -d                 # volver a arrancar
docker compose up -d --build         # aplicar cambios de código
```

### Copias de seguridad

```bash
# Exportar
docker compose exec mysql mysqldump -u root -p<MYSQL_ROOT_PASSWORD> hyrox_db > respaldo.sql

# Restaurar
docker compose exec -T mysql mysql -u root -p<MYSQL_ROOT_PASSWORD> hyrox_db < respaldo.sql
```

### Borrar todo

```bash
docker compose down          # borra los contenedores, CONSERVA la base de datos
docker compose down -v       # borra también la base de datos
```

⚠️ `-v` elimina el volumen `mysql_data`: se pierden atletas, Competencias y resultados,
y en el siguiente arranque se creará todo de cero con un administrador nuevo.

### Problemas frecuentes en local

**`port is already allocated`** — el puerto 80 está ocupado (otro nginx, IIS,
Skype). Cambia `FRONTEND_PORT` en `.env` y vuelve a levantar.

**El backend reinicia con `ER_ACCESS_DENIED_ERROR`** — cambiaste
`MYSQL_PASSWORD` después de crear el volumen. MySQL solo aplica esa variable la
primera vez. O restauras la contraseña anterior, o ejecutas `docker compose
down -v` (pierdes los datos).

**No llega a `http://localhost`** — mira `docker compose ps`. Si `backend` está
`unhealthy`, el frontend no arranca porque lo espera; revisa sus logs.
