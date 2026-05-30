export default function HabitCoachingCard({ context }) {
  const coaching = context?.coaching || 'Alfred will generate coaching once there is enough habit history.';

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-5">
      <h2 className="text-lg font-semibold text-slate-900">Alfred Coaching</h2>
      <p className="mt-3 leading-7 text-slate-700">{coaching}</p>
    </div>
  );
}
