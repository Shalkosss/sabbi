import { describe, expect, it } from 'vitest'

import {
  HITOS,
  PLAZO_HABILES,
  armarMes,
  diaEnLima,
  esHabil,
  feriado,
  habilesEntre,
  inicialesDe,
  mesCorrido,
  porDia,
  rutaDe,
  rutasDe,
  sumarHabiles,
  tonoDe,
} from '../agenda'
import type { FichaEnAgenda } from '../agenda'

const ficha = (parcial: Partial<FichaEnAgenda> = {}): FichaEnAgenda => ({
  fichaId: 'f1',
  cliente: 'Ana Tumi',
  asesor: 'Rodrigo',
  mio: true,
  subidaIso: '2026-03-02T15:00:00Z',
  hechos: [],
  ...parcial,
})

describe('el día limeño', () => {
  it('no se corre al día siguiente por la hora UTC', () => {
    // 2026-03-03T02:00Z son las 21:00 del 2 de marzo en Lima. La ficha se subió
    // el lunes por la noche y el plazo tiene que arrancar el lunes.
    expect(diaEnLima('2026-03-03T02:00:00Z')).toBe('2026-03-02')
  })
})

describe('días hábiles', () => {
  it('el fin de semana no cuenta', () => {
    expect(esHabil('2026-03-07')).toBe(false)
    expect(esHabil('2026-03-08')).toBe(false)
    expect(esHabil('2026-03-09')).toBe(true)
  })

  it('los feriados fijos del Perú tampoco', () => {
    expect(feriado('2026-07-28')).toBe('Fiestas Patrias')
    expect(esHabil('2026-07-28')).toBe(false)
  })

  it('Jueves y Viernes Santo se mueven con la Pascua', () => {
    // Pascua 2026: 5 de abril. 2027: 28 de marzo.
    expect(feriado('2026-04-02')).toBe('Jueves Santo')
    expect(feriado('2026-04-03')).toBe('Viernes Santo')
    expect(feriado('2027-03-25')).toBe('Jueves Santo')
    expect(feriado('2027-03-26')).toBe('Viernes Santo')
  })

  it('salta el fin de semana al sumar', () => {
    // Jueves 5 de marzo de 2026 + 4 hábiles = miércoles 11.
    expect(sumarHabiles('2026-03-05', PLAZO_HABILES)).toBe('2026-03-11')
  })

  it('una ficha subida el sábado empieza a contar el lunes', () => {
    expect(sumarHabiles('2026-03-07', 1)).toBe('2026-03-09')
    expect(sumarHabiles('2026-03-07', 4)).toBe('2026-03-12')
  })

  it('salta también el feriado', () => {
    // Del viernes 24 de julio de 2026: lunes 27 es hábil, martes 28 y
    // miércoles 29 son Fiestas Patrias.
    expect(sumarHabiles('2026-07-24', 1)).toBe('2026-07-27')
    expect(sumarHabiles('2026-07-24', 2)).toBe('2026-07-30')
  })

  it('cuenta con signo entre dos días', () => {
    expect(habilesEntre('2026-03-05', '2026-03-11')).toBe(4)
    expect(habilesEntre('2026-03-11', '2026-03-05')).toBe(-4)
    expect(habilesEntre('2026-03-05', '2026-03-05')).toBe(0)
    // Sábado y domingo no suman nada entre viernes y lunes.
    expect(habilesEntre('2026-03-06', '2026-03-09')).toBe(1)
  })
})

describe('la ruta de una ficha', () => {
  it('pone la entrega a cuatro días hábiles de la subida', () => {
    const ruta = rutaDe(ficha({ subidaIso: '2026-03-05T15:00:00Z' }), '2026-03-05')

    expect(ruta.inicio).toBe('2026-03-05')
    expect(ruta.hitos.map((hito) => hito.dia)).toEqual([
      '2026-03-05',
      '2026-03-06',
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
    ])
    expect(ruta.entrega).toBe('2026-03-11')
    expect(ruta.faltanParaEntrega).toBe(4)
  })

  it('el día cero está cumplido sin que nadie lo marque', () => {
    const ruta = rutaDe(ficha(), '2026-03-02')
    expect(ruta.hitos[0]?.estado).toBe('hecho')
    expect(ruta.hitos[1]?.estado).toBe('proximo')
  })

  it('lo que pasó de fecha y nadie marcó queda vencido', () => {
    const ruta = rutaDe(ficha({ subidaIso: '2026-03-02T15:00:00Z' }), '2026-03-05')

    expect(ruta.hitos[1]?.estado).toBe('vencido')
    expect(ruta.hitos[2]?.estado).toBe('vencido')
    expect(ruta.hitos[3]?.estado).toBe('hoy')
    expect(ruta.atrasados).toBe(2)
  })

  it('marcar un hito lo saca de los atrasados y mueve el avance', () => {
    const ruta = rutaDe(
      ficha({ subidaIso: '2026-03-02T15:00:00Z', hechos: ['portafolio', 'ppt'] }),
      '2026-03-05',
    )

    expect(ruta.atrasados).toBe(0)
    expect(ruta.avance).toBeCloseTo(3 / HITOS.length)
  })

  it('la certeza cae con la distancia y nunca se apaga del todo', () => {
    const ruta = rutaDe(ficha({ subidaIso: '2026-03-05T15:00:00Z' }), '2026-03-05')
    const certezas = ruta.hitos.map((hito) => hito.certeza)

    expect(certezas[0]).toBe(1)
    for (let i = 1; i < certezas.length; i += 1) {
      expect(certezas[i]).toBeLessThan(certezas[i - 1] ?? 1)
      expect(certezas[i]).toBeGreaterThan(0)
    }
  })

  it('lo cumplido se dibuja firme aunque esté lejos', () => {
    const ruta = rutaDe(ficha({ subidaIso: '2026-03-05T15:00:00Z', hechos: ['entrega'] }), '2026-03-05')
    expect(ruta.hitos[4]?.certeza).toBe(1)
  })
})

