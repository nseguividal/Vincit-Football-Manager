import { useState } from 'react'

export default function ConfirmPasswordField({ value, onChange }) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="pt-3 border-t border-base-border mt-2">
      <label className="text-xs text-ink-dim mb-1.5 block">
        Confirma la teva contrasenya per validar l'acció *
      </label>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          className="input text-sm min-h-[44px] w-full pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="La teva contrasenya..."
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-dim hover:text-ink text-sm p-1 transition-colors"
          tabIndex={-1}
          title={showPassword ? 'Amagar contrasenya' : 'Mostrar contrasenya'}
        >
          {showPassword ? '🙈' : '👁️'}
        </button>
      </div>
    </div>
  )
}
