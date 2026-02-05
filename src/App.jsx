
import React from 'react'
import './App.css'
import { Routes, Route, Link } from 'react-router-dom'
import Navbar from './Navbar'
import Home from './Home'
import Login from './Login.jsx'
import SignUp from './SignUp.jsx'
import Dashboard from './Dashboard.jsx'
import MTN from './MTN.jsx'
import Telecel from './Telecel.jsx'
import AT from './AT.jsx'
import Admin from './Admin.jsx'
import WhatsAppButton from './components/WhatsAppButton'
import ShakingRobot from './components/ShakingRobot'
import PaystackCallback from './PaystackCallback'
import Maintenance from './components/Maintenance'
import { useAuth } from './context/AuthContext'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'

const ADMIN_EMAIL = 'akwasiappiah@gmail.com'


function App() {
  const { user } = useAuth()
  const [maintenance, setMaintenance] = React.useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = React.useState('')

  React.useEffect(() => {
    const ref = doc(db, 'meta', 'site')
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMaintenance(false)
        setMaintenanceMessage('')
        return
      }
      const data = snap.data() || {}
      setMaintenance(Boolean(data.maintenance))
      setMaintenanceMessage(data.message || '')
    }, (err) => console.warn('site meta snapshot error', err))
    return () => unsub()
  }, [])

  // If site is under maintenance and current user is NOT the admin, show maintenance UI only
  if (maintenance && (!user || user?.email !== ADMIN_EMAIL)) {
    return (
      <div>
        <Maintenance enabled={true} message={maintenanceMessage} />
      </div>
    )
  }


  return (
    <div>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mtn" element={<MTN />} />
        <Route path="/telecel" element={<Telecel />} />
        <Route path="/airteltigo" element={<AT />} />
        <Route path="/at" element={<AT />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/paystack/callback" element={<PaystackCallback />} />
      </Routes>
      <WhatsAppButton phone="+233556665774" message="Hello! I need help with ...." />
      <ShakingRobot />
      
    </div>
  )
}

export default App
