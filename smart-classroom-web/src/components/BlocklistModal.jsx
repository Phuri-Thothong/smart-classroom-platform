import { useState, useEffect } from 'react';
import { X, ShieldAlert, RefreshCcw } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function BlocklistModal({ isOpen, onClose }) {
  const [rejectedDevices, setRejectedDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const fetchData = async () => {
      await Promise.resolve();
      if (!isMounted) return;

      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/devices/rejected`);
        if (!res.ok) throw new Error("Network response was not ok");
        
        const data = await res.json();
        if (isMounted) {
          // ตรวจสอบความปลอดภัย ป้องกันข้อมูลไม่ใช่ Array แล้วพาแอปพัง
          setRejectedDevices(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to fetch rejected devices:", error);
        if (isMounted) setRejectedDevices([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleRestore = async (deviceId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/devices/${deviceId}/restore`, { method: 'POST' });
      if (res.ok) {
        showToast(`Device ${deviceId} has been restored and hardware was reset.`, 'success');

        const refreshRes = await fetch(`${API_BASE_URL}/devices/rejected`);
        const data = await refreshRes.json();
        setRejectedDevices(Array.isArray(data) ? data : []);
      } else {
        showToast('Failed to restore device', 'error');
      }
    } catch (error) {
      showToast('Network error while restoring device', error);
    }
  };

  if (!isOpen) return null;

  const safeDevices = Array.isArray(rejectedDevices) ? rejectedDevices : [];

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
        
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <ShieldAlert size={20} className="text-red-500" />
            <h3 className="text-lg font-bold">Device Blocklist</h3>
            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full font-medium ml-2">
              {isLoading ? '...' : `${safeDevices.length} Devices`}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-0 overflow-y-auto flex-1 custom-scrollbar bg-slate-50">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm animate-pulse">Loading blocklist...</div>
          ) : safeDevices.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <ShieldAlert size={40} className="text-slate-300 mb-3 opacity-50" />
              <p className="text-sm font-medium text-slate-500">The blocklist is completely empty.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {safeDevices.map(device => (
                <li key={device.node_id} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{device.device_name || 'Unknown Device'}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-mono">
                      <span>{device.node_id}</span>
                      <span className="text-slate-300">•</span>
                      <span className="uppercase text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-bold text-slate-600">
                        {device.device_type}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleRestore(device.node_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 text-xs font-medium rounded-md shadow-sm transition-all"
                  >
                    <RefreshCcw size={14} />
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
}
