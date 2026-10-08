"use client";

export default function FinancePrintButton() {
  return (
    <button
      className="border border-black bg-black px-4 py-2 text-sm font-semibold text-white print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      Print / Save PDF
    </button>
  );
}
