import { useLanguage } from '../i18n/LanguageContext';

const SOURCE_KEYS = {
  journal: 'contextReceipt.source.journal', meeting: 'contextReceipt.source.meeting',
  meeting_transcript: 'contextReceipt.source.meetingTranscript', meeting_decision: 'contextReceipt.source.meetingDecision',
  meeting_action: 'contextReceipt.source.meetingAction', meeting_observation: 'contextReceipt.source.meetingObservation',
  message: 'contextReceipt.source.email', person: 'contextReceipt.source.person',
  project: 'contextReceipt.source.project', goal: 'contextReceipt.source.goal',
};

export default function ContextReceipt({ receipt, className = '' }) {
  const { t } = useLanguage();
  if (!receipt) return null;
  const evidence = receipt.evidence || [];
  const count = evidence.length + (receipt.core_twin?.used ? 1 : 0) + (receipt.full_twin?.used ? 1 : 0);
  return <details className={`rounded-xl border border-slate-200 bg-slate-50 ${className}`}>
    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700">{t('contextReceipt.title')} · {count} {t('contextReceipt.items')}</summary>
    <div className="space-y-3 border-t border-slate-200 px-4 py-4 text-sm">
      <p className="text-xs text-slate-500">{t('contextReceipt.description')}</p>
      {receipt.core_twin?.used && <div><p className="font-semibold text-slate-800">{t('contextReceipt.coreTwin')}</p><p className="text-slate-600">{t('contextReceipt.coreTwinDescription')}</p></div>}
      {receipt.full_twin?.used && <div><p className="font-semibold text-slate-800">{t('contextReceipt.fullTwin')}</p><p className="text-slate-600">{receipt.full_twin.claim_ids?.length || 0} {t('contextReceipt.fullTwinDescription')}</p></div>}
      {evidence.map((item, index) => <div key={`${item.source_type}-${item.evidence_id || item.source_id || index}`} className="border-l-2 border-blue-200 pl-3">
        <p className="font-semibold text-slate-800">{t(SOURCE_KEYS[item.source_type] || 'contextReceipt.source.evidence')}{item.label ? ` · ${item.label}` : ''}</p>
        {item.occurred_at && <p className="text-xs text-slate-500">{new Date(item.occurred_at).toLocaleDateString()}</p>}
        {item.excerpt && <p className="mt-1 text-slate-600">{item.excerpt}</p>}
        {item.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">{tag}</span>)}</div>}
      </div>)}
      {!count && <p className="text-slate-500">{t('contextReceipt.onlyCurrentInput')}</p>}
    </div>
  </details>;
}
