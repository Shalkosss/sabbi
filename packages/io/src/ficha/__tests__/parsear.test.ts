import { describe, expect, it } from 'vitest'

import { construirLibro } from '../../xlsx/__tests__/construir.js'
import type { HojaFuente, ValorCelda } from '../../xlsx/__tests__/construir.js'
import { parsearFicha } from '../parsear.js'

/**
 * Ficha sintetica con el layout de la real: la tabla de activos arranca en la
 * columna C, los encabezados viven en J..O, y el bloque de portafolio modelo
 * cuelga a la derecha en T..V. Los datos de clientes no viven en el repo, asi
 * que estos son inventados; el caso real se verifica en `golden.test.ts`.
 */
const vacia = (n: number): ValorCelda[] => Array.from({ length: n }, () => null)

const fila = (celdas: Readonly<Record<number, ValorCelda>>): ValorCelda[] => {
  const ancho = Math.max(...Object.keys(celdas).map(Number)) + 1
  const salida = vacia(ancho)
  for (const [col, valor] of Object.entries(celdas)) salida[Number(col)] = valor
  return salida
}

const FICHA: HojaFuente = {
  nombre: 'Cliente Prueba',
  filas: [
    fila({ 19: 'Monto minimo ETF', 20: 20000 }),
    fila({ 19: 'Clase de Activo', 20: 'Moderado', 21: '%' }),
    fila({ 19: 'Imobiliario Directo', 20: 170467.57, 21: 0.2403 }),
    fila({ 19: 'Mercados Publicos - Fijo', 20: 134699.19, 21: 0.1898 }),
    fila({ 2: 'Nombres y Apellidos', 3: 'CLIENTE DE PRUEBA', 11: 'Horizonte de Inversión', 12: '10 años', 19: 'Mercados Publicos - Variable', 20: 116531.12, 21: 0.1642 }),
    fila({ 2: 'Flujo actual', 3: '3000 soles', 11: 'Flujo al retiro', 12: '13000 soles', 19: 'Mercados Privados', 20: 220487.43, 21: 0.3108 }),
    fila({ 19: 'Cash', 20: 67207.65, 21: 0.0947 }),
    fila({
      2: 'Cuenta bancaria y nombre exacto de la inversión',
      9: 'Tipo de activo',
      10: 'Moneda en la que has invertido',
      11: 'Pertenencia',
      12: 'Valor estimado (en dolares)',
      13: 'Rendimiento anual estimado (%) (si no lo sabes dejar en blanco)',
      14: 'FEE',
      19: 'CDs-FED Clase B',
      20: 64794.71,
      21: 0.0913,
    }),
    fila({ 2: 'Banco A plazo fijo', 9: 'Deposito plazo fijo', 10: 'Soles', 11: 'Solo tu', 12: 50000, 13: 0.0525 }),
    fila({ 2: 'CTS Banco B', 9: 'Cuenta ahorros', 10: 'Soles', 11: 'Solo tu', 12: 100000, 13: '6.5%' }),
    // El "Total" del portafolio modelo cae aca, en medio de la tabla de activos.
    fila({ 2: 'Fondo Oportunidad Sabbi', 9: 'Inversiones alternativas (private equity/venture capital/etc)', 10: 'Dólares', 11: 'Solo tu', 12: 25000, 19: 'Total', 20: 709392.98, 21: 1 }),
    fila({ 2: 'Seguro con devolucion', 9: 'Otro', 10: 'Dólares', 11: 'Solo tu', 12: 16000, 14: 0.0195 }),
    fila({ 2: 'Cuenta olvidada', 9: 'Cuenta ahorros', 10: 'Soles', 11: 'Solo tu', 12: 0 }),
    fila({ 11: 'Total', 12: 191000 }),
    [],
    fila({
      2: 'Inmuebles',
      9: 'Pais',
      10: 'Pertenencia',
      11: '% de Pertenencía',
      12: 'Valor estimado (USD)',
      13: 'Monto de alquiler mensual (USD)',
      14: 'Uso de la propiedad',
    }),
    fila({ 2: 'Departamento en renta', 9: 'Peru', 10: 'Solo tu', 11: 1, 12: 120000, 13: 900, 14: 'Renta' }),
    fila({ 2: 'Departamento a medias', 9: 'Peru', 10: 'Compartido', 11: 0.5, 12: 200000, 13: 1000, 14: 'Renta' }),
    fila({ 2: 'Casa familiar', 9: 'Peru', 10: 'Solo tu', 11: 1, 12: 200000, 14: 'Uso propio' }),
    fila({ 10: 'Total', 12: 520000 }),
    [],
    fila({
      2: 'Deudas - Nombre y tipo de deuda',
      9: 'Pertenencia',
      10: 'Valor estimado (USD)',
      11: 'Plazo (en años)',
      12: 'Interes anual',
    }),
    fila({ 2: 'Hipoteca casa', 9: 'Solo tu', 10: 80000, 11: 15, 12: 0.08 }),
    [],
    fila({ 2: '¿Hay algo adicional que quieras agregar?' }),
    fila({ 2: '1. Preferimos ver el patrimonio como uno solo' }),
    fila({ 2: '2. Necesitamos flujo mensual' }),
  ],
}

