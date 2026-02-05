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
        .robot { width: 74px; height: 74px; display: flex; align-items: center; justify-content: center; }
        .robot .head { fill: #ef4444; }
        .robot .body { fill: #dc2626; }
        .robot .eye { fill: #fff; }
        .robot-link { pointer-events: auto; cursor: pointer; display: flex; align-items: center; text-decoration: none; }

        @keyframes shake {
          0% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(2px) rotate(2deg); }
          50% { transform: translateX(0) rotate(0deg); }
          75% { transform: translateX(-2px) rotate(-2deg); }
          100% { transform: translateX(0) rotate(0deg); }
        }

        .shake { animation: shake 0.6s ease-in-out infinite; }

        .bubble { background: rgba(255,245,245,0.98); color: #7f1d1d; padding: 8px 12px; border-radius: 14px; box-shadow: 0 6px 18px rgba(2,6,23,0.12); font-size: 13px; max-width: 220px; opacity: 0; transform: translateX(-6px); transition: opacity 260ms ease, transform 260ms ease; pointer-events: auto; }
        .bubble.show { opacity: 1; transform: translateX(0); }

        /* hide completely when not visible to avoid tab stops */
        .robot-root.hidden { display: none; }
      `}</style>

      <div className={visible ? 'robot-root' : 'robot-root hidden'} aria-hidden={!visible}>
        <a href="https://youtu.be/hptnIKomwTk" target="_blank" rel="noopener noreferrer" className="robot-link" aria-label="Watch tutorials on how to buy data">
          <div className="robot-wrap">
            <div className={`robot ${visible ? 'shake' : ''}`}>
              <svg viewBox="0 0 64 64" width="74" height="74" aria-hidden="true">
                <rect x="14" y="20" width="36" height="28" rx="6" className="body" />
                <rect x="20" y="10" width="24" height="18" rx="6" className="head" />
                <circle cx="28" cy="19" r="3.5" className="eye" />
                <circle cx="36" cy="19" r="3.5" className="eye" />
                <rect x="29" y="26" width="6" height="3" rx="1" fill="#083344" />
              </svg>
            </div>

            <div className={`bubble ${visible ? 'show' : ''}`}>
              Watch tutorials 
            </div>
          </div>
        </a>
      </div>
    </>
  )
}

export default ShakingRobot
