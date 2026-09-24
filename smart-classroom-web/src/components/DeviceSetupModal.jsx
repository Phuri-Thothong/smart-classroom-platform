import { useState } from 'react';
import { X } from 'lucide-react';

export default function DeviceSetupModal({ isOpen, onClose, onSave, device, roomsList }) {
  const [formData, setFormData] = useState({
    device_name: device?.device_name || '',
    room_id: device?.room_id || '',
    sampling_interval: 5,
    telemetry_interval: 10,
    enabled: true
  });

  if (!isOpen || !device) return null;
  const isPending = device.status === 'pending';

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ device_id: device.node_id, ...formData }, isPending);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-semibold text-slate-800">
            {isPending ? 'Approve & Setup Device' : 'Device Configuration'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Device ID</label>
            <input type="text" value={device.node_id} disabled className="w-full px-3 py-2 border border-slate-200 rounded-md bg-slate-100 text-slate-500 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Device Name</label>
            <input 
              type="text" required placeholder="e.g. Front Air Conditioner"
              value={formData.device_name} onChange={(e) => setFormData({...formData, device_name: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Room</label>
            <select 
              value={formData.room_id} onChange={(e) => setFormData({...formData, room_id: e.target.value})}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Unassigned --</option>
              {roomsList.map(room => (
                <option key={room.room_id} value={room.room_id}>{room.room_name} ({room.room_id})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sampling (sec)</label>
              <input 
                type="number" min="1" value={formData.sampling_interval} onChange={(e) => setFormData({...formData, sampling_interval: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Telemetry (sec)</label>
              <input 
                type="number" min="1" value={formData.telemetry_interval} onChange={(e) => setFormData({...formData, telemetry_interval: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">
              {isPending ? 'Approve Node' : 'Save Config'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
