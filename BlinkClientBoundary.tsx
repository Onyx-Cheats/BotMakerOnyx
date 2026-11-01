import { ClientOnly } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * SSR-safe boundary. Wrap any subtree that touches browser-only state
 * (`localStorage`, `window`, hooks that read them) here: the server renders
 * `fallback`, the real UI mounts in the browser.
 */
export function ClientBoundary({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return <ClientOnly fallback={fallback}>{children}</ClientOnly>
}
