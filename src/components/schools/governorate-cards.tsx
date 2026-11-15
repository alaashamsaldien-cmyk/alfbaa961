import { SCHOOL_GOVERNORATES } from "@/lib/geo/school-governorates";
import { formatNumber } from "@/lib/time";

type GovernorateCardsProps = {
  counts?: Record<string, number>;
  selected: string;
  onSelect: (name: string) => void;
  missing: string;
  unit?: string;
  secondary?: Record<string, string>;
};

export function GovernorateCards({ counts, selected, onSelect, missing, unit = "مدرسة", secondary }: GovernorateCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="المحافظات">
      {SCHOOL_GOVERNORATES.map(({ name }) => {
        const active = selected === name;
        const count = counts?.[name];
        return (
          <button
            key={name}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(name)}
            className={`rounded-lg border px-3 py-2.5 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-sky-600 bg-sky-50" : "bg-card hover:bg-muted/50"}`}
          >
            <span className="block text-sm font-bold">{name}</span>
            <span className="text-xs text-muted-foreground">
              {count === undefined ? missing : `${formatNumber(count)} ${unit}`}
            </span>
            {secondary?.[name] && <span className="block text-xs text-muted-foreground">{secondary[name]}</span>}
          </button>
        );
      })}
    </div>
  );
}
