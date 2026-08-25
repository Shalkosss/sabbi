import { MACRO_DE_FABRICA, validarMacro } from '@sabbi/config'
import type { Macro } from '@sabbi/config'
import { PERFILES } from '@sabbi/core'
import { describe, expect, it } from 'vitest'

import {
  conPesoDeClase,
  conRegla,
  conRepartoInterno,
  conTexto,
  cuadrarPerfil,
  cuadrarReparto,
  cuadrarTodoElReparto,
  descuadres,
  pesoDeClase,
  repartoInterno,
  sumaDelPerfil,
  sumaDelReparto,
} from '../macro-edicion'

/**
 * Editar la macro sin romper lo que no se toca.
 *
 * Lo que se prueba aca no es la aritmetica sino la promesa: una celda editada
 * no puede mover otra que nadie toco. Los pesos llegan con dieciseis digitos y
 * redondearlos a cuatro decimales desplaza la base de redistribucion en
 * 6,502.88 USD sobre el caso Ana Tumi, asi que «intacto» quiere decir
 * identico, no parecido.
 */

const CLASE_CON_PRODUCTOS = 'fijo' as const
const PERFIL = 'Moderado' as const
const OTRO = 'Arriesgado' as const

const base = (): Macro => JSON.parse(JSON.stringify(MACRO_DE_FABRICA)) as Macro

describe('conPesoDeClase', () => {
  it('cambia solo la clase y el perfil pedidos', () => {
    const antes = base()
    const despues = conPesoDeClase(antes, 'variable', PERFIL, 0.25)

    expect(pesoDeClase(despues, 'variable', PERFIL)).toBe(0.25)
    expect(pesoDeClase(despues, 'variable', OTRO)).toBe(pesoDeClase(antes, 'variable', OTRO))
    expect(despues.pesos.clases['fijo']).toEqual(antes.pesos.clases['fijo'])
  })

  it('reescala los instrumentos conservando su reparto', () => {
    const antes = base()
    const repartoAntes = repartoInterno(antes, CLASE_CON_PRODUCTOS, PERFIL)

    const despues = conPesoDeClase(antes, CLASE_CON_PRODUCTOS, PERFIL, 0.4)
    const repartoDespues = repartoInterno(despues, CLASE_CON_PRODUCTOS, PERFIL)

    repartoDespues.forEach((parte, i) => {
      expect(parte).toBeCloseTo(repartoAntes[i] ?? 0, 12)
    })
    // Y los instrumentos siguen sumando exactamente lo que vale la clase.
    expect(sumaDelReparto(despues, CLASE_CON_PRODUCTOS, PERFIL)).toBeCloseTo(1, 12)
  })

  it('no muta el original', () => {
    const antes = base()
    const copia = JSON.parse(JSON.stringify(antes)) as Macro
    conPesoDeClase(antes, 'variable', PERFIL, 0.9)

    expect(antes).toEqual(copia)
  })

  it('reparte parejo cuando la clase venia en cero', () => {
    // Renta Fija no recibe nada en el perfil Arriesgado. Abrirla no tiene
    // proporciones previas que conservar, asi que va en partes iguales.
    const antes = base()
    expect(pesoDeClase(antes, CLASE_CON_PRODUCTOS, OTRO)).toBe(0)

    const despues = conPesoDeClase(antes, CLASE_CON_PRODUCTOS, OTRO, 0.1)
    const reparto = repartoInterno(despues, CLASE_CON_PRODUCTOS, OTRO)
    const cuantos = despues.pesos.clases[CLASE_CON_PRODUCTOS].productos.length

    for (const parte of reparto) expect(parte).toBeCloseTo(1 / cuantos, 12)
  })
})

