import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { crearCola } from '../cola'
import type { EstadoCola } from '../cola'

interface Cambio {
  readonly [campo: string]: unknown
}

const enviosDe = () => {
  const envios: { clave: string; cambios: Cambio }[] = []
  return { envios, enviar: async (clave: string, cambios: Cambio) => (envios.push({ clave, cambios }), {}) }
}

describe('cola de autoguardado', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('no manda nada mientras la mano sigue tecleando', () => {
    const { envios, enviar } = enviosDe()
    const cola = crearCola<Cambio>({ enviar, retardoMs: 700 })

    cola.encolar('p1', { nota: 'a' })
    vi.advanceTimersByTime(600)
    cola.encolar('p1', { nota: 'ab' })
    vi.advanceTimersByTime(600)

    expect(envios).toHaveLength(0)
  })

  it('funde los cambios de una misma clave en un solo envio', () => {
    const { envios, enviar } = enviosDe()
    const cola = crearCola<Cambio>({ enviar, retardoMs: 700 })

    cola.encolar('p1', { nota: 'a' })
    cola.encolar('p1', { valorUsd: 10 })
    cola.encolar('p1', { nota: 'ab' })
    vi.advanceTimersByTime(700)

    expect(envios).toEqual([{ clave: 'p1', cambios: { nota: 'ab', valorUsd: 10 } }])
  })

  it('cada clave viaja por su cuenta', () => {
    const { envios, enviar } = enviosDe()
    const cola = crearCola<Cambio>({ enviar, retardoMs: 700 })

    cola.encolar('p1', { nota: 'a' })
    cola.encolar('p2', { nota: 'b' })
    vi.advanceTimersByTime(700)

    expect(envios.map((envio) => envio.clave).sort()).toEqual(['p1', 'p2'])
  })

  it('no deja dos envios de la misma clave en vuelo a la vez', async () => {
    const enCurso: ((resultado: { error?: string }) => void)[] = []
    const envios: Cambio[] = []
    const cola = crearCola<Cambio>({
      retardoMs: 700,
      enviar: async (_clave, cambios) => {
        envios.push(cambios)
        return new Promise((resolver) => enCurso.push(resolver))
      },
    })

    cola.encolar('p1', { nota: 'a' })
    vi.advanceTimersByTime(700)
    expect(envios).toHaveLength(1)

    // Llega otro cambio con el primero todavia sin responder.
    cola.encolar('p1', { nota: 'ab' })
    vi.advanceTimersByTime(2100)
    expect(envios).toHaveLength(1)

    enCurso[0]?.({})
    await vi.advanceTimersByTimeAsync(700)
    expect(envios).toEqual([{ nota: 'a' }, { nota: 'ab' }])
  })

  it('vaciar manda lo pendiente sin esperar el retardo', () => {
    const { envios, enviar } = enviosDe()
    const cola = crearCola<Cambio>({ enviar, retardoMs: 700 })

    cola.encolar('p1', { nota: 'a' })
    cola.vaciar()

    expect(envios).toHaveLength(1)
  })

  it('vaciar no deja colgado lo que espera detras de un envio en vuelo', async () => {
    // El caso real: el asesor teclea, se dispara un guardado, teclea otra vez y
    // cierra la pestaña. `vaciar` re-armaba un temporizador que en ese momento
    // ya no llega a dispararse nunca, y esa correccion se perdia en silencio.
    const enCurso: ((resultado: { error?: string }) => void)[] = []
    const envios: Cambio[] = []
    const cola = crearCola<Cambio>({
      retardoMs: 700,
      enviar: async (_clave, cambios) => {
        envios.push(cambios)
        return new Promise((resolver) => enCurso.push(resolver))
      },
    })

    cola.encolar('p1', { nota: 'a' })
    vi.advanceTimersByTime(700)
    cola.encolar('p1', { nota: 'ab' })
    cola.vaciar()

    // Sin dejar pasar el retardo: alcanza con que vuelva el primer envio.
    enCurso[0]?.({})
    await vi.advanceTimersByTimeAsync(0)

    expect(envios).toEqual([{ nota: 'a' }, { nota: 'ab' }])
  })

  it('detener descarta lo que no salio', () => {
    const { envios, enviar } = enviosDe()
    const cola = crearCola<Cambio>({ enviar, retardoMs: 700 })

    cola.encolar('p1', { nota: 'a' })
    cola.detener()
    vi.advanceTimersByTime(5000)

    expect(envios).toHaveLength(0)
  })

  it('avisa guardando mientras hay algo en camino y guardado al volver', async () => {
    const fases: EstadoCola[] = []
    const cola = crearCola<Cambio>({
      retardoMs: 700,
      enviar: async () => ({}),
      alCambiar: (estado) => fases.push(estado),
    })

    cola.encolar('p1', { nota: 'a' })
    expect(fases.at(-1)).toEqual({ fase: 'guardando', pendientes: 1, error: null })

    await vi.advanceTimersByTimeAsync(700)
    expect(fases.at(-1)).toEqual({ fase: 'guardado', pendientes: 0, error: null })
  })

  it('deja el error a la vista en vez de tragarselo', async () => {
    const fases: EstadoCola[] = []
    const cola = crearCola<Cambio>({
      retardoMs: 700,
      enviar: async () => ({ error: 'RLS lo rechazo' }),
      alCambiar: (estado) => fases.push(estado),
    })

    cola.encolar('p1', { nota: 'a' })
    await vi.advanceTimersByTimeAsync(700)

    expect(fases.at(-1)).toEqual({ fase: 'error', pendientes: 0, error: 'RLS lo rechazo' })
  })

  it('un fallo de red no rompe la cola', async () => {
    const fases: EstadoCola[] = []
    const cola = crearCola<Cambio>({
      retardoMs: 700,
      enviar: async () => {
        throw new Error('Failed to fetch')
      },
      alCambiar: (estado) => fases.push(estado),
    })

    cola.encolar('p1', { nota: 'a' })
    await vi.advanceTimersByTimeAsync(700)

    expect(fases.at(-1)).toEqual({ fase: 'error', pendientes: 0, error: 'Failed to fetch' })
  })
})
