import React from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Friendly "nothing here yet" card used by every list screen. */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => (
  <div className="bg-surface rounded-3xl p-7 text-center border border-line shadow-card space-y-3">
    <p className="text-sm font-semibold text-ink">{title}</p>
    {description && <p className="text-xs text-ink-muted">{description}</p>}
    {action}
  </div>
);

export default EmptyState;
