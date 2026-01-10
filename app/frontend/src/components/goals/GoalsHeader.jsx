export default function GoalsHeader({ onAddClick }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">
        My Vision and Goals
      </h1>
      <button
        onClick={onAddClick}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
      >
        + Add Goal
      </button>
    </div>
  );
}
