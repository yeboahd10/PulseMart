import React, { useState, useEffect } from 'react'
import { FaWhatsapp } from 'react-icons/fa'

const WhatsAppButton = ({ message = '', channel = 'https://whatsapp.com/channel/0029Vb7ip69IyPtc0WaqdX0I' }) => {
  const url = channel

  const [visible, setVisible] = useState(true)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    let hideTimer
    let showTimer
    if (visible) {
      hideTimer = setTimeout(() => setVisible(false), 3000)
    } else {
      showTimer = setTimeout(() => setVisible(true), 8000)
    }
    return () => {
      clearTimeout(hideTimer)
      clearTimeout(showTimer)
    }
  }, [visible])

  // trigger a short shake periodically (every 8s)
  useEffect(() => {
    let interval
    let timeout
    interval = setInterval(() => {
      setShaking(true)
      timeout = setTimeout(() => setShaking(false), 600)
    }, 8000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  const wrapperStyle = {
    position: 'fixed',
    right: 2,
    bottom: 92,
    zIndex: 2147483647,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  }

  const labelStyle = {
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: 20,
    fontSize: 12,
    marginBottom: 8,
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 300ms ease, transform 300ms ease',
    pointerEvents: 'none'
  }

  const buttonStyle = {
    backgroundColor: '#25D366',
    color: '#fff',
    borderRadius: '50%',
    width: 56,
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none'
  }

  // helper class names used by injected <style>
  const pingClass = visible ? 'wa-ping' : 'wa-ping wa-hidden'
  const btnClass = shaking ? 'wa-btn shake' : 'wa-btn'

  return (
    <div style={wrapperStyle}>
      {/* injected styles for ping and shake animations */}
      <style>{`
        .wa-ping{ position:absolute; width:78px; height:78px; left:50%; top:50%; transform:translate(-50%,-50%); border-radius:50%; background:rgba(37,211,102,0.18); z-index:2147483646; pointer-events:none; animation:wa-ping 0.9s cubic-bezier(.4,0,.2,1) infinite; }
        .wa-hidden{ display:none !important }
        .wa-btn{ position:relative; z-index:999; transition:transform 160ms ease; }
        .wa-btn.shake{ animation:wa-shake 600ms ease-in-out; }
        @keyframes wa-ping{ 0%{transform:translate(-50%,-50%) scale(0.6); opacity:0.95} 60%{opacity:0.32} 100%{transform:translate(-50%,-50%) scale(1.6); opacity:0} }
        @keyframes wa-shake{ 0%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} 100%{transform:translateX(0)} }
      `}</style>

      <div style={labelStyle}>Join our channel</div>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className={pingClass} aria-hidden="true" />
        <a className={btnClass} href={url} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" style={buttonStyle}>
          <FaWhatsapp size={28} />
        </a>
      </div>
    </div>
  )
}

export default WhatsAppButton
