export default function KpiInfoButton({ label, children }) {
  return (
    <details className="group absolute right-4 top-4 z-10">
      <summary
        className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold leading-none text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 [&::-webkit-details-marker]:hidden"
        aria-label={label}
        title={label}
      >
        i
      </summary>
      <div className="absolute right-0 mt-2 w-64 rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-lg">
        {children}
      </div>
    </details>
  );
}
