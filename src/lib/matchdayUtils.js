/**
 * Utilitats per a dates i càlcul de la jornada actual
 */

/**
 * Formata una data YYYY-MM-DD o ISO a format català DD/MM/YYYY
 */
export function formatDateDMY(dStr) {
  if (!dStr) return '—'
  const clean = String(dStr).split('T')[0].split(' ')[0]
  const parts = clean.split('-')
  if (parts.length === 3) {
    const [year, month, day] = parts
    return `${day}/${month}/${year}`
  }
  const d = new Date(dStr)
  if (isNaN(d.getTime())) return dStr
  return d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Retorna la jornada "actual" o més propera automàticament segons la data d'avui:
 * 1. Si avui està en curs dins d'una jornada (starts_at <= avui <= ends_at), retorna aquesta.
 * 2. Si avui és anterior a jornades futures, retorna la més propera a començar (la primera amb starts_at >= avui).
 * 3. Si totes les jornades ja han finalitzat, retorna la més recent (l'última que va finalitzar).
 * 4. Fallback: l'última jornada registrada.
 */
export function getCurrentMatchday(matchdays) {
  if (!matchdays || matchdays.length === 0) return null

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const todayStr = `${year}-${month}-${day}`

  // 1. Jornada en curs ara mateix
  const activeNow = matchdays.find((m) => {
    if (!m.starts_at || !m.ends_at) return false
    const s = String(m.starts_at).split('T')[0]
    const e = String(m.ends_at).split('T')[0]
    return s <= todayStr && todayStr <= e
  })
  if (activeNow) return activeNow

  // 2. Jornades futures (starts_at >= todayStr) ordenades de més propera a més llunyana
  const upcoming = matchdays
    .filter((m) => m.starts_at && String(m.starts_at).split('T')[0] >= todayStr)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))

  if (upcoming.length > 0) {
    return upcoming[0]
  }

  // 3. Jornades passades ordenades de més recent a més antiga
  const past = matchdays
    .filter((m) => m.ends_at || m.starts_at)
    .sort((a, b) => String(b.ends_at || b.starts_at).localeCompare(String(a.ends_at || a.starts_at)))

  if (past.length > 0) {
    return past[0]
  }

  // 4. Fallback per número
  const sortedByNum = [...matchdays].sort((a, b) => a.number - b.number)
  return sortedByNum[sortedByNum.length - 1] || sortedByNum[0]
}

/**
 * Comprova si una jornada està activa/en curs en aquest instant exacte
 * (des de les 00:00:00h de starts_at fins a les 23:59:59.999h de ends_at)
 */
export function isMatchdayActiveNow(matchday) {
  if (!matchday || !matchday.starts_at || !matchday.ends_at) return false
  const now = new Date()
  const sStr = String(matchday.starts_at).split('T')[0].split(' ')[0]
  const eStr = String(matchday.ends_at).split('T')[0].split(' ')[0]

  const [sY, sM, sD] = sStr.split('-').map(Number)
  const [eY, eM, eD] = eStr.split('-').map(Number)

  if (!sY || !sM || !sD || !eY || !eM || !eD) return false

  const startTime = new Date(sY, sM - 1, sD, 0, 0, 0, 0).getTime()
  const endTime = new Date(eY, eM - 1, eD, 23, 59, 59, 999).getTime()
  const nowTime = now.getTime()

  return nowTime >= startTime && nowTime <= endTime
}

/**
 * Retorna la jornada que està activa/en curs ara mateix (00:00h a 24:00h), o null si no n'hi ha cap
 */
export function getActiveMatchdayNow(matchdays) {
  if (!matchdays || matchdays.length === 0) return null
  return matchdays.find((m) => isMatchdayActiveNow(m)) || null
}

