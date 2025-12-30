import React, { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export const useAuth = () => useContext(AuthContext)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let unsubDoc = null
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        try {
          unsubDoc = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
            const userDoc = snap.exists() ? snap.data() : {}
            setUser({ uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName, ...userDoc })
            setInitializing(false)
          }, (err) => {
            setUser({ uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName })
            setInitializing(false)
          })
        } catch (err) {
          setUser({ uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName })
          setInitializing(false)
        }
      } else {
        setUser(null)
        setInitializing(false)
      }
    })

    return () => {
      unsubscribe()
      if (typeof unsubDoc === 'function') unsubDoc()
    }
  }, [])

  // login(email, password) -> signs in with Firebase Auth and loads user doc
  const login = async (email, password) => {
    if (typeof email === 'object' && email !== null) {
      // backward-compatible: set user directly when an object passed
      setUser(email)
      return email
    }
    const cred = await signInWithEmailAndPassword(auth, email, password)
    const fbUser = cred.user
    const snap = await getDoc(doc(db, 'users', fbUser.uid))
    const userDoc = snap.exists() ? snap.data() : {}
    const combined = { uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName, ...userDoc }
    setUser(combined)
    return combined
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, initializing, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
