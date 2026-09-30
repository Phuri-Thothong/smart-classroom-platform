import { useState, useEffect } from 'react';

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState([]);

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
  }, []);

  const days = [
    { id: 2, name: 'จันทร์' }, { id: 3, name: 'อังคาร' }, { id: 4, name: 'พุธ' },
    { id: 5, name: 'พฤหัสบดี' }, { id: 6, name: 'ศุกร์' }, { id: 7, name: 'เสาร์' }, { id: 1, name: 'อาทิตย์' }
  ];
  
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

  // ฟังก์ชันคำนวณตำแหน่งซ้าย (left %) และความกว้าง (width %) จากเวลา
  const calculatePosition = (start, end) => {
    const timeToFloat = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h + (m / 60);
    };
    const s = timeToFloat(start);
    const e = timeToFloat(end);
    
    // แกนเวลาเริ่มที่ 8.00 (ทั้งหมด 10 ชั่วโมง)
    const leftPercent = Math.max(0, ((s - 8) / 10) * 100);
    const widthPercent = ((e - s) / 10) * 100;
    
    return { left: `${leftPercent}%`, width: `${widthPercent}%` };
  };

  // ชุดสีสำหรับบล็อกวิชา (สุ่มหรือกำหนดตายตัว)
  const colors = ["bg-blue-600", "bg-purple-700", "bg-emerald-600", "bg-rose-600", "bg-amber-600"];

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 mt-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="bg-blue-600 p-2 rounded-md text-white shadow-sm">📅</span>
          มุมมองตารางเรียน (Room R201)
        </h2>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors">
          + เพิ่มวิชาใหม่
        </button>
      </div>

      <div className="border border-gray-200 rounded-md overflow-hidden bg-gray-50">
        {/* Header แถบเวลา 08:00 - 18:00 */}
        <div className="flex pl-24 border-b border-gray-200 bg-white">
          <div className="relative w-full h-10">
            {hours.map((hour, i) => (
              <div 
                key={hour} 
                className="absolute text-xs text-gray-500 font-medium -translate-x-1/2 bottom-2"
                style={{ left: `${(i / 10) * 100}%` }}
              >
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {/* แถวของแต่ละวัน */}
        {days.map((day) => {
          const dayClasses = schedules.filter(s => s.day_of_week === day.id);
          
          return (
            <div key={day.id} className="flex border-b border-gray-200 last:border-b-0 min-h-[60px] bg-white group hover:bg-gray-50 transition-colors">
              <div className="w-24 shrink-0 flex items-center justify-center border-r border-gray-200 font-medium text-gray-700">
                {day.name}
              </div>
              
              <div className="relative w-full py-2">
                {/* เส้นประไกด์ไลน์รายชั่วโมง */}
                {hours.map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-dashed border-gray-200" style={{ left: `${(i / 10) * 100}%` }} />
                ))}

                {/* บล็อกวิชาเรียน */}
                {dayClasses.map((cls, idx) => {
                  const style = calculatePosition(cls.start_time, cls.end_time);
                  const colorClass = colors[(cls.id || idx) % colors.length];
                  
                  return (
                    <div 
                      key={cls.id} 
                      className={`absolute top-1 bottom-1 rounded-md shadow-sm text-white px-2 py-1 text-xs overflow-hidden ${colorClass} hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all cursor-pointer`}
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
