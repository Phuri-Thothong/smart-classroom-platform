import { useState, useEffect, useMemo } from 'react';
import { Calendar } from 'lucide-react';

export default function ScheduleManager({ roomsList = [], onAddClick, refreshTrigger }) {
  const [schedules, setSchedules] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const activeRoom = selectedRoom || (roomsList.length > 0 ? roomsList[0].room_id : '');

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const res = await fetch("http://localhost:8000/schedules");
        const data = await res.json();
        setSchedules(data);
      } catch (error) {
        console.error("Error fetching schedules", error);
      }
    };
    fetchSchedules();
  }, [refreshTrigger]);

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
    "bg-blue-600", "bg-emerald-600", "bg-rose-600", "bg-purple-600", 
    "bg-amber-600", "bg-cyan-600", "bg-indigo-600", "bg-pink-600",
    "bg-teal-600", "bg-fuchsia-600", "bg-orange-600", "bg-lime-600",
    "bg-sky-600", "bg-violet-600", "bg-red-600", "bg-green-600"
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

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6">
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
            <div key={day.id} className="flex border-b border-slate-200 last:border-b-0 min-h-15 bg-white group hover:bg-slate-50 transition-colors">
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
                      className={`absolute top-1 bottom-1 rounded-md shadow-sm text-white px-2 py-1 text-xs overflow-hidden ${colorClass} hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition-all cursor-pointer`}
                      style={{ left: style.left, width: style.width }}
                      title={`${cls.start_time.substring(0,5)} - ${cls.end_time.substring(0,5)}\n${cls.subject_code} ${cls.subject_name}`}
                    >
                      <div className="font-semibold truncate">{cls.subject_code}</div>
                      <div className="truncate opacity-90">{cls.subject_name}</div>
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
