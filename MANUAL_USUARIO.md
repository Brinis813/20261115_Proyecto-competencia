# Manual de usuario

Guía práctica de Competition Manager para quienes organizan y arbitran la
evento. No hace falta saber nada de informática.

---

## Cómo se entra

En la pantalla de acceso hay dos pestañas:

- **Admin / Juez** — cédula y contraseña.
- **Atleta** — cédula y fecha de nacimiento.

Para ver la clasificación **no hace falta entrar**: el enlace *Ver clasificación
en vivo* lleva directo a la pantalla pública.

### Primer ingreso de administradores y jueces

La primera vez, el sistema pide cambiar la contraseña temporal. La nueva debe
tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un
carácter especial. Los requisitos se marcan en verde según se escriben.

---

# Administrador

Menú lateral: *Resumen*, *Competencias*, *Jueces*, *Participantes*, *Asignaciones*,
*Resultados* y *Clasificación*. En el móvil se abre con el botón ☰.

## Preparar un evento

El orden importa: primero se crean las categorías, luego la competencia, los jueces y
los atletas; finalmente se realizan las asignaciones.

### 1. Crear categorías de participación

**Categorías → Nueva categoría**.

Una categoría define el **tipo de participación** en el evento:

- **Individual** — un atleta por sí solo. Es la más común.
- **Escalado** — mismo evento pero con opciones facilitadas (pesos menores, distancias reducidas, etc.).
- **Duplas** — dos atletas comparten el mismo resultado.
- **Equipos** — grupos de atletas (3 o más).

Cada categoría también puede definir:

- **Género** — Masculino, Femenino o Mixto (por defecto requiere uno).
- **Elementos de medición** — si la competencia mide peso (barra, mancuerna...), distancia (carrera, remo...), repeticiones (flexiones, sentadillas...) o calorías (remo, bici...), defines aquí qué pesos, distancias, ejercicios o calorías están disponibles.

> Por ejemplo: categoría *RX Femenino* con pesos de barra (20kg, 15kg), distancias de remo (500m, 1000m), ejercicios (flexiones, sentadillas) y calorías (10 cal, 20 cal).

Los elementos de medición son informativos y aparecen en la clasificación para
que jueces y público entiendan qué se está midiendo.

### 2. Crear la competencia

**Competencias → Nueva competencia**.

- **Nombre y descripción**: lo que verán jueces y público.
- **Estado**:
  - *Borrador* — no aparece en la pantalla pública ni para los jueces.
  - *Activo* — en curso, visible para todos.
  - *Finalizado* — visible, pero marcado como terminado.
- **Wods**: uno por cada ejercicio que se mide por separado.
  - **Ejercicio**: el nombre que verá el juez, por ejemplo *500m Row*.
  - **Medición**:
    - *Tiempo* — gana el menor.
    - *Repeticiones*, *Peso*, *Intervalos* — gana el mayor.
  - **Puntaje máximo**: puntos del primer puesto. Cada posición siguiente resta
    uno. Con 100, el 1.º saca 100, el 2.º 99, y así.
  - **Duración estimada**: solo informativa, para organizar los tiempos.

Las flechas ↑ ↓ reordenan los WODs. El orden de la lista es el orden de la
evento.

> Puedes editar una competencia después, pero **no se puede borrar un WOD que ya
> tenga mediciones**. Antes hay que resetearlas desde *Resultados*.

### 3. Dar de alta a los jueces

**Jueces → Nuevo juez**. Al guardar aparece una **contraseña temporal**.

⚠️ **Anótala o cópiala en ese momento: no se vuelve a mostrar.** Entrégasela al
juez; él definirá la suya al entrar.

Si se pierde, borra el juez y créalo otra vez.

### 4. Inscribir a los atletas

**Participantes → Nuevo atleta**. La **fecha de nacimiento es su contraseña**,
así que debe estar bien puesta.

La *categoría* (RX Masculino, Scaled…) es opcional y aparece en la
clasificación.

El buscador filtra por nombre, cédula, box o categoría.

### 5. Asignar jueces y atletas

**Asignaciones → elige la competencia**. Marca los jueces y los atletas y pulsa
*Asignar*.

Se crea un vínculo por cada combinación: 2 jueces × 10 atletas = 20 vínculos.
Cada juez podrá medir a esos atletas.

Un atleta **no aparece en la clasificación hasta que está asignado**. Puedes
asignar más gente durante el evento: la pantalla se actualiza sola.

---

## Durante el evento

### Ver la clasificación

**Clasificación → elige la competencia**. Se actualiza sola cada vez que un juez guarda
una medición: no hay que recargar.

El botón de pantalla completa (esquina superior derecha) oculta la cabecera,
ideal para proyectar.

