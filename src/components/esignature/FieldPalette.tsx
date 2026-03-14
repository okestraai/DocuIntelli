import React from 'react';
import { PenLine, User, Type, CalendarDays, TextCursorInput, CheckSquare, Briefcase, Building2, FileText } from 'lucide-react';

interface FieldPaletteProps {
  selectedFieldType: string | null;
  onSelectFieldType: (type: string | null) => void;
}

const FIELD_TYPES = [
  { type: 'signature', label: 'Signature', icon: PenLine, description: 'Digital signature' },
  { type: 'full_name', label: 'Full Name', icon: User, description: 'Signer full name' },
  { type: 'initials', label: 'Initials', icon: Type, description: 'Signer initials' },
  { type: 'date_signed', label: 'Date Signed', icon: CalendarDays, description: 'Auto-filled date' },
  { type: 'text_field', label: 'Text Field', icon: TextCursorInput, description: 'Free text input' },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare, description: 'Check/uncheck' },
  { type: 'title_role', label: 'Title / Role', icon: Briefcase, description: 'Job title or role' },
  { type: 'company_name', label: 'Company', icon: Building2, description: 'Company name' },
  { type: 'custom_text', label: 'Custom Text', icon: FileText, description: 'Custom label field' },
];

export function FieldPalette({ selectedFieldType, onSelectFieldType }: FieldPaletteProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2">
        Field Types
      </p>
      {FIELD_TYPES.map(field => {
        const isSelected = selectedFieldType === field.type;
        return (
          <button
            key={field.type}
            onClick={() => onSelectFieldType(isSelected ? null : field.type)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
              isSelected
                ? 'bg-emerald-50 border border-emerald-300 text-emerald-700 shadow-sm'
                : 'hover:bg-slate-50 text-slate-700 border border-transparent'
            }`}
          >
            <field.icon className={`h-4 w-4 flex-shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{field.label}</p>
              <p className={`text-[10px] truncate ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`}>{field.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