const parsear = (hoja: HojaFuente = FICHA) => parsearFicha(construirLibro([hoja]))

describe('parsearFicha', () => {
  it('lee los datos del cliente por ancla, no por coordenada', () => {
    const ficha = parsear()

    expect(ficha.hoja).toBe('Cliente Prueba')
    expect(ficha.cliente.nombre).toBe('CLIENTE DE PRUEBA')
    expect(ficha.cliente.horizonte).toBe('10 años')
    expect(ficha.cliente.flujoActual).toBe('3000 soles')
    expect(ficha.cliente.flujoRetiro).toBe('13000 soles')
  })

  it('parsea la tabla de activos financieros hasta la fila Total', () => {
    const financieras = parsear().posiciones.filter((p) => p.origen === 'financiero')

    expect(financieras.map((p) => p.institucionProducto)).toEqual([
      'Banco A plazo fijo',
      'CTS Banco B',
      'Fondo Oportunidad Sabbi',
      'Seguro con devolucion',
    ])
  })

  it('clasifica cada posicion en asset class y clase del motor', () => {
    const porNombre = new Map(parsear().posiciones.map((p) => [p.institucionProducto, p]))

    expect(porNombre.get('Banco A plazo fijo')).toMatchObject({
      assetClass: 'Money Market',
      claseModelo: 'cash',
      moneda: 'PEN',
    })
    expect(porNombre.get('Fondo Oportunidad Sabbi')).toMatchObject({
      assetClass: 'Alternativos Multi Asset Class',
      claseModelo: 'privados',
      moneda: 'USD',
    })
    expect(porNombre.get('Seguro con devolucion')).toMatchObject({
      claseModelo: 'fijo',
      feePct: 0.0195,
    })
  })

  it('normaliza el rendimiento escrito como texto', () => {
    const cts = parsear().posiciones.find((p) => p.institucionProducto === 'CTS Banco B')

    expect(cts?.rendimientoEst).toBeCloseTo(0.065, 10)
  })

  it('descarta las filas sin valor pero las deja listadas', () => {
    const ficha = parsear()

    expect(ficha.posiciones.some((p) => p.institucionProducto === 'Cuenta olvidada')).toBe(false)
    expect(ficha.ignoradas).toHaveLength(1)
    expect(ficha.ignoradas[0]).toMatchObject({
      institucionProducto: 'Cuenta olvidada',
      motivo: 'sin_valor',
    })
  })

  it('reclasifica el inmueble en renta al patrimonio financiero con su cap rate', () => {
    const renta = parsear().posiciones.find((p) => p.institucionProducto === 'Departamento en renta')

    expect(renta).toMatchObject({
      origen: 'inmueble',
      assetClass: 'Inmobiliario Directo',
      claseModelo: 'inm',
      esInvertible: true,
      valorUsd: 120_000,
    })
    expect(renta?.rendimientoEst).toBeCloseTo(0.09, 10)
  })

  it('aplica el porcentaje de pertenencia al valor que entra al patrimonio', () => {
    const medias = parsear().posiciones.find((p) => p.institucionProducto === 'Departamento a medias')

    expect(medias?.valorUsd).toBe(100_000)
    expect(medias?.valorDeclaradoUsd).toBe(200_000)
    expect(medias?.pctPertenencia).toBe(0.5)
  })

  it('deja el inmueble de uso propio fuera de todo calculo', () => {
    const ficha = parsear()
    const casa = ficha.posiciones.find((p) => p.institucionProducto === 'Casa familiar')

    expect(casa?.esInvertible).toBe(false)
    expect(casa?.rendimientoEst).toBeNull()
    expect(ficha.totales.usoPropioUsd).toBe(200_000)
    expect(ficha.totales.invertibleUsd).toBe(191_000 + 120_000 + 100_000)
  })

  it('suma los totales que el motor necesita como ticket', () => {
    const { totales } = parsear()

    expect(totales.financieroUsd).toBe(191_000)
    expect(totales.inmueblesRentaUsd).toBe(220_000)
    expect(totales.invertibleUsd).toBe(411_000)
  })

  it('guarda las deudas aparte, fuera del patrimonio', () => {
    const ficha = parsear()

    expect(ficha.deudas).toEqual([
      expect.objectContaining({ nombre: 'Hipoteca casa', valorUsd: 80_000, interesAnual: 0.08 }),
    ])
    expect(ficha.posiciones.some((p) => p.institucionProducto === 'Hipoteca casa')).toBe(false)
  })

  it('recoge las observaciones libres del cliente', () => {
    expect(parsear().cliente.observaciones).toEqual([
      '1. Preferimos ver el patrimonio como uno solo',
      '2. Necesitamos flujo mensual',
    ])
  })

  it('guarda el portafolio modelo pegado a la derecha como referencia', () => {
    const { modelo } = parsear()

    expect(modelo?.perfil).toBe('Moderado')
    expect(modelo?.montoMinimoEtfUsd).toBe(20_000)
    expect(modelo?.entradas).toHaveLength(6)
    expect(modelo?.entradas[0]).toEqual({ etiqueta: 'Imobiliario Directo', usd: 170467.57, pct: 0.2403 })
    expect(modelo?.entradas.at(-1)).toEqual({ etiqueta: 'CDs-FED Clase B', usd: 64794.71, pct: 0.0913 })
  })

  it('no arrastra el bloque de la derecha al cortar la tabla de activos', () => {
    // El "Total" del portafolio modelo cae en una fila del medio de la tabla:
    // cortar por cualquier celda de la fila truncaria el patrimonio.
    expect(parsear().posiciones.filter((p) => p.origen === 'financiero')).toHaveLength(4)
  })

  it('marca para confirmacion lo que no clasifica solo', () => {
    const ficha = parsear({
      ...FICHA,
      filas: [
        ...FICHA.filas.slice(0, 12),
        fila({ 2: 'Colección de arte', 9: 'Arte', 10: 'Dólares', 11: 'Solo tu', 12: 30000 }),
        ...FICHA.filas.slice(12),
      ],
    })
    const cripto = ficha.posiciones.find((p) => p.institucionProducto === 'Colección de arte')

    expect(cripto).toMatchObject({ claseModelo: null, requiereConfirmacion: true })
    expect(ficha.avisos.some((a) => a.codigo === 'clase_sin_resolver')).toBe(true)
  })

  it('avisa del rendimiento que parece porcentaje sin dividir', () => {
    const ficha = parsear({
      ...FICHA,
      filas: FICHA.filas.map((f, i) =>
        i === 8 ? fila({ 2: 'Banco A plazo fijo', 9: 'Deposito plazo fijo', 10: 'Soles', 11: 'Solo tu', 12: 50000, 13: 5.25 }) : f,
      ),
    })

    expect(ficha.avisos.some((a) => a.codigo === 'rendimiento_dudoso')).toBe(true)
    expect(ficha.posiciones[0]?.rendimientoEst).toBeCloseTo(0.0525, 10)
  })

  it('deja toda posicion sin marcar y sin producto de catalogo', () => {
    // El emparejamiento contra el catalogo y la decision de venta son pasos
    // posteriores: el parser no decide nada por el asesor.
    for (const posicion of parsear().posiciones) {
      expect(posicion.cta).toBe('sin_marcar')
      expect(posicion.productoId).toBeNull()
      expect(posicion.plaza).toBe('Perú')
    }
  })

  it('elige la hoja que trae la tabla de activos', () => {
    const libro = construirLibro([{ nombre: 'Instrucciones', filas: [['Llenar la hoja siguiente']] }, FICHA])

    expect(parsearFicha(libro).hoja).toBe('Cliente Prueba')
  })

  it('acepta que le indiquen la hoja por nombre', () => {
    const libro = construirLibro([FICHA, { ...FICHA, nombre: 'Copia' }])

    expect(parsearFicha(libro, { hoja: 'Copia' }).hoja).toBe('Copia')
  })

  it('falla con un mensaje util cuando el archivo no es una ficha', () => {
    const libro = construirLibro([{ nombre: 'Otra cosa', filas: [['hola']] }])

    expect(() => parsearFicha(libro)).toThrow(/no parece una ficha patrimonial/i)
  })

  it('falla cuando la hoja pedida no existe', () => {
    expect(() => parsearFicha(construirLibro([FICHA]), { hoja: 'Otra' })).toThrow(
      /no tiene una hoja llamada/i,
    )
  })

  it('lista la fila que trae monto sin nombre en vez de sumarla a ciegas', () => {
    const ficha = parsear({
      ...FICHA,
      filas: [
        ...FICHA.filas.slice(0, 12),
        fila({ 9: 'Cuenta ahorros', 10: 'Soles', 12: 45000 }),
        ...FICHA.filas.slice(12),
      ],
    })

    expect(ficha.ignoradas.some((i) => i.motivo === 'sin_nombre')).toBe(true)
    expect(ficha.totales.financieroUsd).toBe(191_000)
  })

  it('lista el inmueble y la deuda sin monto', () => {
    const ficha = parsear({
      ...FICHA,
      filas: FICHA.filas.map((f, i) => {
        if (i === 18) return fila({ 2: 'Terreno sin tasar', 9: 'Peru', 10: 'Solo tu', 11: 1, 14: 'Renta' })
        if (i === 22) return fila({ 2: 'Deuda sin monto', 9: 'Solo tu' })
        return f
      }),
    })

    expect(ficha.ignoradas.map((i) => i.origen)).toEqual(
      expect.arrayContaining(['inmueble', 'deuda']),
    )
    expect(ficha.deudas).toHaveLength(0)
  })

  it('avisa cuando la tabla de activos no tiene encabezados reconocibles', () => {
    const ficha = parsear({
      ...FICHA,
      filas: FICHA.filas.map((f, i) =>
        i === 7 ? fila({ 2: 'Cuenta bancaria y nombre exacto de la inversión' }) : f,
      ),
    })

    expect(ficha.avisos.some((a) => a.codigo === 'bloque_ausente')).toBe(true)
  })

  it('funciona con una ficha sin inmuebles, sin deudas y sin bloque modelo', () => {
    const ficha = parsear({
      nombre: 'Minima',
      filas: [
        fila({
          2: 'Cuenta bancaria y nombre exacto de la inversión',
          9: 'Tipo de activo',
          12: 'Valor estimado (en dolares)',
        }),
        fila({ 2: 'Banco A plazo fijo', 9: 'Deposito plazo fijo', 12: 50000 }),
      ],
    })

    expect(ficha.posiciones).toHaveLength(1)
    expect(ficha.totales.invertibleUsd).toBe(50_000)
    expect(ficha.modelo).toBeNull()
    expect(ficha.cliente.nombre).toBeNull()
  })
})
