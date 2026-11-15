export { Usuario } from './Usuario';
export { Categoria } from './Categoria';
export { Participante } from './Participante';
export { Competencia, TIPOS_PARTICIPACION, type TipoParticipacion, type CompetenciaTieBreakPolicy, COMPETENCIA_TIEBREAK_POLICIES } from './Competencia';
export { Wod } from './Wod';
export { Asignacion } from './Asignacion';
export { Resultado } from './Resultado';
export { default as ResultadoSplit } from './ResultadoSplit';
export { CompetenciaCategoria } from './CompetenciaCategoria';
export { AuditLog } from './AuditLog';
export { ResultHistory } from './ResultHistory';
export { Evento, estadoDeEvento, type EstadoEvento, type ScoringType, SCORING_TYPES, type EventoTieBreakPolicy, EVENTO_TIEBREAK_POLICIES } from './Evento';
export { EventoUsuario, type RolEnEvento } from './EventoUsuario';
export { Box } from './Box';
export { Arranque } from './Arranque';
export { Heat } from './Heat';
export { HeatParticipante } from './HeatParticipante';
export { HeatHorario } from './HeatHorario';

import { Categoria } from './Categoria';
import { Participante } from './Participante';
import { Competencia } from './Competencia';
import { CompetenciaCategoria } from './CompetenciaCategoria';
import { Evento } from './Evento';
import { EventoUsuario } from './EventoUsuario';
import { Usuario } from './Usuario';
import { Box } from './Box';

Categoria.hasMany(Participante, { foreignKey: 'categoria_id', as: 'participantes' });
Participante.belongsTo(Categoria, { foreignKey: 'categoria_id', as: 'categoriaDetalle' });

// Que categorias compiten en cada competencia.
Competencia.belongsToMany(Categoria, {
  through: CompetenciaCategoria,
  foreignKey: 'competencia_id',
  otherKey: 'categoria_id',
  as: 'categorias',
});
Categoria.belongsToMany(Competencia, {
  through: CompetenciaCategoria,
  foreignKey: 'categoria_id',
  otherKey: 'competencia_id',
  as: 'competencias',
});

// Todo lo de un evento cuelga de él.
Evento.hasMany(Competencia, { foreignKey: 'evento_id' });
Competencia.belongsTo(Evento, { foreignKey: 'evento_id', as: 'evento' });
Evento.hasMany(Categoria, { foreignKey: 'evento_id' });
Categoria.belongsTo(Evento, { foreignKey: 'evento_id', as: 'evento' });
Evento.hasMany(Participante, { foreignKey: 'evento_id' });
Participante.belongsTo(Evento, { foreignKey: 'evento_id', as: 'evento' });

Evento.belongsTo(Usuario, { foreignKey: 'propietario_id', as: 'propietario' });

// El box agrupa eventos y administradores.
Box.hasMany(Evento, { foreignKey: 'box_id', as: 'eventos' });
Evento.belongsTo(Box, { foreignKey: 'box_id', as: 'box' });
Box.hasMany(Usuario, { foreignKey: 'box_id', as: 'usuarios' });
Usuario.belongsTo(Box, { foreignKey: 'box_id', as: 'boxDetalle' });
Evento.belongsToMany(Usuario, {
  through: EventoUsuario,
  foreignKey: 'evento_id',
  otherKey: 'usuario_id',
  as: 'miembros',
});
Usuario.belongsToMany(Evento, {
  through: EventoUsuario,
  foreignKey: 'usuario_id',
  otherKey: 'evento_id',
  as: 'eventos',
});
