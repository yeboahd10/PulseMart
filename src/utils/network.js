export function mapNetwork(net) {
  if (!net) return net
  const n = String(net).toLowerCase()
  if (n.includes('mtn') || n.includes('yello')) return 'YELLO'
  if (n.includes('telecel')) return 'TELECEL'
  if (n.includes('airteltigo') || n.includes('airtel') || n.includes('at')) return 'AT_PREMIUM'
  return String(net).toUpperCase()
}