describe('conRepartoInterno', () => {
  it('mueve un instrumento y deja los demas donde estaban', () => {
    const antes = base()
    const despues = conRepartoInterno(antes, CLASE_CON_PRODUCTOS, 0, PERFIL, 0.5)

    const productos = despues.pesos.clases[CLASE_CON_PRODUCTOS].productos
    expect(productos[0]?.pesos[PERFIL]).toBeCloseTo(
      pesoDeClase(antes, CLASE_CON_PRODUCTOS, PERFIL) * 0.5,
      12,
    )
    expect(productos[1]?.pesos[PERFIL]).toBe(
      antes.pesos.clases[CLASE_CON_PRODUCTOS].productos[1]?.pesos[PERFIL],
    )
  })

  it('deja el reparto sin cuadrar, que es lo que hay que mostrar', () => {
    const despues = conRepartoInterno(base(), CLASE_CON_PRODUCTOS, 0, PERFIL, 0.9)
    expect(sumaDelReparto(despues, CLASE_CON_PRODUCTOS, PERFIL)).toBeGreaterThan(1)
  })
})

describe('cuadrarPerfil', () => {
  it('reparte la diferencia entre las clases que no se tocaron', () => {
    const antes = base()
    const subida = conPesoDeClase(antes, 'variable', PERFIL, 0.3)
    expect(sumaDelPerfil(subida, PERFIL)).toBeGreaterThan(1)

    const intactas = new Set(['inm', 'fijo', 'privados', 'club', 'otros', 'cash'] as const)
    const cuadrada = cuadrarPerfil(subida, PERFIL, intactas)

    expect(sumaDelPerfil(cuadrada, PERFIL)).toBeCloseTo(1, 12)
    // La clase que se toco a mano no se mueve: para eso se la excluye.
    expect(pesoDeClase(cuadrada, 'variable', PERFIL)).toBe(0.3)
  })

  it('conserva las proporciones entre las clases que mueve', () => {
    const subida = conPesoDeClase(base(), 'variable', PERFIL, 0.3)
    const intactas = new Set(['fijo', 'privados'] as const)
    const cuadrada = cuadrarPerfil(subida, PERFIL, intactas)

    const razonAntes =
      pesoDeClase(subida, 'fijo', PERFIL) / pesoDeClase(subida, 'privados', PERFIL)
    const razonDespues =
      pesoDeClase(cuadrada, 'fijo', PERFIL) / pesoDeClase(cuadrada, 'privados', PERFIL)

    expect(razonDespues).toBeCloseTo(razonAntes, 12)
  })

  it('mueve todas cuando no queda ninguna intacta', () => {
    const subida = conPesoDeClase(base(), 'variable', PERFIL, 0.3)
    const cuadrada = cuadrarPerfil(subida, PERFIL, new Set())

    expect(sumaDelPerfil(cuadrada, PERFIL)).toBeCloseTo(1, 12)
  })

  it('no toca nada si ya cuadra', () => {
    const antes = base()
    expect(cuadrarPerfil(antes, PERFIL, new Set(['fijo']))).toBe(antes)
  })

  it('se abstiene cuando cuadrar dejaria pesos negativos', () => {
    // Fijar una clase por encima de 100% no se arregla achicando las demas:
    // no hay tanto que achicar. Se deja sin cuadrar y la pantalla lo dice.
    const imposible = conPesoDeClase(base(), 'variable', PERFIL, 3)
    expect(cuadrarPerfil(imposible, PERFIL, new Set(['fijo']))).toBe(imposible)
  })
})

describe('cuadrarReparto', () => {
  it('lleva el reparto interno de vuelta al 100% de la clase', () => {
    const movida = conRepartoInterno(base(), CLASE_CON_PRODUCTOS, 0, PERFIL, 0.9)
    const cuadrada = cuadrarReparto(movida, CLASE_CON_PRODUCTOS, PERFIL)

    expect(sumaDelReparto(cuadrada, CLASE_CON_PRODUCTOS, PERFIL)).toBeCloseTo(1, 12)
  })

  it('no toca una clase que no recibe nada en ese perfil', () => {
    const antes = base()
    expect(cuadrarReparto(antes, CLASE_CON_PRODUCTOS, OTRO)).toBe(antes)
  })
})

