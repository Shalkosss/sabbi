import { describe, expect, it } from 'vitest'

import { SEED_TAXONOMIA, clasificar } from '../taxonomia.js'

describe('clasificar', () => {
  it('resuelve por el tipo del desplegable cuando no hay pista en el nombre', () => {
    expect(clasificar({ tipoFicha: 'Deposito plazo fijo', nombre: 'Caja Huancayo' })).toMatchObject({
      assetClass: 'Money Market',
      claseModelo: 'cash',
      requiereConfirmacion: false,
    })

    expect(clasificar({ tipoFicha: 'Cuenta ahorros', nombre: 'CTS Caja Piura' })).toMatchObject({
      assetClass: 'Money Market',
      claseModelo: 'cash',
    })
  })

  it('manda el nombre sobre el tipo cuando el nombre es especifico', () => {
    // El desplegable dice "Otro", pero el producto se reconoce por su nombre.
    expect(
      clasificar({ tipoFicha: 'Otro', nombre: 'Pacifico seguro con devolucion ' }),
    ).toMatchObject({
      assetClass: 'Bonos Públicos',
      claseModelo: 'fijo',
      requiereConfirmacion: false,
    })

    expect(
      clasificar({
        tipoFicha: 'Inversiones alternativas (private equity/venture capital/etc)',
        nombre: 'Fondo Oportunidad Sabbi',
      }),
    ).toMatchObject({
      assetClass: 'Alternativos Multi Asset Class',
      claseModelo: 'privados',
    })
  })

  it('separa las familias de privados que el motor trata distinto', () => {
    expect(clasificar({ tipoFicha: 'Otro', nombre: 'Edifica Clase B' })).toMatchObject({
      assetClass: 'Club Deals Real Estate',
      claseModelo: 'club',
    })

    expect(
      clasificar({ tipoFicha: 'Otro', nombre: 'Préstamo directo mutuo - Art Atlas S.R.L.' }),
    ).toMatchObject({
      assetClass: 'Alternativos Crédito Privado',
      claseModelo: 'privados',
    })

    expect(
      clasificar({
        tipoFicha: 'Inversiones alternativas (private equity/venture capital/etc)',
        nombre: 'Fondo de venture capital X',
      }),
    ).toMatchObject({
      assetClass: 'Alternativos Private Equity',
      claseModelo: 'privados',
    })
  })

  it('distingue los ETF de bonos de los de acciones', () => {
    expect(
      clasificar({ tipoFicha: 'Otro', nombre: 'iShares $ Treasury Bond 7-10yr UCITS ETF Acc' }),
    ).toMatchObject({ assetClass: 'Bonos Públicos', claseModelo: 'fijo' })

    expect(clasificar({ tipoFicha: 'Otro', nombre: 'iShares Core S&P 500' })).toMatchObject({
      assetClass: 'Acciones Públicas',
      claseModelo: 'variable',
    })
  })

  it('pide confirmacion cuando el tipo admite varias clases', () => {
    // "Fondos mutuos" puede ser money market, renta fija o renta variable: se
    // resuelve al mas conservador y se marca para que el asesor lo confirme.
    const fm = clasificar({ tipoFicha: 'Fondos mutuos', nombre: 'Interbank futuro seguro' })

    expect(fm.claseModelo).toBe('cash')
    expect(fm.requiereConfirmacion).toBe(true)
  })

  it('lee el subtipo del nombre de un fondo mutuo y ya no pide confirmacion', () => {
    expect(
      clasificar({ tipoFicha: 'Fondos mutuos', nombre: 'Scotiabank fondo renta variable' }),
    ).toMatchObject({
      assetClass: 'Acciones Públicas',
      claseModelo: 'variable',
      requiereConfirmacion: false,
    })
  })

  it('clasifica cripto y oro en la clase Otros', () => {
    expect(clasificar({ tipoFicha: 'Cripto', nombre: 'Bitcoin en Binance' })).toMatchObject({
      assetClass: 'Criptomonedas',
      claseModelo: 'otros',
      requiereConfirmacion: false,
    })
    expect(clasificar({ tipoFicha: 'Otro', nombre: 'iShares Bitcoin Trust (IBIT)' })).toMatchObject({
      assetClass: 'Criptomonedas',
      claseModelo: 'otros',
    })
    expect(clasificar({ tipoFicha: 'Otro', nombre: 'Oro físico en bóveda' })).toMatchObject({
      assetClass: 'Oro',
      claseModelo: 'otros',
    })
    // "tesoro" contiene "oro": la regla de bonos tiene que ganar.
    expect(clasificar({ tipoFicha: 'Otro', nombre: 'Bonos del Tesoro Americano' })).toMatchObject({
      claseModelo: 'fijo',
    })
  })

  it('no adivina una clase cuando no reconoce nada', () => {
    const desconocido = clasificar({ tipoFicha: 'Arte', nombre: 'Colección de cuadros' })

    expect(desconocido.claseModelo).toBeNull()
    expect(desconocido.assetClass).toBeNull()
    expect(desconocido.requiereConfirmacion).toBe(true)
  })

  it('acepta reglas nuevas sin tocar el codigo', () => {
    // asset_class_map es editable desde la app: la tabla es un seed, no una ley.
    const propias = [
      ...SEED_TAXONOMIA,
      {
        patron: 'bitcoin',
        campo: 'nombre' as const,
        assetClass: 'Alternativos Multi Asset Class',
        claseModelo: 'privados' as const,
        prioridad: 5,
        confianza: 'exacta' as const,
      },
    ]

    expect(clasificar({ tipoFicha: 'Cripto', nombre: 'Bitcoin en Binance' }, propias)).toMatchObject(
      { claseModelo: 'privados', requiereConfirmacion: false },
    )
  })
})
