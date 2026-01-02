import React, { useState, useEffect } from 'react'
import { FaWhatsapp } from 'react-icons/fa'

const WhatsAppButton = ({ message = '', channel = 'https://whatsapp.com/channel/0029Vb7ip69IyPtc0WaqdX0I' }) => {
  const url = channel

  const [visible, setVisible] = useState(true)

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

  const wrapperStyle = {
    position: 'fixed',
    right: 20,
    bottom: 20,
    zIndex: 1000,
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

  return (
    <div style={wrapperStyle}>
      <div style={labelStyle}>Join our channel</div>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" style={buttonStyle}>
        <FaWhatsapp size={28} />
      </a>
    </div>
  )
}

export default WhatsAppButton
