import React from 'react'

export default function SkeletonGrid({ columns = 3, count = 6 }) {
  const items = Array.from({ length: count })
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
      {items.map((_, i) => (
        <div key={i} className="p-2">
          <div className="animate-pulse">
            <div className="h-36 bg-gray-200 dark:bg-gray-700 rounded-md" />
            <div className="mt-3 h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            <div className="mt-2 h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
