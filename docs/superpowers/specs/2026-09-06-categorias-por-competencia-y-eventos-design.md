# Categorías por Competencia y eventos con alta propia

Fecha: 2026-09-06

Dos trabajos encadenados sobre Competition Manager:

1. **Categorías por Competencia** — una competencia apunta a varias categorías reales, y cada
   movimiento puede llevar repeticiones y peso distintos según la categoría.
2. **Eventos** — alta de usuario con verificación por correo, evento
   de ejemplo creada automáticamente y un panel que las lista por fecha.

---

## Parte 1 — Categorías por Competencia

### El problema

Hoy conviven dos vocabularios de categoría que no se hablan:

| Concepto | Dónde vive | Quién lo usa |
|---|---|---|
| `categorias` | Tabla real, con género, tipo de participación y elementos | Se asigna al atleta (`participantes.categoria_id`, y el nombre plano en `participantes.categoria`) |
| `competencias.divisiones` | `JSON` con texto libre escrito a mano | El scorecard (`MovimientoEsquema.reps` es un `Record<división, reps>`) y el agrupado de la clasificación |

En la base actual `competencias.divisiones` vale `["Rx","Scaled"]` mientras los atletas
son `"RX Femenino"` y `"RX Masculino"`. Como la clasificación agrupa por el
texto, salen categorías vacías: el filtro «RX» del leaderboard no encuentra a
nadie. Además solo hay reps por división; **peso por división no existe**.

### Diseño

**Modelo.** Tabla intermedia `competencia_categorias (competencia_id, categoria_id)`, clave
primaria compuesta y `ON DELETE CASCADE` por los dos lados. Es la fuente de
verdad de qué categorías compiten en una competencia.

`competencias.divisiones` **no se elimina**: pasa a ser una copia derivada que escribe
el servicio a partir de las categorías enlazadas, usando la misma etiqueta que
guarda `participantes.categoria` (`nombre + ' ' + genero`, p. ej. `RX Femenino`).
Así el agrupado de la clasificación, el de resultados y las claves del scorecard
siguen funcionando sin tocarlos, y de paso empiezan a coincidir con los atletas.
Los Competencias antiguos que solo tengan texto libre se siguen leyendo igual.

**Parámetros por categoría.** `MovimientoEsquema` gana dos campos opcionales:

```ts
export interface MovimientoEsquema {
  nombre: string;
  reps: Record<string, number>;   // ya existía
  peso?: Record<string, number>;  // nuevo: carga por categoría
  unidad_peso?: 'kg' | 'lb';      // nuevo: por movimiento, no por categoría
}
```

Van dentro del `JSON` de `wods.esquema`, así que no hacen falta migraciones
de columnas y los esquemas antiguos siguen siendo válidos (`peso` ausente = sin
carga prescrita).

**Editor de Competencia.** El campo de texto «Divisiones / categorías» se sustituye por
una selección de las categorías existentes. La rejilla de movimientos pasa a
tener, por cada categoría marcada, una celda de reps y otra de peso.

**Pantalla del juez.** Al identificar al atleta ya se conoce su categoría, así
que la tarjeta de cada movimiento muestra las reps y el peso prescritos para
*esa* categoría, en vez de la lista de todas.

**Compatibilidad.** Al guardar, si la competencia tiene categorías enlazadas se
reescriben las claves del esquema con sus etiquetas; las claves de divisiones
que ya no existan se descartan.

---

## Parte 2 — Eventos, alta y panel

### Modelo

```
eventos        id, nombre, descripcion, fecha_inicio, fecha_fin,
                    sede, propietario_id, es_demo, created_at
evento_usuarios evento_id, usuario_id, rol ('propietario'|'admin'|'juez')
```

`evento_id` se añade a `competencias`, `categorias` y `participantes`. Wods,
asignaciones, resultados y splits cuelgan de esos, así que no lo necesitan.

**Estado.** No se guarda: se deriva de las fechas contra el día de hoy
(`en_curso`, `proxima`, `pasada`). Un estado guardado se queda obsoleto solo.

**Relleno de lo que ya existe.** La migración crea un evento
«Evento inicial», la asigna al admin sembrado y le cuelga todas las filas
existentes. Nadie pierde datos.

