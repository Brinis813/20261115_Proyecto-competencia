import { useState, useEffect } from 'react';
import api from '../api/client';
import { SplitRegistro } from '../types';

interface Props {
  resultadoId: number;
}

export default function LeaderboardSplits({ resultadoId }: Props) {
  const [splits, setSplits] = useState<SplitRegistro[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get<SplitRegistro[]>(`/results/${resultadoId}/splits`)
      .then(res => setSplits(res.data))
      .finally(() => setCargando(false));
  }, [resultadoId]);

  if (cargando) return <span>...</span>;

  return (
    <div className="text-xs space-y-1">
      {splits.map(s => (
        <div key={s.segmento_numero} className="flex justify-between">
          <span>{s.segmento_nombre}</span>
          <span className="font-mono">{(s.tiempo_acumulado_ms / 1000).toFixed(1)}s</span>
        </div>
      ))}
    </div>
  );
}
