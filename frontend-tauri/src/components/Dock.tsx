export type AppTab = "chat" | "earthquake";

const APPS: { id: AppTab; icon: string; label: string }[] = [
  { id: "chat", icon: "💬", label: "チャット" },
  { id: "earthquake", icon: "🌐", label: "地震情報" },
];

type DockProps = {
  active: AppTab;
  onSelect: (tab: AppTab) => void;
};

export function Dock({ active, onSelect }: DockProps) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-end gap-2 rounded-2xl border border-border bg-background/90 px-3 py-2 shadow-lg backdrop-blur">
        {APPS.map((app) => (
          <button
            key={app.id}
            type="button"
            onClick={() => onSelect(app.id)}
            title={app.label}
            className={
              "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-transform hover:-translate-y-1.5 hover:scale-110 " +
              (active === app.id ? "bg-muted" : "")
            }
          >
            <span className="text-2xl leading-none">{app.icon}</span>
            {active === app.id && <span className="h-1 w-1 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
