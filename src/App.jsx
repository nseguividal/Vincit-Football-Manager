import { Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal'
import Login from './pages/Login'
import Home from './pages/Home'
import Market from './pages/Market'
import Squad from './pages/Squad'
import Matchdays from './pages/Matchdays'
import Forms from './pages/Forms'
import Admin from './pages/Admin'

export default function App() {
  return (
    <>
      <ForcePasswordChangeModal />
      <Routes>
        <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <div className="flex flex-col md:flex-row min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/jornades" element={<Matchdays />} />
                <Route path="/mercat" element={<Market />} />
                <Route path="/plantilla" element={<Squad />} />
                <Route path="/equips" element={<Navigate to="/jornades" replace />} />
                <Route
                  path="/formularis"
                  element={
                    <ProtectedRoute requireCoachOrAdmin>
                      <Forms />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </main>
          </div>
        }
      />
    </Routes>
    <Analytics />
    </>
  )
}
