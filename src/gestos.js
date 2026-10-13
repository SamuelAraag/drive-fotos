const INICIO_DO_ARRASTE = 10;
const TEMPO_DO_DUPLO_TOQUE = 300;
const RAIO_DO_DUPLO_TOQUE = 30;
const JANELA_DA_VELOCIDADE = 100;
const BORDA_DO_SISTEMA = 20;

export function ligarGestos(alvo, acoes) {
  const dedos = new Map();
  let arraste = null;
  let pinca = null;
  let moveu = false;
  let ultimoToque = null;

  const entreOsDedos = () => {
    const [a, b] = [...dedos.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distancia: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  const novoArraste = (id, ponto, t) => ({ id, x0: ponto.x, y0: ponto.y, eixo: null, amostras: [{ ...ponto, t }] });

  function terminarArraste(cancelado) {
    const atual = arraste;
    arraste = null;
    if (!atual?.eixo) return;
    const ultima = atual.amostras.at(-1);
    const primeira = atual.amostras.find((amostra) => ultima.t - amostra.t <= JANELA_DA_VELOCIDADE) ?? ultima;
    const tempo = Math.max(1, ultima.t - primeira.t);
    acoes.arrasteTermina({
      eixo: atual.eixo,
      dx: ultima.x - atual.x0,
      dy: ultima.y - atual.y0,
      vx: (ultima.x - primeira.x) / tempo,
      vy: (ultima.y - primeira.y) / tempo,
      cancelado,
    });
  }

  alvo.addEventListener('pointerdown', (evento) => {
    if (evento.pointerType !== 'touch' || !acoes.podeComecar(evento)) return;
    if (evento.clientX < BORDA_DO_SISTEMA || evento.clientX > innerWidth - BORDA_DO_SISTEMA) return;
    const ponto = { x: evento.clientX, y: evento.clientY };
    dedos.set(evento.pointerId, ponto);
    try {
      alvo.setPointerCapture(evento.pointerId);
    } catch {
    }
    if (dedos.size === 1) {
      moveu = false;
      arraste = novoArraste(evento.pointerId, ponto, evento.timeStamp);
    } else if (dedos.size === 2) {
      terminarArraste(true);
      moveu = true;
      const centro = entreOsDedos();
      pinca = { distancia: Math.max(1, centro.distancia) };
      acoes.pincaComeca({ x: centro.x, y: centro.y });
    }
  });

  alvo.addEventListener('pointermove', (evento) => {
    const ponto = dedos.get(evento.pointerId);
    if (!ponto) return;
    ponto.x = evento.clientX;
    ponto.y = evento.clientY;
    if (pinca) {
      if (dedos.size < 2) return;
      const centro = entreOsDedos();
      acoes.pincaMove({ x: centro.x, y: centro.y, fator: centro.distancia / pinca.distancia });
      return;
    }
    if (!arraste || arraste.id !== evento.pointerId) return;
    arraste.amostras.push({ ...ponto, t: evento.timeStamp });
    if (arraste.amostras.length > 8) arraste.amostras.shift();
    if (!arraste.eixo) {
      const dx = ponto.x - arraste.x0;
      const dy = ponto.y - arraste.y0;
      if (Math.hypot(dx, dy) < INICIO_DO_ARRASTE) return;
      arraste.eixo = acoes.eixoLivre() ? 'livre' : Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      arraste.x0 = ponto.x;
      arraste.y0 = ponto.y;
      moveu = true;
      acoes.arrasteComeca(arraste.eixo);
    }
    acoes.arrasteMove({ eixo: arraste.eixo, dx: ponto.x - arraste.x0, dy: ponto.y - arraste.y0 });
  });

  function soltar(evento, cancelado) {
    const ponto = dedos.get(evento.pointerId);
    if (!ponto) return;
    dedos.delete(evento.pointerId);
    if (pinca) {
      if (dedos.size >= 2) return;
      pinca = null;
      acoes.pincaTermina();
      const [resto] = [...dedos];
      if (resto) arraste = novoArraste(resto[0], resto[1], evento.timeStamp);
      return;
    }
    if (!arraste || arraste.id !== evento.pointerId) return;
    if (arraste.eixo) {
      terminarArraste(cancelado);
      return;
    }
    arraste = null;
    if (cancelado || moveu) return;
    const perto = ultimoToque && Math.hypot(ponto.x - ultimoToque.x, ponto.y - ultimoToque.y) <= RAIO_DO_DUPLO_TOQUE;
    if (perto && evento.timeStamp - ultimoToque.t <= TEMPO_DO_DUPLO_TOQUE) {
      ultimoToque = null;
      acoes.duploToque(ponto);
      return;
    }
    ultimoToque = { ...ponto, t: evento.timeStamp };
    acoes.toque(ponto);
  }

  alvo.addEventListener('pointerup', (evento) => soltar(evento, false));
  alvo.addEventListener('pointercancel', (evento) => soltar(evento, true));
}
