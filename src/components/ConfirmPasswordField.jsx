export default function ConfirmPasswordField({ value, onChange }) {
  return (
    <div className="pt-3 border-t border-base-border mt-2">
      <label className="text-xs text-ink-dim mb-1.5 block">
        Confirma la teva contrasenya per validar l'acció *
      </label>
      <input
        type="password"
        className="input text-sm min-h-[44px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="La teva contrasenya..."
        required
      />
    </div>
  )
}
