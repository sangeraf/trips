import type { ReactNode } from 'react'

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

export const btnCls =
  'rounded-lg px-4 py-2 font-medium disabled:opacity-50 bg-teal-700 text-white active:bg-teal-800'
export const btnGhostCls =
  'rounded-lg px-4 py-2 font-medium border border-slate-300 text-slate-700 active:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:active:bg-slate-700'
export const btnDangerCls = 'rounded-lg px-4 py-2 font-medium border border-red-300 text-red-700 active:bg-red-50'

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
            value === o.value
              ? 'bg-white text-teal-800 shadow dark:bg-slate-600 dark:text-white'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${
        onClick ? 'cursor-pointer active:bg-slate-50 dark:active:bg-slate-700' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-slate-500 dark:text-slate-400">{children}</p>
}
