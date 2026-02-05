import React from 'react'

/**
 * Maintenance component
 *
 * Usage:
 * - Toggle globally by setting Vite env var in your project root `.env`:
 *     VITE_SITE_MAINTENANCE=true
 *   (set to `false` or remove to disable)
 * - Or override per-render by passing the `enabled` prop:
 *     <Maintenance enabled={true} />
 *
 * Note: Vite exposes env vars prefixed with `VITE_` to the client.
 */

const Maintenance = ({ enabled, message } = {}) => {
  // Read Vite env flag (string) and treat 'true' as enabled
  const envEnabled = typeof import.meta !== 'undefined' && import.meta.env
    ? (String(import.meta.env.VITE_SITE_MAINTENANCE || '').toLowerCase() === 'true')
    : false

  const isEnabled = typeof enabled === 'boolean' ? enabled : envEnabled

  if (!isEnabled) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Site maintenance"
        className="w-full mx-4 sm:mx-0 max-w-md sm:max-w-xl bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 sm:p-8 text-center"
      >
        <h2 className="text-xl sm:text-2xl font-semibold mb-2">Site Under Maintenance</h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-4">{message || "We're currently performing scheduled maintenance. We'll be back shortly."}</p>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">If you need urgent help, contact support or try again later.</p>
      </div>
    </div>
  )
}

export default Maintenance
