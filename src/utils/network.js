export function mapNetwork(net) {
  if (!net) return net
  const n = String(net).toLowerCase()
  if (n.includes('mtn') || n.includes('yello')) return 'mtn'
  if (n.includes('telecel') || n.includes('vodafone') || n.includes('big-time')) return 'big-time'
  if (n.includes('airteltigo') || n.includes('airtel') || n === 'at' || n.includes('at_premium') || n.includes('tigo')) return 'at'
  return String(net).toLowerCase()
}

export function toHubnetVolume(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''

  const numeric = Number(raw.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(numeric) || numeric <= 0) return ''

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return String(Math.round(numeric > 99 ? numeric : numeric * 1000))
  }

  if (raw.includes('mb')) return String(Math.round(numeric))
  if (raw.includes('tb')) return String(Math.round(numeric * 1000000))
  return String(Math.round(numeric * 1000))
}
