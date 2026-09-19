export default function ConfirmPasswordField({ value, onChange }) {
  return (
    <div className="pt-2 border-t border-base-border mt-2">
      <label className="text-xs text-ink-dim mb-1 block">
        Confirma la teva contrasenya per validar l'acció
      </label>
      <input
        type="password"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </div>
  )
}
