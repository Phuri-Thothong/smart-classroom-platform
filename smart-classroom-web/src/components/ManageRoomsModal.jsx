import { X, Trash2, AlertTriangle } from 'lucide-react';

export default function ManageRoomsModal({ isOpen, onClose, roomsList, onDeleteRoom }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-800">Manage Rooms</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {roomsList.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-4">No rooms available.</p>
          ) : (
            <div className="space-y-3">
              {roomsList.map(room => (
                <div key={room.room_id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="font-medium text-slate-800 text-sm">{room.room_name}</p>
                    <p className="text-xs text-slate-500">ID: {room.room_id}</p>
                  </div>
                  <button 
                    onClick={() => onDeleteRoom(room.room_id)} 
                    className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
                    title="Delete Room"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-100 rounded-lg flex items-start text-yellow-700 text-xs">
            <AlertTriangle size={14} className="mr-2 mt-0.5 shrink-0" />
            <p>Deleting a room will not delete its devices. Devices will be set to "Unassigned".</p>
          </div>
        </div>
      </div>
    </div>
  );
}
