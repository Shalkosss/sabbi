import { z } from 'zod'

/**
 * Esquema de la configuracion de negocio.
 *
 * Es la unica puerta de entrada de los numeros del negocio al codigo. Si un
 * peso, un umbral o un ticket minimo aparece escrito en un `.tsx` o en el
 * motor, esta mal: tiene que llegar validado por aqui.
 */

export const PERFILES = [
  'Conservador',
  'Conservador & Moderado',
  'Moderado',
  'Moderado & Arriesgado',
  'Arriesgado',
] as const

export const CLASES = ['fijo', 'variable', 'privados', 'club', 'otros', 'inm', 'cash'] as const

/** Peso de benchmark: una fraccion, nunca un porcentaje de 0 a 100. */
const peso = z
  .number()
  .min(0, 'un peso no puede ser negativo')
  .max(1, 'los pesos van de 0 a 1, no de 0 a 100')

const pesosPorPerfil = z.object(
  Object.fromEntries(PERFILES.map((p) => [p, peso])) as Record<
    (typeof PERFILES)[number],
    typeof peso
  >,
)

const producto = z.object({
  nombre: z.string().min(1),
  /** Peso sobre el patrimonio total, no sobre la clase. */
  pesos: pesosPorPerfil,
})

const clase = z.object({
  nombre: z.string().min(1),
  pesos: pesosPorPerfil,
  productos: z.array(producto),
})

export const benchmarksSchema = z
  .object({
    version: z.number().int().positive(),
    origen: z.string().min(1),
    hoja: z.string().min(1),
    nota: z.string().optional(),
    perfiles: z.array(z.enum(PERFILES)).length(PERFILES.length),
    clases: z.object(
      Object.fromEntries(CLASES.map((c) => [c, clase])) as Record<
        (typeof CLASES)[number],
        typeof clase
      >,
    ),
  })
  .superRefine((cfg, ctx) => {
    for (const perfil of PERFILES) {
      const total = CLASES.reduce((acc, c) => acc + cfg.clases[c].pesos[perfil], 0)
      // 1e-6 deja pasar el error de coma flotante del Excel sin tolerar un
      // benchmark realmente mal cuadrado.
      if (Math.abs(total - 1) > 1e-6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['clases'],
          message: `Los pesos del perfil ${perfil} suman ${total}, deberian sumar 1.`,
        })
      }

      for (const c of CLASES) {
        const hijos = cfg.clases[c].productos.reduce((acc, p) => acc + p.pesos[perfil], 0)
        const padre = cfg.clases[c].pesos[perfil]
        if (hijos > padre + 1e-9) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['clases', c, 'productos'],
            message:
              `En ${c}/${perfil} los productos suman ${hijos} y la clase vale ${padre}. ` +
              'Un producto no puede pesar mas que su clase.',
          })
        }
      }
    }
  })

export type Benchmarks = z.infer<typeof benchmarksSchema>
export type Perfil = (typeof PERFILES)[number]
export type ClaseModelo = (typeof CLASES)[number]
