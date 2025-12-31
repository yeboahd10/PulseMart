import axios from 'axios'

export async function initPaystack(initPayload) {
  try {
    const res = await axios.post('/.netlify/functions/paystack-initialize', initPayload)
    const data = res.data && (res.data.data || res.data)
    const url = data?.authorization_url || data?.authorizationUrl || data?.data?.authorization_url
    if (!url) throw new Error('No authorization URL returned from Paystack')
    window.location.href = url
    return
  } catch (netlifyErr) {
    console.warn('Netlify init failed, falling back to local server', netlifyErr)
    try {
      const res2 = await axios.post('http://localhost:5000/api/paystack/initialize', initPayload)
      const data = res2.data && (res2.data.data || res2.data)
      const url = data?.authorization_url || data?.authorizationUrl || data?.data?.authorization_url
      if (!url) throw new Error('No authorization URL returned from Paystack (fallback)')
      window.location.href = url
      return
    } catch (fallbackErr) {
      console.error('Paystack init error', fallbackErr)
      throw fallbackErr
    }
  }
}
