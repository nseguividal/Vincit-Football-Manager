import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { session, isAdmin, loading } = useAuth()

  if (loading) {
    return <div className="p-10 text-ink-dim">Carregant…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }
  return children
}
