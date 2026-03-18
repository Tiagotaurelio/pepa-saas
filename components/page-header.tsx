type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionHint?: string;
};

export function PageHeader({ eyebrow, title, description, action, onAction, actionDisabled, actionHint }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-muted">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action ? (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onAction}
            disabled={actionDisabled}
            className="rounded-full bg-brand-blue px-5 py-3 text-sm font-medium text-white shadow-panel disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action}
          </button>
          {actionHint ? (
            <p className="text-xs text-amber-600">{actionHint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
