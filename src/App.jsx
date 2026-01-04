
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
import PaystackCallback from './PaystackCallback'


function App() {


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
      
    </div>
  )
}

export default App
