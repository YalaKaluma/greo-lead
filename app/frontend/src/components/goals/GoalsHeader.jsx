import { useLanguage } from '../../i18n/LanguageContext';

export default function GoalsHeader({
  onAddVision,
  onAddWave,
  onAddPillar
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
        {t('goals.title')}
      </h1>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onAddVision}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {t('goals.addVision')}
        </button>
        <button
          onClick={onAddWave}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg transition-colors"
        >
          {t('goals.addWave')}
        </button>
        <button
          onClick={onAddPillar}
          className="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 px-4 py-2 rounded-lg transition-colors"
        >
          {t('goals.addPillar')}
        </button>
      </div>
    </div>
  );
}
