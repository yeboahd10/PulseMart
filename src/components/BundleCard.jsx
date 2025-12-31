import React from 'react'
import { FaBolt, FaSimCard, FaWifi } from 'react-icons/fa6'
import { FaCediSign } from 'react-icons/fa6'

const NETWORK_STYLES = {
  MTN: { gradient: 'from-amber-400 to-amber-300', icon: FaBolt },
  Telecel: { gradient: 'from-red-500 to-red-400', icon: FaSimCard },
  AirtelTigo: { gradient: 'from-blue-900 to-blue-700', icon: FaWifi },
  default: { gradient: 'from-blue-900 to-blue-700', icon: FaSimCard }
}

export default function BundleCard({ b, onClick }) {
  const style = NETWORK_STYLES[b.network] || NETWORK_STYLES.default
  const Icon = style.icon || FaSimCard
  const isDeep = (b.network === 'AirtelTigo')

  return (
    <div onClick={onClick} className={`${isDeep ? `bg-gradient-to-br ${style.gradient} border-transparent text-white` : 'bg-white rounded-lg border border-gray-100'} shadow-sm hover:shadow-lg transform hover:-translate-y-1 transition-all duration-200 overflow-hidden cursor-pointer rounded-lg` }>
      <div className={`h-16 flex items-center px-3 ${isDeep ? '' : `bg-gradient-to-r ${style.gradient}`}`}>
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-md bg-white/20 text-white"><Icon /></div>
          <div className={`${isDeep ? 'text-white' : 'text-white'} text-sm font-semibold`}>{b.network}</div>
        </div>
        <div className={`${isDeep ? 'ml-auto text-white text-sm bg-white/10' : 'ml-auto text-white text-sm bg-white/20'} px-2 py-0.5 rounded-full`}>{b.dataAmount}</div>
      </div>

      <div className={`p-3 sm:p-4 flex items-center justify-between ${isDeep ? 'text-white' : ''}`}>
        <div>
          <h3 className={`text-base sm:text-lg font-bold ${isDeep ? 'text-white' : 'text-gray-800'}`}>{b.dataAmount}</h3>
          <p className={`${isDeep ? 'text-blue-100' : 'text-gray-500'} text-xs sm:text-sm mt-1`}>In Stock</p>
        </div>

        <div className="text-right">
          <div className={`text-lg sm:text-2xl font-extrabold flex items-center justify-end ${isDeep ? 'text-white' : 'text-gray-900'}`}>
            <FaCediSign className="inline mr-1" />{b.price}
          </div>
          <div className={`${isDeep ? 'text-blue-100' : 'text-gray-500'} mt-1 text-[10px] sm:text-xs`}>Fast delivery</div>
        </div>
      </div>
    </div>
  )
}
