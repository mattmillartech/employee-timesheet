import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, EyeOff, Eye } from 'lucide-react';
import clsx from 'clsx';
import type { Employee } from '@/types';

export type SettingsPanelProps = {
  employees: readonly Employee[];
  onReorder: (orderedTabNames: string[]) => Promise<void>;
  onToggleActive: (tabName: string, active: boolean) => Promise<void>;
  onAddEmployee: () => void;
};

export function SettingsPanel({
  employees,
  onReorder,
  onToggleActive,
  onAddEmployee,
}: SettingsPanelProps): JSX.Element {
  const [localOrder, setLocalOrder] = useState<Employee[]>(() => [...employees]);
  const [savingReorder, setSavingReorder] = useState(false);

  // Keep local order in sync when employees prop changes (e.g., after add).
  useMemo(() => {
    setLocalOrder([...employees]);
  }, [employees]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localOrder.findIndex((e) => e.tabName === active.id);
    const newIndex = localOrder.findIndex((e) => e.tabName === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(localOrder, oldIndex, newIndex);
    setLocalOrder(next);
    setSavingReorder(true);
    try {
      await onReorder(next.map((e) => e.tabName));
    } finally {
      setSavingReorder(false);
    }
  };

  const tabIds = localOrder.map((e) => e.tabName);

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Employees</h3>
          <p className="text-xs text-muted">
            Drag to reorder. Hide to remove from the Entry dropdown — the employee's tab data is preserved.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddEmployee}
          className="rounded-md bg-primary text-primary-fg px-3 py-1.5 text-sm font-medium"
        >
          + Add Employee
        </button>
      </header>

      {savingReorder ? (
        <p className="text-xs text-muted animate-pulse">Saving order…</p>
      ) : null}

      {localOrder.length === 0 ? (
        <div className="rounded-md border border-border bg-surface p-4 text-sm text-muted">
          No employees yet.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
          <SortableContext items={tabIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {localOrder.map((emp) => (
                <SortableRow
                  key={emp.tabName}
                  employee={emp}
                  onToggleActive={(next) => onToggleActive(emp.tabName, next)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableRow({
  employee,
  onToggleActive,
}: {
  employee: Employee;
  onToggleActive: (next: boolean) => Promise<void>;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: employee.tabName,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={clsx(
        'flex items-center gap-3 rounded-md border bg-surface p-3',
        isDragging ? 'border-primary shadow-md' : 'border-border',
        !employee.active && 'opacity-60',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${employee.displayName}`}
        className="p-1 rounded hover:bg-surface-2 text-muted cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" aria-hidden />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{employee.displayName}</div>
        <div className="text-xs text-muted font-mono truncate">{employee.tabName}</div>
      </div>
      <button
        type="button"
        onClick={() => void onToggleActive(!employee.active)}
        className={clsx(
          'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm',
          employee.active
            ? 'border-border bg-surface-2 hover:bg-border'
            : 'border-muted/30 bg-muted/10 text-muted hover:bg-muted/20',
        )}
        aria-pressed={!employee.active}
      >
        {employee.active ? (
          <>
            <Eye className="w-4 h-4" aria-hidden />
            <span>Active</span>
          </>
        ) : (
          <>
            <EyeOff className="w-4 h-4" aria-hidden />
            <span>Hidden</span>
          </>
        )}
      </button>
    </li>
  );
}