describe('descuadres', () => {
  it('la macro de fabrica no tiene ninguno', () => {
    expect(descuadres(base(), [PERFIL, OTRO])).toEqual([])
  })

  it('nombra el perfil cuyas clases no suman 1', () => {
    const rota = conPesoDeClase(base(), 'variable', PERFIL, 0.3)
    const fuera = descuadres(rota, [PERFIL, OTRO])

    expect(fuera).toHaveLength(1)
    expect(fuera[0]?.donde).toBe(PERFIL)
  })

  it('nombra la clase cuyo reparto interno se pasa', () => {
    const rota = conRepartoInterno(base(), CLASE_CON_PRODUCTOS, 0, PERFIL, 2)
    const fuera = descuadres(rota, [PERFIL])

    expect(fuera.some((d) => d.donde.includes(PERFIL))).toBe(true)
  })

  it('lo que pasa este filtro pasa tambien el del esquema', () => {
    // Es la misma condicion mirada dos veces a proposito: el mensaje de Zod
    // llega tarde y sin senalar la celda, pero es el que corta de verdad.
    const editada = cuadrarPerfil(
      conPesoDeClase(base(), 'variable', PERFIL, 0.3),
      PERFIL,
      new Set(['fijo', 'privados', 'club', 'otros', 'cash', 'inm'] as const),
    )

    expect(descuadres(editada, [PERFIL])).toEqual([])
    expect(validarMacro(editada).ok).toBe(true)
  })
})

describe('los umbrales', () => {
  it('conRegla cambia uno y deja los otros', () => {
    const antes = base()
    const despues = conRegla(antes, 'club.minUsd', 15_000)

    expect(despues.reglas.club.minUsd).toBe(15_000)
    expect(despues.reglas.fijo).toEqual(antes.reglas.fijo)
    expect(despues.pesos).toBe(antes.pesos)
  })

  it('conTexto cambia el destino del inmobiliario y conserva el umbral', () => {
    const despues = conTexto(base(), 'inmobiliario.destino', 'alternativos')

    expect(despues.reglas.inmobiliario.destino).toBe('alternativos')
    expect(despues.reglas.inmobiliario.umbralUsd).toBe(100_000)
  })

  it('conTexto llega a los campos que no son numeros ni enumeraciones', () => {
    const antes = base()
    const despues = conTexto(antes, 'variable.nucleo', 'MSCI World')

    expect(despues.reglas.variable.nucleo).toBe('MSCI World')
    expect(despues.reglas.variable.separacion).toBe(antes.reglas.variable.separacion)
    expect(despues.pesos).toBe(antes.pesos)
  })
})

describe('cuadrarTodoElReparto', () => {
  it('deja intacta una macro que ya cuadra', () => {
    // Es la promesa que sostiene el boton: apretarlo sobre algo cuadrado no
    // puede reescribir los treinta y cinco pesos con su version redondeada.
    const antes = base()
    expect(cuadrarTodoElReparto(antes, PERFILES)).toEqual(antes)
  })

  it('cierra el descuadre que el editor ya no puede tocar celda por celda', () => {
    // Los instrumentos se mueven con su clase y no tienen celda propia, asi
    // que un reparto torcido —escrito desde el panel de Supabase, o heredado—
    // dejaria el guardado bloqueado sin salida.
    const torcida = conRepartoInterno(base(), CLASE_CON_PRODUCTOS, 0, PERFIL, 0.9)
    expect(descuadres(torcida, [PERFIL]).length).toBeGreaterThan(0)

    const cuadrada = cuadrarTodoElReparto(torcida, PERFILES)
    expect(descuadres(cuadrada, PERFILES)).toEqual([])
    expect(sumaDelReparto(cuadrada, CLASE_CON_PRODUCTOS, PERFIL)).toBeCloseTo(1, 12)
  })
})
