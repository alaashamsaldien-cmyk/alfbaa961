import { ChevronLeft, MapPin } from "lucide-react";
import { IRAQ_GOVERNORATES } from "@/lib/geo/iraq";
import { formatNumber } from "@/lib/time";

type GovernorateCardsProps = {
  counts?: Record<string, number>;
  onSelect: (name: string) => void;
  missing: string;
  unit?: string;
  secondary?: Record<string, string>;
};

export function GovernorateCards({ counts, onSelect, missing, unit = "مدرسة", secondary }: GovernorateCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="المحافظات">
      {IRAQ_GOVERNORATES.map(({ name }) => {
        const count = counts?.[name];
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            className="group min-h-28 rounded-xl border bg-card p-3 text-start outline-none transition-colors hover:border-sky-400 hover:bg-sky-50/70 focus-visible:ring-2 focus-visible:ring-sky-500 active:bg-sky-100"
          >
            <span className="mb-2 flex items-center justify-between">
              <span className="rounded-lg bg-sky-100 p-1.5 text-sky-700 transition-colors group-hover:bg-sky-700 group-hover:text-white"><MapPin size={16} aria-hidden="true" /></span>
              <ChevronLeft size={15} className="text-muted-foreground group-hover:text-sky-700" aria-hidden="true" />
            </span>
            <span className="block text-sm font-bold">{name}</span>
            <span className="text-xs font-medium text-muted-foreground">
              {count === undefined ? missing : `${formatNumber(count)} ${unit}`}
            </span>
            {secondary?.[name] && <span className="block text-xs text-muted-foreground">{secondary[name]}</span>}
          </button>
        );
      })}
    </div>
  );
}
