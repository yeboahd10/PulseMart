import { useState, useEffect } from 'react'
import axios from 'axios'
import { toHubnetVolume } from '../utils/network'

export default function usePackages(provider, localPrices) {
  const [bundles, setBundles] = useState(
    (localPrices || []).map((p, i) => ({
      network: provider,
      dataAmount: `${i + 1} GB`,
      volume: toHubnetVolume(`${i + 1} GB`),
      price: p,
      apiPrice: null
    }))
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

        if (!cancelled) setBundles(mapped)
      } catch (err) {
        if (!cancelled) {
          setError(err)
          setBundles((localPrices || []).map((p, i) => ({
            network: provider,
            dataAmount: `${i + 1} GB`,
            volume: toHubnetVolume(`${i + 1} GB`),
            price: p,
            apiPrice: null
          })))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPackages()
    return () => { cancelled = true }
  }, [provider, localPrices])

  return { bundles, setBundles, loading, error }
}