- El panel izquierdo es la clasificación general.
- El derecho muestra un WOD cada vez, rotando automáticamente. Puedes
  pausar la rotación o tocar los puntitos para ir a uno concreto.
- Las flechas verdes y rojas indican quién subió o bajó desde la última
  actualización.

Para dejarla fija en una pantalla, copia la dirección (`.../leaderboard/1`) y
ábrela directamente en ese equipo.

### Corregir una medición

**Resultados → elige la competencia → despliega el WOD → botón ↺**.

Se borra esa medición y el juez puede volver a tomarla. La clasificación se
recalcula al instante.

Es la única forma de arreglar un error: los jueces no pueden sobrescribir un
resultado ya guardado.

---

# Juez

## Registrar una medición

1. **Elige la competencia** entre los que tienes asignados.
2. **Elige el WOD**.
3. **Introduce la cédula del atleta** y pulsa *Buscar*.

El sistema comprueba dos cosas antes de dejarte continuar:

- Que el atleta **no tenga ya una medición** en ese WOD.
- Que **otro juez no lo esté midiendo** en ese momento.

Si alguna falla, te lo dice y no deja seguir. Para corregir una medición ya
guardada, avisa al administrador.

4. **Cronometra**: *Iniciar* y *Detener*. La pantalla no se apaga mientras
   corre. El botón ↺ pone el cronómetro a cero.
5. **Anota el resultado**. En wods de tiempo aparece el enlace *Usar
   00:00.00 como resultado*, que copia el cronómetro al campo y evita errores
   de transcripción.
   - Tiempo: `MM:SS` o `MM:SS.CS` (por ejemplo `03:45` o `03:45.20`).
     Para más de una hora, minutos por encima de 60: `75:30`.
   - Repeticiones, peso e intervalos: solo el número, sin unidad.
6. **Guardar resultado**. El teléfono vibra al confirmar y vuelve a la búsqueda,
   listo para el siguiente atleta.

## Abandono (DNF)

Si el atleta se retira por lesión o salud, pulsa **Registrar abandono**. Queda
último en ese WOD con 0 puntos. Pide confirmación porque solo un
administrador puede deshacerlo.

## Sin conexión

Si se cae la red, aparece un aviso rojo abajo. **Puedes seguir midiendo con
normalidad**: los resultados se guardan en el teléfono y se envían solos al
recuperar la señal.

El aviso amarillo indica cuántos quedan por enviar; *Enviar ahora* fuerza el
intento.

⚠️ **No cierres la sesión ni borres los datos del navegador con resultados
pendientes**: se perderían.

---

# Atleta

Al entrar ves:

- **Tu posición en cada competencia**, con los puntos acumulados y cuántos compiten.
- **El detalle de cada wod**: tu marca y los puntos que te dio.

Toca cualquier tarjeta para ver la clasificación completa de esa competencia.

Los resultados aparecen conforme los jueces los registran.

---

# Preguntas frecuentes

**Un atleta no aparece en la clasificación.**
No está asignado a esa competencia. Ve a *Asignaciones*, elige la competencia y añádelo.

**Un juez no ve ningún Competencia.**
No tiene asignaciones. Un juez solo ve las competencias en los que se le asignó al
menos un atleta.

**Dos atletas tienen los mismos puntos.**
Es correcto: los empates comparten posición y puntos. Si dos empatan en 1.º, el
siguiente es 3.º. Cómo se resuelve el empate lo elige el organizador:
- En cada competencia (*Competencias → editar → Criterio de desempate*): *Sin desempate*
comparte siempre; *Marca de desempate del juez* usa la marca que el juez
registró junto al resultado (menor es mejor); *WOD designado* usa el
ejercicio marcado como desempate.
- En el acumulado del evento (*Resumen → Criterio de ganador*): *Sin
desempate* comparte; *Mejores puestos* cuenta 1.os lugares en las competencias; *Competencia
designado* usa la competencia marcado; *Última competencia* usa la posición en la última etapa.
La pantalla de clasificación muestra qué criterio se aplicó y marca "Empate"
donde el puesto es compartido.

**La clasificación no se mueve.**
Mira la etiqueta de la esquina superior derecha: si dice *Sin tiempo real* o
*Reconectando*, hay un problema de red. Los datos siguen siendo correctos al
recargar; solo se pierde la actualización automática.

**Me equivoqué al anotar un resultado.**
El administrador lo resetea desde *Resultados* y el juez lo vuelve a tomar.

**Olvidé la contraseña de un juez.**
Bórralo y créalo de nuevo: se generará una contraseña temporal nueva. Ojo: al
borrarlo se pierden sus asignaciones y hay que rehacerlas.
