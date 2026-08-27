import { describe, expect, it } from 'vitest'

import {
  HITOS,
  PLAZO_HABILES,
  TONOS,
  armarMes,
  diaEnLima,
  esHabil,
  feriado,
  habilesEntre,
  inicialesDe,
  mesCorrido,
  rutaDe,
  rutasDe,
  sumarHabiles,
  tonoDe,
  tramosDelMes,
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

  it('vencida es que se pasó la entrega, no que falte marcar un hito', () => {
    // Dos días después de subirla: el portafolio ya venció y el PPT es para
    // hoy, pero al cliente no se le prometió nada para esos días.
    const enCurso = rutaDe(ficha({ subidaIso: '2026-03-02T15:00:00Z' }), '2026-03-04')
    expect(enCurso.atrasados).toBe(1)
    expect(enCurso.vencida).toBe(false)

    // Pasado el cuarto día hábil sin cerrarla, sí.
    const pasada = rutaDe(ficha({ subidaIso: '2026-03-02T15:00:00Z' }), '2026-03-09')
    expect(pasada.vencida).toBe(true)

    // Y una cerrada a tiempo no vence nunca.
    const cerrada = rutaDe(
      ficha({ subidaIso: '2026-03-02T15:00:00Z', hechos: ['portafolio', 'ppt', 'revision', 'entrega'] }),
      '2026-03-20',
    )
    expect(cerrada.vencida).toBe(false)
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

  it('reparte los ids entre todos los tonos de la paleta', () => {
    const tonos = new Set(
      Array.from({ length: 200 }, (_, i) => tonoDe(`ficha-${i}-abcdef`)),
    )
    expect(tonos.size).toBe(TONOS)
  })

  it('ninguno es el rojo de la aplicación: ese color dice «vencida»', () => {
    // La paleta se define en el CSS; lo que se fija acá es que el módulo no
    // ofrezca más índices que colores hay, que es lo que llevó a que un
    // cliente saliera terracota y se leyera como una ruta vencida.
    expect(TONOS).toBe(7)
  })

  it('las iniciales aguantan un nombre de una sola palabra', () => {
    expect(inicialesDe('Ana Tumi')).toBe('AT')
    expect(inicialesDe('Ana')).toBe('A')
    expect(inicialesDe('   ')).toBe('—')
  })
})

describe('el reparto de colores', () => {
  const enLaMismaSemana = Array.from({ length: TONOS }, (_, i) =>
    ficha({ fichaId: `cruzada-${i}`, cliente: `Cliente ${i}`, subidaIso: '2026-03-09T15:00:00Z' }),
  )

  it('dos rutas que se cruzan nunca comparten tono', () => {
    const rutas = rutasDe(enLaMismaSemana, '2026-03-09')
    expect(new Set(rutas.map((ruta) => ruta.tono)).size).toBe(TONOS)
  })

  it('agotada la paleta, la siguiente vuelve al tono de su id', () => {
    // Con la paleta llena el color repite: se queda con el que le toca por
    // hash en vez de inventar uno que no existe.
    const unaMas = [
      ...enLaMismaSemana,
      ficha({ fichaId: 'cruzada-extra', cliente: 'Otro', subidaIso: '2026-03-09T15:00:00Z' }),
    ]
    const rutas = rutasDe(unaMas, '2026-03-09')

    expect(rutas[TONOS]?.tono).toBe(tonoDe('cruzada-extra'))
    expect(new Set(rutas.map((ruta) => ruta.tono)).size).toBe(TONOS)
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

describe('las barras del mes', () => {
  const rutas = (fichas: readonly FichaEnAgenda[], hoy: string) => rutasDe(fichas, hoy)

  it('una ruta de una semana es un solo tramo, que abre y cierra', () => {
    // Ficha del lunes 9 de marzo de 2026: la entrega cae el viernes 13.
    const hoy = '2026-03-09'
    const mes = armarMes(2026, 3)
    const tramos = tramosDelMes(mes, rutas([ficha({ subidaIso: '2026-03-09T15:00:00Z' })], hoy), hoy)

    // La semana del 9 es la tercera fila de la grilla de marzo.
    const semana = tramos[2] ?? []
    expect(semana).toHaveLength(1)
    expect(semana[0]).toMatchObject({ desde: 0, hasta: 4, abre: true, cierra: true, carril: 0 })
  })

  it('una ruta que cruza el domingo se parte en dos tramos que se continúan', () => {
    // Ficha del jueves 12: la entrega cae el miércoles 18, del otro lado.
    const hoy = '2026-03-12'
    const mes = armarMes(2026, 3)
    const tramos = tramosDelMes(mes, rutas([ficha({ subidaIso: '2026-03-12T15:00:00Z' })], hoy), hoy)

    expect(tramos[2]?.[0]).toMatchObject({ desde: 3, hasta: 6, abre: true, cierra: false })
    expect(tramos[3]?.[0]).toMatchObject({ desde: 0, hasta: 2, abre: false, cierra: true })
  })

  it('mantiene el carril de una semana a la otra', () => {
    const hoy = '2026-03-09'
    const mes = armarMes(2026, 3)
    const dos = [
      ficha({ fichaId: 'larga', subidaIso: '2026-03-12T15:00:00Z' }),
      ficha({ fichaId: 'corta', subidaIso: '2026-03-16T15:00:00Z' }),
    ]
    const tramos = tramosDelMes(mes, rutas(dos, hoy), hoy)

    const primera = tramos[2]?.find((tramo) => tramo.fichaId === 'larga')
    const sigue = tramos[3]?.find((tramo) => tramo.fichaId === 'larga')
    expect(sigue?.carril).toBe(primera?.carril)
  })

  it('dos rutas que se pisan van en carriles distintos', () => {
    const hoy = '2026-03-09'
    const mes = armarMes(2026, 3)
    const dos = [
      ficha({ fichaId: 'a', subidaIso: '2026-03-09T15:00:00Z' }),
      ficha({ fichaId: 'b', subidaIso: '2026-03-10T15:00:00Z' }),
    ]
    const carriles = (tramosDelMes(mes, rutas(dos, hoy), hoy)[2] ?? []).map((t) => t.carril)
    expect(new Set(carriles).size).toBe(2)
  })

  it('dos rutas que no se pisan comparten carril', () => {
    const hoy = '2026-03-02'
    const mes = armarMes(2026, 3)
    // La primera entrega el viernes 6; la segunda arranca el lunes 9.
    const dos = [
      ficha({ fichaId: 'a', subidaIso: '2026-03-02T15:00:00Z' }),
      ficha({ fichaId: 'b', subidaIso: '2026-03-09T15:00:00Z' }),
    ]
    const tramos = tramosDelMes(mes, rutas(dos, hoy), hoy)
    expect(tramos[1]?.[0]?.carril).toBe(0)
    expect(tramos[2]?.[0]?.carril).toBe(0)
  })

  it('lo vivido cubre el tramo y lo que viene queda por cubrir', () => {
    const mes = armarMes(2026, 3)
    const una = [ficha({ subidaIso: '2026-03-09T15:00:00Z' })]

    // El primer día: solo el lunes quedó atrás, de cinco días de barra.
    expect(tramosDelMes(mes, rutas(una, '2026-03-09'), '2026-03-09')[2]?.[0]?.cubierto).toBeCloseTo(
      1 / 5,
    )
    // Pasada la entrega, la barra entera es historia.
    expect(tramosDelMes(mes, rutas(una, '2026-03-20'), '2026-03-20')[2]?.[0]?.cubierto).toBe(1)
    // El mes siguiente todavía no empezó: nada cubierto.
    const abril = armarMes(2026, 4)
    const futura = [ficha({ subidaIso: '2026-04-06T15:00:00Z' })]
    expect(tramosDelMes(abril, rutas(futura, '2026-03-20'), '2026-03-20')[1]?.[0]?.cubierto).toBe(0)
  })

  it('la semana sin rutas no trae tramos', () => {
    const hoy = '2026-03-09'
    const mes = armarMes(2026, 3)
    const tramos = tramosDelMes(mes, rutas([ficha({ subidaIso: '2026-03-09T15:00:00Z' })], hoy), hoy)
    expect(tramos[0]).toEqual([])
    expect(tramos[5]).toEqual([])
  })
})
