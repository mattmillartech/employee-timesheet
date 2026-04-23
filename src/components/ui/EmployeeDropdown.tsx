import { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import type { Employee } from '@/types';

export type EmployeeDropdownProps = {
  employees: Employee[];
  value: string; // selected tabName
  onChange: (tabName: string) => void;
  onAddEmployee?: () => void;
  onManage?: () => void;
  className?: string;
};

export function EmployeeDropdown({
  employees,
  value,
  onChange,
  onAddEmployee,
  onManage,
  className,
}: EmployeeDropdownProps): JSX.Element {
  const active = employees.filter((e) => e.active);
  const selected = employees.find((e) => e.tabName === value);

  return (
    <div className={clsx('relative', className)}>
      <label className="sr-only" htmlFor="employee-select">
        Employee
      </label>
      <div className="inline-flex items-center rounded-md border border-border bg-surface-2">
        <select
          id="employee-select"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__add__') {
              onAddEmployee?.();
              return;
            }
            if (v === '__manage__') {
              onManage?.();
              return;
            }
            onChange(v);
          }}
          className="appearance-none bg-transparent pl-3 pr-9 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-md min-w-40"
        >
          {active.length === 0 ? (
            <option value="" disabled>
              No active employees
            </option>
          ) : null}
          {active.map((e) => (
            <option key={e.tabName} value={e.tabName}>
              {e.displayName}
            </option>
          ))}
          {(onAddEmployee || onManage) && active.length > 0 ? (
            <Fragment>
              <option disabled>──────────</option>
              {onAddEmployee ? <option value="__add__">+ Add Employee</option> : null}
              {onManage ? <option value="__manage__">Manage Employees</option> : null}
            </Fragment>
          ) : null}
        </select>
        <ChevronDown className="w-4 h-4 text-muted -ml-7 pointer-events-none" aria-hidden />
        <span className="sr-only">Selected: {selected?.displayName ?? 'none'}</span>
      </div>
    </div>
  );
}
