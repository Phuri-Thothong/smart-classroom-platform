import { useState } from 'react';
import { X } from 'lucide-react';

export default function AddClassModal({ isOpen, onClose, onSave, roomsList }) {
  const [formData, setFormData] = useState({
    room_id: roomsList.length > 0 ? roomsList[0].room_id : '',
    day_of_week: '2',
    start_time: '08:00',
    end_time: '09:50',
    subject_code: '',
    subject_name: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      day_of_week: parseInt(formData.day_of_week),
      start_time: `${formData.start_time}:00`,
      end_time: `${formData.end_time}:00`
    };
    onSave(submitData);
    setFormData({ ...formData, subject_code: '', subject_name: '' });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-semibold text-slate-800">Add New Class</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Room</label>
              <select 
                className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 bg-slate-50 border outline-none focus:ring-2 focus:ring-blue-100"
                value={formData.room_id} onChange={e => setFormData({...formData, room_id: e.target.value})} required
              >
                {roomsList.map(r => <option key={r.room_id} value={r.room_id}>{r.room_id}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Day</label>
              <select 
                className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 bg-slate-50 border outline-none focus:ring-2 focus:ring-blue-100"
                value={formData.day_of_week} onChange={e => setFormData({...formData, day_of_week: e.target.value})} required
              >
                <option value="2">Monday</option>
                <option value="3">Tuesday</option>
                <option value="4">Wednesday</option>
                <option value="5">Thursday</option>
                <option value="6">Friday</option>
                <option value="7">Saturday</option>
                <option value="1">Sunday</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Start Time</label>
              <input type="time" required
                className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100"
                value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">End Time</label>
              <input type="time" required
                className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100"
                value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Subject Code</label>
            <input type="text" placeholder="e.g. 240-371" required
              className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100 uppercase"
              value={formData.subject_code} onChange={e => setFormData({...formData, subject_code: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Subject Name</label>
            <input type="text" placeholder="e.g. IOT SYSTEM DEVELOPER MODULE" required
              className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100"
              value={formData.subject_name} onChange={e => setFormData({...formData, subject_name: e.target.value.toUpperCase()})} />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors">Save Class</button>
          </div>
        </form>
      </div>
    </div>
  );
}
