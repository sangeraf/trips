import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { btnCls, btnGhostCls, Card, Field, inputCls, Section, Segmented } from '../components/ui'
import { mergeIntoLocal } from '../db/repo'
import type { Dataset } from '../db/types'
import { useFormat } from '../i18n'
import { syncNow, useSyncState } from '../lib/autosync'
import { exportCsv, exportJson, parseBackup, saveFile } from '../lib/backup'
import { repoInfo } from '../lib/github'
import { todayIso } from '../lib/text'
import { isConfigured, TEXT_SIZE_PX, useSettings, type Lang, type TextSize } from '../store/settings'

export function SettingsView({ ds }: { ds: Dataset }) {
  const { t } = useTranslation()
  const f = useFormat()
  const s = useSettings()
  const running = useSyncState((x) => x.running)
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const test = async () => {
    setCheck(null)
    try {
      const info = await repoInfo(s.github)
      if (!info.private) setCheck({ ok: false, text: t('settings.repoPublic') })
      else if (!info.canWrite) setCheck({ ok: false, text: t('settings.noWrite') })
      else setCheck({ ok: true, text: t('settings.connectionOk') })
    } catch (e) {
      setCheck({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const onImport = async (file: File) => {
    try {
      const merged = await mergeIntoLocal(parseBackup(await file.text()))
      setImportMsg(t('settings.imported', { count: merged.trips.filter((x) => !x.deleted).length }))
      if (s.autoSync) void syncNow()
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-6">
      <Section title={t('settings.language')}>
        <Segmented<Lang>
          value={s.lang}
          onChange={s.setLang}
          options={[
            { value: 'hu', label: 'Magyar' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Section>

      <Section title={t('settings.textSize')}>
        <Segmented<TextSize>
          value={s.textSize}
          onChange={s.setTextSize}
          options={(Object.keys(TEXT_SIZE_PX) as TextSize[]).map((v) => ({ value: v, label: t(`settings.textSizes.${v}`) }))}
        />
      </Section>

      <Section title={t('settings.sync')}>
        <Card className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('settings.syncHelp')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('settings.owner')}>
              <input className={inputCls} autoCapitalize="none" value={s.github.owner} onChange={(e) => s.setGithub({ owner: e.target.value.trim() })} />
            </Field>
            <Field label={t('settings.repo')}>
              <input className={inputCls} autoCapitalize="none" placeholder="trips-data" value={s.github.repo} onChange={(e) => s.setGithub({ repo: e.target.value.trim() })} />
            </Field>
          </div>
          <Field label={t('settings.token')}>
            <div className="flex gap-2">
              <input
                className={inputCls}
                type={showToken ? 'text' : 'password'}
                autoCapitalize="none"
                autoComplete="off"
                placeholder="github_pat_…"
                value={s.github.token}
                onChange={(e) => s.setGithub({ token: e.target.value.trim() })}
              />
              <button type="button" className={btnGhostCls} onClick={() => setShowToken(!showToken)}>
                {t(showToken ? 'settings.hide' : 'settings.show')}
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('settings.branch')}>
              <input className={inputCls} autoCapitalize="none" placeholder={t('settings.defaultBranch')} value={s.github.branch} onChange={(e) => s.setGithub({ branch: e.target.value.trim() })} />
            </Field>
            <Field label={t('settings.deviceName')}>
              <input className={inputCls} value={s.deviceName} placeholder={t('settings.deviceNameHint')} onChange={(e) => s.setDeviceName(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.autoSync} onChange={(e) => s.setAutoSync(e.target.checked)} />
            {t('settings.autoSync')}
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={btnGhostCls} disabled={!isConfigured(s.github)} onClick={test}>
              {t('settings.test')}
            </button>
            <button className={btnCls} disabled={!isConfigured(s.github) || running} onClick={() => void syncNow()}>
              {running ? t('settings.syncing') : t('settings.syncNow')}
            </button>
          </div>
          {check && <p className={`text-sm ${check.ok ? 'text-teal-700' : 'text-red-600'}`}>{check.text}</p>}
          {s.lastSync && (
            <p className={`text-sm ${s.lastSync.ok ? 'text-slate-500' : 'text-red-600'}`}>
              {t('settings.lastSync')}: {f.dateTime(s.lastSync.at)} · {s.lastSync.ok ? t('settings.ok') : t('settings.failed')} ·{' '}
              {s.lastSync.message}
            </p>
          )}
        </Card>
      </Section>

      <Section title={t('settings.backup')}>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhostCls} onClick={() => saveFile(`trips-${todayIso()}.json`, exportJson(ds), 'application/json')}>
            {t('settings.exportJson')}
          </button>
          <button className={btnGhostCls} onClick={() => saveFile(`trips-${todayIso()}.csv`, exportCsv(ds), 'text/csv')}>
            {t('settings.exportCsv')}
          </button>
          <button className={btnGhostCls} onClick={() => fileRef.current?.click()}>
            {t('settings.importJson')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImport(file)
              e.target.value = ''
            }}
          />
        </div>
        {importMsg && <p className="text-sm text-slate-500">{importMsg}</p>}
      </Section>
    </div>
  )
}
