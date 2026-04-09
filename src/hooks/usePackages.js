import { useState, useEffect } from 'react'
import axios from 'axios'
import { toHubnetVolume } from '../utils/network'

const normalizeCapacityLabel = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const compact = raw.toLowerCase().replace(/\s+/g, '')
  if (/^\d+(?:\.\d+)?gb$/.test(compact)) {
    const gb = Number(compact.replace('gb', ''))
    return Number.isFinite(gb) ? `${gb}GB` : ''
  }
  if (/^\d+(?:\.\d+)?mb$/.test(compact)) {
    const mb = Number(compact.replace('mb', ''))
    if (!Number.isFinite(mb) || mb <= 0) return ''
    if (mb >= 1000) {
      const gb = mb / 1000
      return `${Number.isInteger(gb) ? gb : gb.toFixed(1)}GB`
    }
    return `${mb}MB`
  }

  const numeric = Number(raw.replace(/[^\d.]/g, ''))
  if (Number.isFinite(numeric) && numeric > 0) {
    return `${numeric}GB`
  }
  return ''
}

const buildFallbackBundles = (provider, localPrices = [], desiredCapacities = []) => {
  const fallbackCaps = desiredCapacities.length > 0
    ? desiredCapacities
    : localPrices.map((_, i) => `${i + 1} GB`)

  return fallbackCaps.map((cap, i) => ({
    network: provider,
    dataAmount: cap,
    volume: toHubnetVolume(cap),
    price: localPrices?.[i] ?? null,
    apiPrice: null
  }))
}

export default function usePackages(provider, localPrices, desiredCapacities = []) {
  const [bundles, setBundles] = useState(
    buildFallbackBundles(provider, localPrices, desiredCapacities)
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const fetchPackages = async () => {
      setLoading(true)
      setError(null)
      try {
        const providerParam = String(provider || '').toUpperCase()
        const res = await axios.get(`/.netlify/functions/packages?provider=${providerParam}`)
        const raw = Array.isArray(res.data) ? res.data : res.data?.data || []
        const mapped = raw.map((item, i) => {
          const capacityRaw = item.dataAmount || item.amount || item.size || item.name || item.label || item.bundle || item.description || item.title || item.capacity || item.value || `${i + 1}`
          let capacity = String(capacityRaw || '').trim()
          // append ' GB' for numeric-only capacities, leave existing units intact
          if (!/gb$/i.test(capacity) && /^\d+(?:\.\d+)?$/.test(capacity)) capacity = `${capacity} GB`
          return {
            network: provider,
            dataAmount: capacity,
            volume: item.volume || item.capacity || item.size || toHubnetVolume(capacity),
            price: localPrices?.[i] ?? item.price ?? null,
            apiPrice: item.price ?? null,
          }
        })

        if ((desiredCapacities || []).length > 0) {
          const keyed = new Map(
            mapped
              .map((item) => [normalizeCapacityLabel(item.dataAmount), item])
              .filter(([key]) => Boolean(key))
          )

          const ordered = desiredCapacities.map((label, i) => {
            const key = normalizeCapacityLabel(label)
            const matched = keyed.get(key)
            return {
              network: provider,
              dataAmount: label,
              volume: matched?.volume || toHubnetVolume(label),
              price: localPrices?.[i] ?? matched?.price ?? null,
              apiPrice: matched?.apiPrice ?? matched?.price ?? null,
            }
          })

          if (!cancelled) setBundles(ordered)
          return
        }

        // pad with local fallback if API returns fewer items
        if (mapped.length < (localPrices || []).length) {
          for (let j = mapped.length; j < (localPrices || []).length; j++) {
            mapped.push({
              network: provider,
              dataAmount: `${j + 1} GB`,
              volume: toHubnetVolume(`${j + 1} GB`),
              price: localPrices[j],
              apiPrice: null
            })
          }
        }

        if (!cancelled) setBundles(mapped)
      } catch (err) {
        if (!cancelled) {
          setError(err)
          setBundles(buildFallbackBundles(provider, localPrices, desiredCapacities))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPackages()
    return () => { cancelled = true }
  }, [provider, desiredCapacities, localPrices])

  return { bundles, setBundles, loading, error }
}
