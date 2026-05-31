export default function GoalsHeader({
  onAddVision,
  onAddWave,
  onAddPillar
}) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
        My Vision and Goals
      </h1>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onAddVision}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          + Vision
        </button>
        <button
          onClick={onAddWave}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg transition-colors"
        >
          + Wave
        </button>
        <button
          onClick={onAddPillar}
          className="bg-white border border-slate-300 hover:border-slate-400 text-slate-700 px-4 py-2 rounded-lg transition-colors"
        >
          + Pillar
        </button>
      </div>
    </div>
  );
}
