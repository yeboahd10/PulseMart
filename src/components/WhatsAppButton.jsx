import React from 'react'
import { FaWhatsapp } from 'react-icons/fa'

const WhatsAppButton = ({ message = '', channel = 'https://whatsapp.com/channel/0029Vb7ip69IyPtc0WaqdX0I' }) => {
  const url = channel


  const wrapperStyle = {
    position: 'fixed',
    right: 20,
    bottom: 20,
    zIndex: 1000,
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
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" style={buttonStyle}>
        <FaWhatsapp size={28} />
      </a>
    </div>
  )
}

export default WhatsAppButton
