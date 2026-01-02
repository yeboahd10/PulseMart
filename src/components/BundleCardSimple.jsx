import React from 'react'
import { FaBolt, FaSimCard, FaWifi, FaChevronRight } from 'react-icons/fa6'
import { Link } from 'react-router-dom'

const NETWORK_STYLES = {
  MTN: { gradient: 'from-amber-400 to-amber-300', icon: FaBolt },
  Telecel: { gradient: 'from-red-500 to-red-400', icon: FaSimCard },
  AirtelTigo: { gradient: 'from-blue-900 to-blue-700', icon: FaWifi },
  default: { gradient: 'from-blue-900 to-blue-700', icon: FaSimCard }
}

export default function BundleCardSimple({ b, cta, onClick }) {
  const network = b?.network || b || ''
  const style = NETWORK_STYLES[network] || NETWORK_STYLES.default
  const Icon = style.icon || FaSimCard
  return (
    <div className={`bg-white rounded-lg border border-gray-100 shadow-sm hover:shadow-lg transform hover:-translate-y-1 transition-all duration-200 overflow-hidden`}>
      <div className={`h-16 flex items-center px-3 bg-gradient-to-r ${style.gradient}`}>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-md bg-white/20 text-white"><Icon /></div>
          <div className={`text-white text-sm font-semibold`}>{network}</div>
        </div>

        <div className={`ml-auto text-white text-sm bg-white/20 px-2 py-0.5 rounded-full`}>In Stock</div>
      </div>

      <div className={`p-3 sm:p-4`}>
        {cta ? (
          <Link to={cta.to} className="w-36 sm:w-40 mx-auto flex items-center justify-center bg-blue-100 text-blue-700 font-semibold rounded-lg py-2 shadow-sm">
            <span>{cta.label || 'Buy Bundle'}</span>
            <FaChevronRight className="ml-2" />
          </Link>
        ) : (
          <button onClick={onClick} className="w-36 sm:w-40 mx-auto flex items-center justify-center bg-blue-100 text-blue-700 font-semibold rounded-lg py-2 shadow-sm">
            <span>Buy Bundle</span>
            <FaChevronRight className="ml-2" />
          </button>
        )}
      </div>
    </div>
  )
}
