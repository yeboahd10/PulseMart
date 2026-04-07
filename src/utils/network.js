export function mapNetwork(net) {
  if (!net) return net
  const n = String(net).toLowerCase()
  if (n.includes('mtn') || n.includes('yello')) return 'mtn'
  if (n.includes('telecel') || n.includes('vodafone')) return 'telecel'
  if (n.includes('airteltigo') || n.includes('airtel') || n === 'at' || n.includes('at_premium') || n.includes('tigo')) return 'airteltigo'
  return String(net).toLowerCase()
}
