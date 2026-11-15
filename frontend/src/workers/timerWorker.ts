let interval: ReturnType<typeof setInterval> | null = null;
let startTime = 0;
let elapsed = 0;

self.onmessage = (e: MessageEvent) => {
  const { type } = e.data;

  switch (type) {
    case 'start':
      startTime = performance.now() - elapsed;
      interval = setInterval(() => {
        elapsed = performance.now() - startTime;
        self.postMessage({ type: 'tick', elapsed });
        // 100 ms bastan para pintar centesimas (10 renders/s en vez de 100);
        // el valor final exacto se recalcula en 'stop'.
      }, 100);
      break;

    case 'stop':
      if (interval) clearInterval(interval);
      // Valor en firme al milisegundo: no depende del ultimo tick.
      elapsed = performance.now() - startTime;
      self.postMessage({ type: 'stopped', elapsed });
      break;

    case 'reset':
      if (interval) clearInterval(interval);
      elapsed = 0;
      self.postMessage({ type: 'reset', elapsed: 0 });
      break;

    case 'lap':
      elapsed = performance.now() - startTime;
      self.postMessage({ type: 'lap', elapsed });
      break;
  }
};
