import { Trash2, AlertTriangle } from 'lucide-react';

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, type = 'danger', confirmText = 'Yes, Delete' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-100">
      <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-6 max-w-sm w-full text-center mx-4 animate-in fade-in zoom-in duration-200">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
          {type === 'danger' ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6 whitespace-pre-line">{message}</p>
        <div className="flex gap-3 justify-center">
          <button 
            onClick={onCancel} 
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm} 
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors ${type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
