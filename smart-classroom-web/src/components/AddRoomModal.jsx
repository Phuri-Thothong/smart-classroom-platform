import { useState } from 'react';
import { X } from 'lucide-react';

export default function AddRoomModal({ isOpen, onClose, onSave }) {
  const [newRoom, setNewRoom] = useState({ id: '', name: '' });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(newRoom);
    setNewRoom({ id: '', name: '' });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h3 className="font-semibold text-lg">Add New Room</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Room ID</label>
            <input 
              type="text" placeholder="e.g. R202" value={newRoom.id}
              onChange={(e) => setNewRoom({...newRoom, id: e.target.value})}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Room Name</label>
            <input 
              type="text" placeholder="e.g. Lecture Room 2" value={newRoom.name}
              onChange={(e) => setNewRoom({...newRoom, name: e.target.value})}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required
            />
          </div>
          <div className="pt-2 flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              Save Room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