describe('el color del cliente', () => {
  it('es el mismo para el mismo id', () => {
    expect(tonoDe('9f3c2a')).toBe(tonoDe('9f3c2a'))
  })

  it('reparte los ids entre los ocho tonos', () => {
    const tonos = new Set(
      Array.from({ length: 200 }, (_, i) => tonoDe(`ficha-${i}-abcdef`)),
    )
    expect(tonos.size).toBe(8)
  })

  it('las iniciales aguantan un nombre de una sola palabra', () => {
    expect(inicialesDe('Ana Tumi')).toBe('AT')
    expect(inicialesDe('Ana')).toBe('A')
    expect(inicialesDe('   ')).toBe('—')
  })
})

describe('el reparto de colores', () => {
  const enLaMismaSemana = Array.from({ length: 8 }, (_, i) =>
    ficha({ fichaId: `cruzada-${i}`, cliente: `Cliente ${i}`, subidaIso: '2026-03-09T15:00:00Z' }),
  )

  it('dos rutas que se cruzan nunca comparten tono', () => {
    const rutas = rutasDe(enLaMismaSemana, '2026-03-09')
    expect(new Set(rutas.map((ruta) => ruta.tono)).size).toBe(8)
  })

  it('la novena de la misma semana vuelve al tono de su id', () => {
    // La paleta tiene ocho colores. Agotada, el noveno repite: se queda con el
    // que le toca por hash en vez de inventar un color que no existe.
    const nueve = [
      ...enLaMismaSemana,
      ficha({ fichaId: 'cruzada-8', cliente: 'Cliente 8', subidaIso: '2026-03-09T15:00:00Z' }),
    ]
    const rutas = rutasDe(nueve, '2026-03-09')

    expect(rutas[8]?.tono).toBe(tonoDe('cruzada-8'))
    expect(new Set(rutas.map((ruta) => ruta.tono)).size).toBe(8)
  })

  it('las que no se cruzan pueden repetir color sin molestar', () => {
    // Un mes de distancia: nunca se ven juntas en la misma celda.
    const lejanas = [
      ficha({ fichaId: 'lejana', subidaIso: '2026-03-09T15:00:00Z' }),
      ficha({ fichaId: 'lejana', subidaIso: '2026-05-11T15:00:00Z' }),
    ]
    const rutas = rutasDe(lejanas, '2026-03-09')
    expect(rutas[0]?.tono).toBe(rutas[1]?.tono)
  })

  it('el orden de entrada no cambia el color de nadie', () => {
    const derecho = rutasDe(enLaMismaSemana, '2026-03-09')
    const alReves = rutasDe([...enLaMismaSemana].reverse(), '2026-03-09')

    for (const ruta of derecho) {
      const misma = alReves.find((otra) => otra.fichaId === ruta.fichaId)
      expect(misma?.tono).toBe(ruta.tono)
    }
  })
})

describe('la grilla del mes', () => {
  it('siempre trae seis semanas de lunes a domingo', () => {
    const mes = armarMes(2026, 3)
    expect(mes.semanas).toHaveLength(6)
    for (const semana of mes.semanas) expect(semana).toHaveLength(7)
    // Marzo de 2026 arranca un domingo, así que la primera fila es la semana
    // que lo contiene: empieza el lunes 23 de febrero.
    expect(mes.semanas[0]?.[0]).toEqual({ dia: '2026-02-23', delMes: false })
    expect(mes.semanas[0]?.[6]).toEqual({ dia: '2026-03-01', delMes: true })
    expect(mes.semanas[5]?.[6]?.dia).toBe('2026-04-05')
  })

  it('marca los días del mes vecino que completan la fila', () => {
    // Mayo de 2026 arranca un viernes: la primera fila trae cuatro días de abril.
    const mes = armarMes(2026, 5)
    expect(mes.semanas[0]?.slice(0, 4).every((celda) => !celda.delMes)).toBe(true)
    expect(mes.semanas[0]?.[4]).toEqual({ dia: '2026-05-01', delMes: true })
  })

  it('pasar de mes no se sale del año', () => {
    expect(mesCorrido(2026, 12, 1)).toEqual({ anio: 2027, mes: 1 })
    expect(mesCorrido(2026, 1, -1)).toEqual({ anio: 2025, mes: 12 })
  })
})

describe('los hitos por día', () => {
  it('junta los de varias rutas y pone adelante lo que urge', () => {
    const hoy = '2026-03-06'
    const rutas = [
      rutaDe(ficha({ fichaId: 'f1', cliente: 'Ana Tumi', subidaIso: '2026-03-05T15:00:00Z' }), hoy),
      rutaDe(ficha({ fichaId: 'f2', cliente: 'Beto Lira', subidaIso: '2026-03-04T15:00:00Z' }), hoy),
    ]

    const mapa = porDia(rutas)
    const delDia = mapa.get('2026-03-06') ?? []

    expect(delDia).toHaveLength(2)
    // El de Beto vencía el 6 y el de Ana también, pero el de Beto es el PPT y
    // el de Ana el portafolio: los dos caen hoy, así que ninguno vence.
    expect(delDia.every((entrada) => entrada.hito.estado === 'hoy')).toBe(true)
  })

  it('el día sin hitos no aparece en el mapa', () => {
    const mapa = porDia([rutaDe(ficha({ subidaIso: '2026-03-05T15:00:00Z' }), '2026-03-05')])
    expect(mapa.has('2026-03-07')).toBe(false)
  })
})
