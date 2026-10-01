import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import AddRoomModal from './components/AddRoomModal';
import DeviceSetupModal from './components/DeviceSetupModal';
import ManageRoomsModal from './components/ManageRoomsModal';
import ScheduleManager from './components/ScheduleManager';
import AddClassModal from './components/AddClassModal';
import RuleManager from './components/RuleManager';
import DashboardTab from './components/DashboardTab';

const API_BASE_URL = "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('smartclass_tab') || 'dashboard');
  const [devices, setDevices] = useState([]);
  const [roomsList, setRoomsList] = useState([]);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  
  // States สำหรับ Dashboard
  const [deviceStatus, setDeviceStatus] = useState({});
  const [gatewayStatus, setGatewayStatus] = useState({});
  
  // States สำหรับ Modals
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [isManageRoomsOpen, setIsManageRoomsOpen] = useState(false);
  const [isDeviceSetupOpen, setIsDeviceSetupOpen] = useState(false);
  const [setupDevice, setSetupDevice] = useState(null);
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  
  // State กระตุ้นการดึงข้อมูล Automation
  const [scheduleRefreshCount, setScheduleRefreshCount] = useState(0);

  // ==========================================
  // Core Data Fetching
  // ==========================================
  const fetchRooms = useCallback(() => {
    fetch(`${API_BASE_URL}/rooms`)
      .then(res => res.json())
      .then(data => setRoomsList(data))
      .catch(err => console.error("Rooms Fetch Error:", err));
  }, []);

  const fetchGateways = useCallback(() => {
    fetch(`${API_BASE_URL}/gateways/status`)
      .then(res => res.json())
      .then(data => setGatewayStatus(data))
      .catch(err => console.error("Gateway Fetch Error:", err));
  }, []);

  const fetchDevices = useCallback(() => {
    fetch(`${API_BASE_URL}/devices`)
      .then(res => {
        if (!res.ok) throw new Error("Network error");
        return res.json();
      })
      .then(data => {
        setDevices(data);
        setIsBackendOnline(true);
      })
      .catch(err => {
        console.error("Fetch Error:", err);
        setIsBackendOnline(false);
      });
  }, []);

  useEffect(() => {
    fetchRooms();
    fetchDevices();
    fetchGateways();
    const interval = setInterval(() => {
      fetchDevices();
      fetchGateways();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchDevices, fetchGateways, fetchRooms]);

  useEffect(() => {
    localStorage.setItem('smartclass_tab', activeTab);
  }, [activeTab]);

  // ==========================================
  // Action Handlers
  // ==========================================
  const handleSaveRoom = async (newRoom) => {
    try {
      const res = await fetch(`${API_BASE_URL}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: newRoom.id, room_name: newRoom.name })
      });
      if (!res.ok) throw new Error("Failed to create room");
      setIsAddRoomOpen(false);
      fetchRooms();
    } catch { alert("Error saving room"); }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm(`Are you sure you want to delete room ${roomId}? Devices will be unassigned.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete room");
      fetchRooms();
      fetchDevices(); 
    } catch { alert("Error deleting room"); }
  };

  const handleSaveDeviceConfig = async (configData, isNewApproval) => {
    const endpoint = isNewApproval ? 'approve' : 'config';
    try {
      const res = await fetch(`${API_BASE_URL}/devices/${configData.device_id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      if (!res.ok) throw new Error("Failed to save configuration");
      setIsDeviceSetupOpen(false);
      fetchDevices();
    } catch { alert("Error saving device configuration"); }
  };

  const toggleDevice = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    const action = newStatus ? "ON" : "OFF";
    setDeviceStatus(prev => ({ ...prev, [id]: newStatus }));
    try {
      const res = await fetch(`${API_BASE_URL}/devices/${id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (!res.ok) throw new Error("API error");
    } catch {
      setDeviceStatus(prev => ({ ...prev, [id]: currentStatus }));
    }
  };

  const deleteDevice = async (deviceId) => {
    if (!window.confirm(`Are you sure you want to delete device: ${deviceId}?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/devices/${deviceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete device");
      fetchDevices();
    } catch { alert("Failed to delete device."); }
  };

  const handleSaveClass = () => {
    setIsAddClassOpen(false);
    setScheduleRefreshCount(prev => prev + 1);
  };

  // ==========================================
  // Layout & Rendering
  // ==========================================
  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans relative">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10">
          <h2 className="text-xl font-semibold capitalize">{activeTab}</h2>
          <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium border ${isBackendOnline ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            <span className={`w-2 h-2 rounded-full mr-2 ${isBackendOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            {isBackendOnline ? 'Platform Online' : 'Backend Disconnected'}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          {activeTab === 'dashboard' ? (
            <DashboardTab 
              devices={devices} roomsList={roomsList} gatewayStatus={gatewayStatus} deviceStatus={deviceStatus}
              onToggleDevice={toggleDevice} onDeleteDevice={deleteDevice}
              onOpenAddRoom={() => setIsAddRoomOpen(true)}
              onOpenManageRooms={() => setIsManageRoomsOpen(true)}
              onOpenDeviceSetup={(device) => { setSetupDevice(device); setIsDeviceSetupOpen(true); }}
            />
          ) : activeTab === 'automation' ? (
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-xl font-bold text-slate-800 mb-2">Automation & Schedules</h3>
                <p className="text-slate-500 mb-6">Manage sensor conditions and timetables for automated device control.</p>
                <ScheduleManager 
                  roomsList={roomsList} 
                  onAddClick={() => setIsAddClassOpen(true)} 
                  refreshTrigger={scheduleRefreshCount} 
                />
                <RuleManager devices={devices} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">Module under construction</div>
          )}
        </div>
      </main>

      <AddRoomModal isOpen={isAddRoomOpen} onClose={() => setIsAddRoomOpen(false)} onSave={handleSaveRoom} />
      <ManageRoomsModal isOpen={isManageRoomsOpen} onClose={() => setIsManageRoomsOpen(false)} roomsList={roomsList} onDeleteRoom={handleDeleteRoom} />
      
      <DeviceSetupModal 
        key={isDeviceSetupOpen ? `setup-${setupDevice?.node_id}` : 'setup-closed'}
        isOpen={isDeviceSetupOpen} 
        onClose={() => setIsDeviceSetupOpen(false)} 
        onSave={handleSaveDeviceConfig} 
        device={setupDevice} 
        roomsList={roomsList} 
      />
      <AddClassModal 
        isOpen={isAddClassOpen} 
        onClose={() => setIsAddClassOpen(false)} 
        onSave={handleSaveClass} 
        roomsList={roomsList} 
      />
    </div>
  );
}
