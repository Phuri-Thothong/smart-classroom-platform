import { useState } from 'react';
import { X, AlertTriangle, Cpu, RefreshCw } from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { useToast } from '../contexts/ToastContext';

const SAFE_PINS = [4, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33];
const STRAPPING_PINS = [0, 2, 5, 12, 15];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function DeviceSetupModal({ isOpen, onClose, onSave, device, roomsList = [] }) {
  const [formData, setFormData] = useState(() => {
    if (!device) return { room_id: '', device_name: '', sampling_interval: 5, telemetry_interval: 8, gpio_config: {} };

    let caps = {};
    if (device.capabilities) {
      caps = typeof device.capabilities === 'string' ? JSON.parse(device.capabilities) : device.capabilities;
    }

    let defaultGpio = caps.gpio_config || {};
    
    if (Object.keys(defaultGpio).length === 0) {
      const type = device.device_type;
      if (type === 'lighting' || type === 'air_control') {
        defaultGpio = { control_pin: 26 };
      } else if (type === 'occupancy') {
        defaultGpio = { out_pin: 27 };
      } else if (type === 'energy_node') {
        defaultGpio = { rx_pin: 16, tx_pin: 17 };
      }
    }

    return {
      room_id: device.room_id || (roomsList.length > 0 ? roomsList[0].room_id : ''),
      device_name: device.device_name || '',
      sampling_interval: caps.sampling_interval || device.sampling_interval || 5,
      telemetry_interval: caps.telemetry_interval || device.telemetry_interval || 8,
      gpio_config: defaultGpio
    };
  });

  const [confirmModalState, setConfirmModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    confirmText: 'Confirm',
    onConfirm: () => {}
  });

  const { showToast } = useToast();

  if (!isOpen || !device) return null;

  const isPending = device.status === 'pending';
  const isVirtualNode = device.firmware_version?.includes('GW') || device.node_id?.includes('-L') || device.node_id?.includes('-A');

  const handleSave = (e) => {
    e.preventDefault();
    const configData = {
      device_id: device.node_id,
      room_id: formData.room_id,
      device_name: formData.device_name,
      sampling_interval: parseInt(formData.sampling_interval),
      telemetry_interval: parseInt(formData.telemetry_interval),
      gpio_config: formData.gpio_config
    };
    onSave(configData, isPending);
  };

  const handleRequestRelocation = () => {
    setConfirmModalState({
      isOpen: true,
      title: 'Request Device Relocation',
      message: `Do you want to relocate ${device.node_id}?\nThis will reset the device status to PENDING for re-configuration.`,
      type: 'warning',
      confirmText: 'Yes, Relocate',
      onConfirm: () => {
        fetch(`${API_BASE_URL}/devices/${device.node_id}/request-relocation`, { method: 'POST' })
          .then(res => {
            if (res.ok) {
              setConfirmModalState(prev => ({ ...prev, isOpen: false }));
              onClose();
              showToast(`Device ${device.node_id} is now pending for relocation.`, 'success');
              setTimeout(() => window.location.reload(), 1000); // รีเฟรชหน้าจออัปเดตสถานะ
            } else {
              showToast('Failed to request relocation', 'error');
              setConfirmModalState(prev => ({ ...prev, isOpen: false }));
            }
          })
          .catch(() => {
            showToast('Network error while requesting relocation', 'error');
            setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          });
      }
    });
  };

  const handleGpioChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      gpio_config: { ...prev.gpio_config, [key]: parseInt(value) }
    }));
  };

  const hasWarning = Object.values(formData.gpio_config).some(pin => STRAPPING_PINS.includes(pin));

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">
            {isPending ? 'Approve Device' : 'Device Configuration'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Device ID</label>
            <input type="text" disabled value={device.node_id} 
              className="w-full border border-slate-200 rounded-md text-sm p-2.5 bg-slate-50 text-slate-500" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Device Name</label>
            <input type="text" placeholder="e.g. Front Air Conditioner" required 
              value={formData.device_name} onChange={e => setFormData({...formData, device_name: e.target.value})} 
              className="w-full border border-slate-300 rounded-md text-sm p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-sm font-semibold text-slate-700">Assign Room</label>
              {!isPending && !isVirtualNode && (
                <button 
                  type="button" 
                  onClick={handleRequestRelocation}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Request Relocation (Change Room)
                </button>
              )}
            </div>

            {/* ถ้าเป็นสถานะ Pending ถึงจะให้เลือกห้องได้ */}
            {isPending || isVirtualNode ? (
              <select required value={formData.room_id} onChange={e => setFormData({...formData, room_id: e.target.value})} 
                disabled={isVirtualNode}
                className={`w-full border border-slate-300 rounded-md text-sm p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white ${isVirtualNode ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}>
                <option value="">Select Room...</option>
                {roomsList.map(r => <option key={r.room_id} value={r.room_id}>Room {r.room_name || r.room_id}</option>)}
              </select>
            ) : (
              <div className="flex items-center justify-between w-full border border-slate-200 rounded-md text-sm p-2.5 bg-slate-50 text-slate-600 font-medium">
                <span>Room {formData.room_id}</span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">Locked</span>
              </div>
            )}

            {isVirtualNode && (
              <p className="text-[11px] text-slate-400 mt-1">Virtual Node room is inherited from its physical Gateway.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Sampling (sec)</label>
              <input type="number" min="1" required 
                value={formData.sampling_interval} onChange={e => setFormData({...formData, sampling_interval: e.target.value})} 
                className="w-full border border-slate-300 rounded-md text-sm p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Telemetry (sec)</label>
              <input type="number" min="1" required 
                value={formData.telemetry_interval} onChange={e => setFormData({...formData, telemetry_interval: e.target.value})} 
                className="w-full border border-slate-300 rounded-md text-sm p-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5"></div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800">
                <Cpu size={18} className="text-blue-600" />
                <h4 className="text-sm font-semibold">Hardware Configuration</h4>
              </div>
              <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded uppercase font-bold tracking-wider">{device.device_type}</span>
            </div>
            
            <p className="text-xs text-slate-500">Default safe pins are pre-selected. Change only if necessary.</p>

            <div className="grid grid-cols-2 gap-4 mt-2">
              {Object.keys(formData.gpio_config).map((pinKey) => (
                <div key={pinKey}>
                  <label className="block text-xs font-semibold text-slate-600 capitalize mb-1">
                    {pinKey.replace('_', ' ')}
                  </label>
                  <select 
                    value={formData.gpio_config[pinKey]} 
                    onChange={e => handleGpioChange(pinKey, e.target.value)}
                    className="w-full border border-slate-300 rounded-md text-sm p-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono bg-slate-50"
                  >
                    <optgroup label="Safe Pins (Recommended)">
                      {SAFE_PINS.map(pin => <option key={`safe-${pin}`} value={pin}>GPIO {pin}</option>)}
                    </optgroup>
                    <optgroup label="Strapping Pins (Caution)">
                      {STRAPPING_PINS.map(pin => <option key={`strap-${pin}`} value={pin}>GPIO {pin}</option>)}
                    </optgroup>
                  </select>
                </div>
              ))}
            </div>

            {hasWarning && (
              <div className="mt-3 bg-orange-50 text-orange-700 p-2.5 rounded-md text-xs flex items-start gap-2 border border-orange-200">
                <AlertTriangle size={16} className="shrink-0" />
                <span><strong>Caution:</strong> Selecting a Strapping Pin (0, 2, 5, 12, 15) may cause boot issues on the ESP32.</span>
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors">
              {isPending ? 'Approve & Save' : 'Save Config'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal 
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        type={confirmModalState.type}
        confirmText={confirmModalState.confirmText}
        onConfirm={confirmModalState.onConfirm}
        onCancel={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
