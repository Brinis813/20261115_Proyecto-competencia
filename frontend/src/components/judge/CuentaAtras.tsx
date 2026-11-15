import { useEffect, useRef, useState } from 'react';
import { useBeep } from '../../hooks/useBeep';

/**
 * Cuenta atras 3 - 2 - 1 - GO a pantalla completa antes de arrancar el reloj.
 *
 * Sirve para que atleta y juez arranquen sincronizados: en una salida a viva
 * voz el cronometro siempre sale un poco tarde. Al terminar llama a
 * `onCompletar`, que es quien pone en marcha el cronometro de verdad.
 *
 * El overlay tapa la pantalla a proposito: durante la salida no debe poder
 * pulsarse ningun otro boton.
 */
export default function CuentaAtras({
  activo,
  onCompletar,
  onCancelar,
}: {
  activo: boolean;
  onCompletar: () => void;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState(3);
  const { beepCuenta, beepTransicion } = useBeep();

  // Los callbacks van por ref para que el temporizador no se reinicie si el
  // padre vuelve a renderizar con funciones nuevas a mitad de la cuenta.
  const completarRef = useRef(onCompletar);
  completarRef.current = onCompletar;

  useEffect(() => {
    if (!activo) return;

    setValor(3);
    beepCuenta();

    let restante = 3;
    const intervalo = setInterval(() => {
      restante -= 1;
      setValor(restante);

      if (restante > 0) {
        beepCuenta();
      } else if (restante === 0) {
        beepTransicion();
      } else {
        clearInterval(intervalo);
        completarRef.current();
      }
    }, 800);

    return () => clearInterval(intervalo);
  }, [activo, beepCuenta, beepTransicion]);

  if (!activo) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-hyrox-void/95 backdrop-blur-sm animate-fade-in"
      role="alertdialog"
      aria-label="Cuenta atras para la salida"
    >
      <p
        key={valor}
        className={`timer-display animate-scale-in leading-none text-[8rem] sm:text-[12rem] ${
          valor === 0 ? 'text-hyrox-accent' : ''
        }`}
        aria-live="assertive"
      >
        {valor === 0 ? 'GO' : valor}
      </p>

      {/* Una salida nula tiene que poder abortarse antes de que corra el reloj. */}
      <button
        type="button"
        onClick={onCancelar}
        className="absolute bottom-12 text-sm font-semibold text-hyrox-mist hover:text-hyrox-paper transition-colors cursor-pointer"
      >
        Cancelar salida
      </button>
    </div>
  );
}
