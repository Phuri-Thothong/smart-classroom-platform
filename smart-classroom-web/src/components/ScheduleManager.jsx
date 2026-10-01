import { useState, useEffect, useMemo } from 'react';
import { Calendar, Trash2, Edit3, X, AlertCircle } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function ScheduleManager({ roomsList = [], onAddClick, refreshTrigger }) {
  const [schedules, setSchedules] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [deleteConfirmData, setDeleteConfirmData] = useState(null);
  const [editScheduleData, setEditScheduleData] = useState(null);
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const activeRoom = selectedRoom || (roomsList.length > 0 ? roomsList[0].room_id : '');

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/schedules`);
      if (res.ok) setSchedules(await res.json());
    } catch (error) { console.error("Error:", error.message); }
  };

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE_URL}/schedules`)
      .then(res => res.json())
      .then(data => { if (isMounted) setSchedules(data); })
      .catch(err => console.error(err.message));
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const executeDelete = async () => {
    if (!deleteConfirmData) return;
    try {
      const res = await fetch(`${API_BASE_URL}/schedules/${deleteConfirmData.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete from database");
      setDeleteConfirmData(null);
      fetchSchedules(); 
    } catch (error) { alert(`Error deleting class: ${error.message}`); }
  };

  const handleUpdateSchedule = async (e) => {
    e.preventDefault();
    setEditError('');
    if (editScheduleData.start_time >= editScheduleData.end_time) {
      setEditError('End time must be after start time.');
      return;
    }
    setIsSaving(true);
    const submitData = {
      room_id: editScheduleData.room_id,
      day_of_week: parseInt(editScheduleData.day_of_week),
      start_time: `${editScheduleData.start_time}:00`,
      end_time: `${editScheduleData.end_time}:00`,
      subject_code: editScheduleData.subject_code,
      subject_name: editScheduleData.subject_name
    };
    try {
      const res = await fetch(`${API_BASE_URL}/schedules/${editScheduleData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      });
      if (!res.ok) {
        const errData = await res.json();
        const errMsg = Array.isArray(errData.detail) ? errData.detail[0] : errData.detail;
        throw new Error(errMsg || 'Failed to update schedule');
      }
      setEditScheduleData(null);
      fetchSchedules();
    } catch (error) { setEditError(error.message); } 
    finally { setIsSaving(false); }
  };

  const days = [
    { id: 2, name: 'Mon' }, { id: 3, name: 'Tue' }, { id: 4, name: 'Wed' },
    { id: 5, name: 'Thu' }, { id: 6, name: 'Fri' }, { id: 7, name: 'Sat' }, { id: 1, name: 'Sun' }
  ];
  
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

  const calculatePosition = (start, end) => {
    const timeToFloat = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h + (m / 60);
    };
    const s = timeToFloat(start);
    const e = timeToFloat(end);
    const leftPercent = Math.max(0, ((s - 8) / 10) * 100);
    const widthPercent = ((e - s) / 10) * 100;
    return { left: `${leftPercent}%`, width: `${widthPercent}%` };
  };

  const palette = [
    "bg-slate-500", "bg-indigo-400", "bg-teal-500", "bg-rose-400", 
    "bg-sky-500", "bg-violet-400", "bg-emerald-400", "bg-fuchsia-400",
    "bg-orange-400", "bg-cyan-500", "bg-pink-400", "bg-blue-400"
  ];

  const roomSchedules = useMemo(() => {
    return schedules.filter(s => s.room_id === activeRoom);
  }, [schedules, activeRoom]);

  const uniqueSubjects = useMemo(() => {
    const codes = roomSchedules.map(s => s.subject_code);
    return [...new Set(codes)].sort();
  }, [roomSchedules]);

  const getSubjectColor = (code) => {
    const index = uniqueSubjects.indexOf(code);
    if (index === -1) return palette[0];
    return palette[index % palette.length];
  };

  const formatTimeForInput = (timeStr) => timeStr ? timeStr.substring(0, 5) : '';
  const getDeleteMessage = () => {
    if (!deleteConfirmData) return '';
    const dayObj = days.find(d => d.id === deleteConfirmData.day_of_week);
    const dayName = dayObj ? dayObj.name : '';
    const timeStr = `${formatTimeForInput(deleteConfirmData.start_time)} - ${formatTimeForInput(deleteConfirmData.end_time)}`;
    return `Are you sure you want to remove this class?\n\nSubject: ${deleteConfirmData.subject_code}\nDay: ${dayName}\nTime: ${timeStr}`;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6 relative">

      <ConfirmModal 
        isOpen={!!deleteConfirmData}
        title="Delete Class Schedule?"
        message={getDeleteMessage()}
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirmData(null)}
      />

      {editScheduleData && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-semibold text-slate-800">Edit Class Schedule</h3>
              <button onClick={() => setEditScheduleData(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateSchedule} className="p-6 space-y-4">
              {editError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-start gap-2 border border-red-100">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Room</label>
                  <select 
                    className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 bg-slate-50 border outline-none focus:ring-2 focus:ring-blue-100"
                    value={editScheduleData.room_id} onChange={e => setEditScheduleData({...editScheduleData, room_id: e.target.value})} required
                  >
                    {roomsList.map(r => <option key={r.room_id} value={r.room_id}>{r.room_id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Day</label>
                  <select 
                    className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 bg-slate-50 border outline-none focus:ring-2 focus:ring-blue-100"
                    value={editScheduleData.day_of_week} onChange={e => setEditScheduleData({...editScheduleData, day_of_week: e.target.value})} required
                  >
                    {days.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Start Time</label>
                  <input type="time" required
                    className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100"
                    value={editScheduleData.start_time} onChange={e => setEditScheduleData({...editScheduleData, start_time: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">End Time</label>
                  <input type="time" required
                    className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100"
                    value={editScheduleData.end_time} onChange={e => setEditScheduleData({...editScheduleData, end_time: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Subject Code</label>
                  <input type="text" required
                    className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100 uppercase"
                    value={editScheduleData.subject_code} onChange={e => setEditScheduleData({...editScheduleData, subject_code: e.target.value.toUpperCase()})} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Subject Name</label>
                  <input type="text" required
                    className="w-full border-slate-300 rounded-md shadow-sm text-sm p-2 border outline-none focus:ring-2 focus:ring-blue-100 uppercase"
                    value={editScheduleData.subject_name} onChange={e => setEditScheduleData({...editScheduleData, subject_name: e.target.value.toUpperCase()})} />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setEditScheduleData(null)} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors flex items-center disabled:opacity-50">
                  {isSaving ? 'Updating...' : 'Update Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white shadow-sm">
              <Calendar size={20} />
            </div>
            Timetable View
          </h2>
          <select
            value={activeRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="text-sm border-slate-300 rounded-md shadow-sm bg-slate-50 focus:ring focus:ring-blue-200 px-3 py-2 outline-none font-medium"
          >
            {roomsList.length === 0 && <option value="">No rooms available</option>}
            {roomsList.map(r => (
              <option key={r.room_id} value={r.room_id}>Room {r.room_name || r.room_id}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={onAddClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors"
        >
          + Add Class
        </button>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
        <div className="flex pl-24 border-b border-slate-200 bg-white">
          <div className="relative w-full h-10">
            {hours.map((hour, i) => (
              <div 
                key={hour} 
                className={`absolute text-xs text-slate-500 font-medium bottom-2 ${
                  i === 0 ? 'translate-x-0' : i === hours.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                }`}
                style={{ left: `${(i / 10) * 100}%` }}
              >
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {days.map((day) => {
          const dayClasses = roomSchedules.filter(s => s.day_of_week === day.id);
          
          return (
            <div key={day.id} className="flex border-b border-slate-200 last:border-b-0 min-h-15 bg-white group/row hover:bg-slate-50 transition-colors">
              <div className="w-24 shrink-0 flex items-center justify-center border-r border-slate-200 font-medium text-slate-700 text-sm">
                {day.name}
              </div>
              
              <div className="relative w-full py-2">
                {hours.map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-dashed border-slate-200" style={{ left: `${(i / 10) * 100}%` }} />
                ))}

                {dayClasses.map((cls) => {
                  const style = calculatePosition(cls.start_time, cls.end_time);
                  const colorClass = getSubjectColor(cls.subject_code);
                  
                  return (
                    <div 
                      key={cls.id} 
                      className={`absolute top-1 bottom-1 rounded-md shadow-sm text-white px-2 py-1 text-xs overflow-hidden ${colorClass} hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition-all cursor-pointer group`}
                      style={{ left: style.left, width: style.width }}
                      title={`${cls.start_time.substring(0,5)} - ${cls.end_time.substring(0,5)}\n${cls.subject_code} ${cls.subject_name}`}
                    >
                      <div className="font-semibold truncate pr-12">{cls.subject_code}</div>
                      <div className="truncate opacity-90">{cls.subject_name}</div>
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity bg-black/20 rounded p-0.5 backdrop-blur-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditScheduleData({
                              ...cls,
                              start_time: formatTimeForInput(cls.start_time),
                              end_time: formatTimeForInput(cls.end_time)
                            });
                          }}
                          className="text-white hover:text-blue-200 p-0.5 rounded transition-colors"
                          title="Edit Class"
                        >
                          <Edit3 size={12} />
                        </button>
                        <div className="w-px h-3 bg-white/30"></div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmData(cls);
                          }}
                          className="text-white hover:text-red-200 p-0.5 rounded transition-colors"
                          title="Delete Class"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
