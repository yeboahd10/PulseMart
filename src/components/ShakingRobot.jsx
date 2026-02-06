import React, { useEffect, useRef, useState } from 'react'

const ShakingRobot = () => {
  const [visible, setVisible] = useState(false)
  const intervalRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    const showOnce = () => {
      setVisible(true)
      timeoutRef.current = setTimeout(() => setVisible(false), 10000) // hide after 10s
    }

    // show immediately once
    showOnce()

    // repeat every 20s: show for 10s, hidden for 10s
    intervalRef.current = setInterval(() => {
      showOnce()
    }, 20000)

    return () => {
      clearInterval(intervalRef.current)
      clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <>
      <style>{`
        .robot-root { position: fixed; left: 12px; top: 50%; transform: translateY(-50%); z-index: 9999; pointer-events: none; }
        .robot-wrap { display: flex; align-items: center; gap: 10px; }
        .robot { width: 74px; height: 74px; display: flex; align-items: center; justify-content: center; position: relative; }
        .robot-caption { margin-top: 1px; text-align: center; font-size: 12px; color: #7f1d1d; font-weight: 600; pointer-events: none; }
        .robot-link { pointer-events: auto; cursor: pointer; display: flex; align-items: center; text-decoration: none; }

        @keyframes shake {
          0% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(2px) rotate(2deg); }
          50% { transform: translateX(0) rotate(0deg); }
          75% { transform: translateX(-2px) rotate(-2deg); }
          100% { transform: translateX(0) rotate(0deg); }
        }

        .shake { animation: shake 0.6s ease-in-out infinite; }

        /* icon label removed; icon itself indicates tutorial */

        /* hide completely when not visible to avoid tab stops */
        .robot-root.hidden { display: none; }
      `}</style>

      <div className={visible ? 'robot-root' : 'robot-root hidden'} aria-hidden={!visible}>
        <a href="https://youtu.be/hptnIKomwTk" target="_blank" rel="noopener noreferrer" className="robot-link" aria-label="Watch video tutorial">
          <div className="robot-wrap">
            <div>
              <div className={`robot ${visible ? 'shake' : ''}`}>
                <svg viewBox="0 0 64 64" width="74" height="74" aria-hidden="true">
                  <rect x="6" y="14" width="52" height="36" rx="6" fill="#dc2626" />
                  <polygon points="28,24 44,32 28,40" fill="#fff" />
                  <circle cx="50" cy="18" r="3" fill="#ef4444" opacity="0.6" />
                </svg>
              </div>
              <div className="robot-caption">Tutorials</div>
            </div>
          </div>
        </a>
      </div>
    </>
  )
}

export default ShakingRobot
