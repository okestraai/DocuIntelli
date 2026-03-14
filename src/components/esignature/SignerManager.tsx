import React, { useState } from 'react';
import { Plus, X, Users, ArrowDownUp, Layers, UserPlus } from 'lucide-react';

export interface SignerEntry {
  name: string;
  email: string;
  orderIndex: number;
}

interface SignerManagerProps {
  signers: SignerEntry[];
  onSignersChange: (signers: SignerEntry[]) => void;
  signingOrder: 'parallel' | 'sequential';
  onSigningOrderChange: (order: 'parallel' | 'sequential') => void;
  selectedSignerEmail: string | null;
  onSelectSigner: (email: string | null) => void;
  currentUserEmail?: string;
  currentUserName?: string;
}

const SIGNER_COLORS = [
  'bg-blue-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-emerald-500',
];

export function SignerManager({
  signers,
  onSignersChange,
  signingOrder,
  onSigningOrderChange,
  selectedSignerEmail,
  onSelectSigner,
  currentUserEmail,
  currentUserName,
}: SignerManagerProps) {
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showForm, setShowForm] = useState(false);

  const addSigner = () => {
    if (!newName.trim() || !newEmail.trim()) return;
    if (signers.some(s => s.email.toLowerCase() === newEmail.toLowerCase())) return;

    const newSigner: SignerEntry = {
      name: newName.trim(),
      email: newEmail.trim().toLowerCase(),
      orderIndex: signers.length,
    };
    onSignersChange([...signers, newSigner]);
    setNewName('');
    setNewEmail('');
    setShowForm(false);
    onSelectSigner(newSigner.email);
  };

  const addSelf = () => {
    if (!currentUserEmail) return;
    if (signers.some(s => s.email.toLowerCase() === currentUserEmail.toLowerCase())) return;

    const name = currentUserName || currentUserEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const newSigner: SignerEntry = {
      name,
      email: currentUserEmail.toLowerCase(),
      orderIndex: signers.length,
    };
    onSignersChange([...signers, newSigner]);
    onSelectSigner(newSigner.email);
  };

  const selfAlreadyAdded = currentUserEmail ? signers.some(s => s.email.toLowerCase() === currentUserEmail.toLowerCase()) : true;

  const removeSigner = (email: string) => {
    onSignersChange(signers.filter(s => s.email !== email).map((s, i) => ({ ...s, orderIndex: i })));
    if (selectedSignerEmail === email) {
      onSelectSigner(signers.length > 1 ? signers.find(s => s.email !== email)?.email || null : null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Signing order toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSigningOrderChange(signingOrder === 'parallel' ? 'sequential' : 'parallel')}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          {signingOrder === 'parallel' ? (
            <>
              <Layers className="h-3.5 w-3.5" />
              Parallel signing
            </>
          ) : (
            <>
              <ArrowDownUp className="h-3.5 w-3.5" />
              Sequential signing
            </>
          )}
        </button>
      </div>

      {/* Signer list */}
      {signers.map((signer, idx) => (
        <div
          key={signer.email}
          onClick={() => onSelectSigner(signer.email)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
            selectedSignerEmail === signer.email
              ? 'border-emerald-300 bg-emerald-50 shadow-sm'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className={`w-7 h-7 rounded-full ${SIGNER_COLORS[idx % SIGNER_COLORS.length]} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
            {signer.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-slate-800 truncate">{signer.name}</p>
              {currentUserEmail && signer.email.toLowerCase() === currentUserEmail.toLowerCase() && (
                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">You</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">{signer.email}</p>
          </div>
          {signingOrder === 'sequential' && (
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">#{idx + 1}</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); removeSigner(signer.email); }}
            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Add signer form */}
      {showForm ? (
        <div className="space-y-2 p-3 border border-slate-200 rounded-lg bg-slate-50">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Signer name"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            autoFocus
          />
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="Email address"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            onKeyDown={e => e.key === 'Enter' && addSigner()}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={addSigner}
              disabled={!newName.trim() || !newEmail.trim()}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-lg transition-colors"
            >
              Add Signer
            </button>
            <button
              onClick={() => { setShowForm(false); setNewName(''); setNewEmail(''); }}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {currentUserEmail && !selfAlreadyAdded && (
            <button
              onClick={addSelf}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-blue-600 border-2 border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Add Myself
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-emerald-600 border-2 border-dashed border-emerald-300 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Signer
          </button>
        </div>
      )}

      {signers.length === 0 && (
        <div className="text-center py-6">
          <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Add signers to get started</p>
        </div>
      )}
    </div>
  );
}
