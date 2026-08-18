import type { Metadata } from 'next'
import { Hanken_Grotesk } from 'next/font/google'

import './globals.css'

/**
 * Hanken Grotesk es la tipografia de pantalla de la marca. Se sirve desde el
 * propio dominio — `next/font` la descarga en build — asi que no depende de
 * que la maquina del asesor la tenga instalada.
 */
const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--fuente-sabbi',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sabbi — Plan Patrimonial',
  description: 'De la ficha patrimonial del cliente a su propuesta de portafolio.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={hanken.variable}>
      <body>{children}</body>
    </html>
  )
}
