import { useState } from 'react';
import { X, AlertCircle, Plus, Trash2 } from 'lucide-react';

export default function AddClassModal({ isOpen, onClose, onSave, roomsList }) {
  const [roomId, setRoomId] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [schedules, setSchedules] = useState([
    { id: 'row-1', day: '2', start_time: '08:00', end_time: '09:50' }
  ]);
  const [errorMessages, setErrorMessages] = useState([]); 
  const [isSaving, setIsSaving] = useState(false);

  const activeRoomId = roomId || (roomsList.length > 0 ? roomsList[0].room_id : '');

  if (!isOpen) return null;

  const handleClose = () => {
    setRoomId('');
    setSubjectCode('');
    setSubjectName('');
    setSchedules([{ id: 'row-1', day: '2', start_time: '08:00', end_time: '09:50' }]);
    setErrorMessages([]);
    onClose();
  };

  const daysOptions = [
    { id: '2', label: 'Monday' }, { id: '3', label: 'Tuesday' }, { id: '4', label: 'Wednesday' },
    { id: '5', label: 'Thursday' }, { id: '6', label: 'Friday' }, { id: '7', label: 'Saturday' }, { id: '1', label: 'Sunday' }
  ];

  const addScheduleRow = () => {
    setSchedules([...schedules, { id: `row-${Date.now()}`, day: '2', start_time: '08:00', end_time: '09:50' }]);
  };

  const removeScheduleRow = (id) => {
    if (schedules.length > 1) {
      setSchedules(schedules.filter(s => s.id !== id));
    }
  };

  const updateSchedule = (id, field, value) => {
    setSchedules(schedules.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessages([]);
    let collectedErrors = [];
    
    if (schedules.length === 0) {
      setErrorMessages(['Please add at least one schedule.']);
      return;
    }

    for (const s of schedules) {
      if (s.start_time >= s.end_time) {
        setErrorMessages(['End time must be after start time for all schedules.']);
        return;
      }
    }

    setIsSaving(true);
    let hasError = false;
    for (const s of schedules) {
      const submitData = {
        room_id: activeRoomId,
        day_of_week: parseInt(s.day),
        start_time: `${s.start_time}:00`,
        end_time: `${s.end_time}:00`,
        subject_code: subjectCode,
        subject_name: subjectName
      };

      try {
        const res = await fetch("http://localhost:8000/schedules", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitData)
        });
        
        if (!res.ok) {
          const errData = await res.json();
          const dayName = daysOptions.find(d => d.id === s.day).label;
          if (Array.isArray(errData.detail)) {
            errData.detail.forEach(errDetail => {
               collectedErrors.push(`${dayName}: Time conflict! ${errDetail}`);
            });
          } else {
             collectedErrors.push(`${dayName}: ${errData.detail || 'Failed to save'}`);
          }
          hasError = true;
        }
      } catch (error) {
        collectedErrors.push(`Network Error: ${error.message}`);
        hasError = true;
      }
    }

    setIsSaving(false);
    
    if (hasError) {
       setErrorMessages(collectedErrors);
    } else {
      handleClose();
      onSave(); 
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <h3 className="font-semibold text-slate-800">Add New Class</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form id="addClassForm" onSubmit={handleSubmit} className="space-y-6">
            {errorMessages.length > 0 && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm border border-red-100">
                 {errorMessages.map((msg, idx) => (
                    <div key={idx} className="flex items-start gap-2 mb-1 last:mb-0">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{msg}</span>
                    </div>
                 ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="col-span-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Room</label>
                <select 
                  className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 bg-white border outline-none focus:ring-2 focus:ring-blue-100"
                  value={activeRoomId} onChange={e => setRoomId(e.target.value)} required
                >
                  {roomsList.map(r => <option key={r.room_id} value={r.room_id}>{r.room_id}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Subject Code</label>
                <input type="text" placeholder="e.g. 240-371" required
                  className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 bg-white border outline-none focus:ring-2 focus:ring-blue-100 uppercase"
                  value={subjectCode} onChange={e => setSubjectCode(e.target.value.toUpperCase())} />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Subject Name</label>
                <input type="text" placeholder="e.g. IOT SYSTEM" required
                  className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 bg-white border outline-none focus:ring-2 focus:ring-blue-100 uppercase"
                  value={subjectName} onChange={e => setSubjectName(e.target.value.toUpperCase())} />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium text-slate-700">Class Schedules</label>
                <button 
                  type="button" onClick={addScheduleRow}
                  className="flex items-center text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                >
                  <Plus size={14} className="mr-1" /> Add Time
                </button>
              </div>
              
              <div className="space-y-3">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-white relative group">
                    <div className="w-1/3">
                      <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">Day</label>
                      <select 
                        className="w-full border-slate-200 rounded-md text-sm p-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50"
                        value={schedule.day} onChange={e => updateSchedule(schedule.id, 'day', e.target.value)} required
                      >
                        {daysOptions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                      </select>
                    </div>
                    <div className="w-1/3">
                      <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">Start Time</label>
                      <input type="time" required
                        className="w-full border-slate-200 rounded-md text-sm p-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50"
                        value={schedule.start_time} onChange={e => updateSchedule(schedule.id, 'start_time', e.target.value)} />
                    </div>
                    <div className="w-1/3">
                      <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">End Time</label>
                      <input type="time" required
                        className="w-full border-slate-200 rounded-md text-sm p-1.5 outline-none focus:ring-2 focus:ring-blue-100 bg-slate-50"
                        value={schedule.end_time} onChange={e => updateSchedule(schedule.id, 'end_time', e.target.value)} />
                    </div>
                    
                    {schedules.length > 1 && (
                      <button 
                        type="button" onClick={() => removeScheduleRow(schedule.id)}
                        className="absolute -right-2 -top-2 bg-red-100 text-red-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-200 transition-all shadow-sm"
                        title="Remove time"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-3">
          <button type="button" onClick={handleClose} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors disabled:opacity-50">Cancel</button>
          <button type="submit" form="addClassForm" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors flex items-center disabled:opacity-50">
            {isSaving ? 'Saving...' : 'Save Class'}
          </button>
        </div>
      </div>
    </div>
  );
}