### Alta y verificación

- `POST /api/auth/registro` — nombre, apellidos, cédula, correo y contraseña.
  Crea el usuario con rol `admin` y `email_verificado = false`. Sin evento
  todavía: un usuario sin verificar no puede entrar.
- Token de verificación de un solo uso, con caducidad de 24 h, guardado
  hasheado (`sha256`) en `usuarios.verificacion_token`. Se envía en claro por
  correo; en la base solo queda el hash.
- `POST /api/auth/verificar` con el token — marca el correo como verificado y
  **creal evento de ejemplo** en la misma transacción: categorías RX/
  Scaled por género, una competencia de dos wods con reps y peso por categoría, seis
  atletas y un juez. El usuario queda como `propietario`.
- Correo por `nodemailer` con SMTP de variables de entorno. Si no hay SMTP
  configurado, el enlace se escribe en el log del backend: en desarrollo se
  puede completar el alta sin servidor de correo.

### Alcance del usuario

Un middleware resuelve el evento activa desde `evento_usuarios` y
todas las consultas se filtran por ella. Un usuario nuevo solo ve y administra
la suya. El admin sembrado (superadmin) las ve todas.

### Panel

Ruta `/eventos`, primera pantalla tras entrar. Tres bloques en este orden:

1. **En curso** — `fecha_inicio <= hoy <= fecha_fin`, la más antigua primero.
2. **Próximas** — `fecha_inicio > hoy`, la más cercana primero.
3. **Pasadas** — `fecha_fin < hoy`, la más reciente primero, en una sección
   aparte y plegada.

Cada tarjeta lleva nombre, fechas, sede y el recuento de Competencias y atletas.

---

## Qué no entra

- Cobros, planes ni límites de uso.
- Invitar jueces por correo: los jueces se siguen creando desdel evento.
- Cambiar de evento activa desde la interfaz: cada usuario tiene una.
  El modelo (tabla de miembros) ya lo admite cuando haga falta.

---

## Parte 3 — Boxes y administradores por box

Añadido posterior. El alcance deja de ser «un evento por usuario» y pasa
a ser «un box con varias eventos».

### Quién ve qué

| Quién | Alcance |
|---|---|
| Superadmin (el admin sembrado) | Todas los eventos de todos los boxes |
| Administrador de box | Todas los eventos de **su** box |
| Juez | Las eventos en las que se le asignó |

### Modelo

```
boxes    id, nombre (unico), ciudad, created_at
```

`box_id` se añade a `usuarios` y a `eventos`. Se rellena a partir del
texto libre que ya había (`usuarios.box` y `eventos.sede`), que se
conservan como etiqueta editable.

El superadmin lleva `box_id` NULL: no pertenece a ninguno porque los ve todos.

### Alcance y evento activa

Un administrador de box puede tener varias eventos, así que hace falta
saber en cuál está trabajando. El middleware resuelve dos cosas:

- `eventosPermitidas` — el conjunto que puede tocar (`null` = todas).
- `eventoId` — la activa. Sale de la cabecera `X-Evento-Id`, que
  manda el cliente, **validada siempre contra el conjunto permitido**: la
  cabecera es una preferencia, nunca un permiso.

Si no hay cabecera y solo hay un evento, esa es la activa. Las listas
filtran por la activa; si no hay ninguna, por el conjunto permitido.

La evento activa se elige en el panel y se guarda en el navegador. Va en
una cabecera y no en la URL para no rehacer todas las rutas de administración;
el servidor no se fía de ella en ningún caso.

### Alta de administradores

- `POST /api/users/admins` — **solo superadmin**. Crea un administrador con su
  `box_id` y devuelve una contraseña temporal, igual que con los jueces.
- `POST /api/boxes` — solo superadmin.
- El alta pública sigue existiendo: quien se registra crea **su propio box** a
  partir del campo que ya rellenaba, y queda como administrador de ese box.

### Qué no entra

- Varios boxes por administrador: el modelo lo admitiría con una tabla de
  miembros, pero hoy no hace falta y complica la pantalla.
- Traspasar un evento de un box a otro.
