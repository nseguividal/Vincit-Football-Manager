import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import Market from './pages/Market'
import Squad from './pages/Squad'
import Teams from './pages/Teams'
import Forms from './pages/Forms'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <div className="flex">
            <Sidebar />
            <main className="flex-1 min-w-0">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/mercat" element={<Market />} />
                <Route path="/plantilla" element={<Squad />} />
                <Route path="/equips" element={<Teams />} />
                <Route
                  path="/formularis"
                  element={
                    <ProtectedRoute>
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
  )
}
