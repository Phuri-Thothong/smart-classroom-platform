import { useState, useEffect, useCallback } from 'react';
import { Eye } from 'lucide-react';
import { useToast } from './contexts/ToastContext';
import { useAuth } from './contexts/AuthContext';
import { authFetch } from './utils/api';
import Sidebar from './components/Sidebar';
import LoginPage from './components/LoginPage';
import UsersTab from './components/UsersTab';
import ConfirmModal from './components/ConfirmModal';
import AddRoomModal from './components/AddRoomModal';
import DeviceSetupModal from './components/DeviceSetupModal';
import ManageRoomsModal from './components/ManageRoomsModal';
import ScheduleManager from './components/ScheduleManager';
import AddClassModal from './components/AddClassModal';
import RuleManager from './components/RuleManager';
import DashboardTab from './components/DashboardTab';

export default function App() {
  const { showToast } = useToast();
  const { user, isAdmin, isAuthLoading } = useAuth();

  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('smartclass_tab') || 'dashboard');
  const [devices, setDevices] = useState([]);
  const [roomsList, setRoomsList] = useState([]);
  const [isBackendOnline, setIsBackendOnline] = useState(true);

  const [deviceStatus, setDeviceStatus] = useState({});
  const [gatewayStatus, setGatewayStatus] = useState({});
  const [globalConfirm, setGlobalConfirm] = useState({
    isOpen: false, title: '', message: '', onConfirm: null
  });

  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [isManageRoomsOpen, setIsManageRoomsOpen] = useState(false);
  const [isDeviceSetupOpen, setIsDeviceSetupOpen] = useState(false);
  const [setupDevice, setSetupDevice] = useState(null);
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [scheduleRefreshCount, setScheduleRefreshCount] = useState(0);

  const effectiveTab = activeTab === 'users' && !isAdmin ? 'dashboard' : activeTab;

  // ==========================================
  // Core Data Fetching
  // ==========================================
  const fetchRooms = useCallback(() => {
    authFetch('/rooms')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (Array.isArray(data)) setRoomsList(data); })
      .catch(err => console.error("Rooms Fetch Error:", err.message));
  }, []);

  const fetchGateways = useCallback(() => {
    authFetch('/gateways/status')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data && typeof data === 'object') setGatewayStatus(data); })
      .catch(err => console.error("Gateway Fetch Error:", err.message));
  }, []);

  const fetchDevices = useCallback(() => {
    authFetch('/devices')
      .then(res => {
        if (res.status === 401) return null;
        if (!res.ok) throw new Error("Network error");
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setDevices(data);
          setIsBackendOnline(true);
        }
      })
      .catch(err => {
        console.error("Fetch Error:", err.message);
        setIsBackendOnline(false);
      });
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchRooms();
    fetchDevices();
    fetchGateways();
    const interval = setInterval(() => {
      fetchDevices();
      fetchGateways();
    }, 5000);
    return () => clearInterval(interval);
  }, [user, fetchDevices, fetchGateways, fetchRooms]);

  useEffect(() => {
    localStorage.setItem('smartclass_tab', effectiveTab);
  }, [effectiveTab]);

  // ==========================================
  // Action Handlers
  // ==========================================
  const handleSaveRoom = async (newRoom) => {
    try {
      const res = await authFetch('/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: newRoom.id, room_name: newRoom.name })
      });
      if (!res.ok) throw new Error("Failed to create room");
      setIsAddRoomOpen(false);
      fetchRooms();
      showToast("Room created successfully", "success");
    } catch (error) {
      showToast(`Error saving room: ${error.message}`, "error");
    }
  };

  const handleDeleteRoom = (roomId) => {
    setGlobalConfirm({
      isOpen: true,
      title: 'Delete Room?',
      message: `Are you sure you want to delete room ${roomId}?\nAll assigned devices will become unassigned.`,
      onConfirm: async () => {
        try {
          const res = await authFetch(`/rooms/${roomId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error("Failed to delete room");
          fetchRooms();
          fetchDevices();
          showToast(`Room ${roomId} deleted`, "success");
        } catch (error) {
          showToast(`Error deleting room: ${error.message}`, "error");
        } finally {
          setGlobalConfirm({ isOpen: false });
        }
      }
    });
  };

  const handleSaveDeviceConfig = async (configData, isNewApproval) => {
    const endpoint = isNewApproval ? 'approve' : 'config';
    try {
      const res = await authFetch(`/devices/${configData.device_id}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      if (!res.ok) throw new Error("Failed to save configuration");
      setIsDeviceSetupOpen(false);
      fetchDevices();
      showToast(isNewApproval ? "Device approved" : "Configuration saved", "success");
    } catch (error) {
      showToast(`Error saving configuration: ${error.message}`, "error");
    }
  };

  const toggleDevice = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    const action = newStatus ? "ON" : "OFF";
    setDeviceStatus(prev => ({ ...prev, [id]: newStatus }));
    try {
      const res = await authFetch(`/devices/${id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (!res.ok) throw new Error("API error");
    } catch (error) {
      console.error(`Control Error for ${id}:`, error.message);
      setDeviceStatus(prev => ({ ...prev, [id]: currentStatus }));
      showToast(`Failed to control device: ${error.message}`, "error");
    }
  };

  const deleteDevice = (deviceId) => {
    setGlobalConfirm({
      isOpen: true,
      title: 'Delete Node?',
      message: `Are you sure you want to permanently delete node:\n${deviceId}?`,
      onConfirm: async () => {
        try {
          const res = await authFetch(`/devices/${deviceId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error("Failed to delete device");
          fetchDevices();
          showToast("Device deleted successfully", "success");
        } catch (error) {
          showToast(`Failed to delete device: ${error.message}`, "error");
        } finally {
          setGlobalConfirm({ isOpen: false });
        }
      }
    });
  };

  const handleSaveClass = () => {
    setIsAddClassOpen(false);
    setScheduleRefreshCount(prev => prev + 1);
    showToast("Class schedule saved", "success");
  };

  // ==========================================
  // Auth Gate
  // ==========================================
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-300 text-sm">
        Verifying session...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // ==========================================
  // Layout & Rendering
  // ==========================================
  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans relative">
      <Sidebar activeTab={effectiveTab} setActiveTab={setActiveTab} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10">
          <h2 className="text-xl font-semibold capitalize">{effectiveTab}</h2>
          <div className="flex items-center gap-3">
            {!isAdmin && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                <Eye size={14} />
                Read-Only Mode
              </div>
            )}
            <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium border ${isBackendOnline ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${isBackendOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {isBackendOnline ? 'Platform Online' : 'Backend Disconnected'}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          {effectiveTab === 'dashboard' ? (
            <DashboardTab
              devices={devices} roomsList={roomsList} gatewayStatus={gatewayStatus} deviceStatus={deviceStatus}
              onToggleDevice={toggleDevice} onDeleteDevice={deleteDevice}
              onOpenAddRoom={() => setIsAddRoomOpen(true)}
              onOpenManageRooms={() => setIsManageRoomsOpen(true)}
              onOpenDeviceSetup={(device) => { setSetupDevice(device); setIsDeviceSetupOpen(true); }}
            />
          ) : effectiveTab === 'automation' ? (
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
            <UsersTab />
          )}
        </div>
      </main>

      {isAdmin && (
        <>
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
        </>
      )}

      <ConfirmModal
        isOpen={globalConfirm.isOpen}
        title={globalConfirm.title}
        message={globalConfirm.message}
        onConfirm={globalConfirm.onConfirm}
        onCancel={() => setGlobalConfirm({ isOpen: false })}
      />
    </div>
  );
}
