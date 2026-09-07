import { useState, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Clock, 
  Users, 
  Zap, 
  UserCheck,
  ServerCrash,
  Lightbulb,
  Wind,
  CheckCircle
} from 'lucide-react';
// นำเข้า Components จาก Recharts
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

const API_BASE_URL = "http://localhost:8000";

// ข้อมูลจำลองสำหรับวาดกราฟพลังงาน (เดี๋ยวเราจะดึงจาก API จริงในอนาคต)
const mockEnergyData = [
  { time: '08:00', power: 45 },
  { time: '09:00', power: 120 },
  { time: '10:00', power: 135 },
  { time: '11:00', power: 140 },
  { time: '12:00', power: 90 },
  { time: '13:00', power: 150 },
  { time: '14:00', power: 160 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [devices, setDevices] = useState([]);
  const [isBackendOnline, setIsBackendOnline] = useState(true);

  const fetchDevices = useCallback(() => {
    fetch(`${API_BASE_URL}/devices`)
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then((data) => {
        setDevices(data);
        setIsBackendOnline(true);
      })
      .catch((error) => {
        console.error("Error fetching devices:", error);
        setIsBackendOnline(false);
      });
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const approveDevice = (deviceId) => {
    fetch(`${API_BASE_URL}/devices/${deviceId}/approve`, { method: 'POST' })
      .then(() => {
        fetchDevices(); 
      })
      .catch((error) => {
        console.error("Error approving device:", error);
        alert("Failed to approve device.");
      });
  };

  const toggleDevice = (id) => {
    console.log(`Toggle command sent for ${id}`);
  };

  const getDeviceIcon = (deviceType) => {
    if (!deviceType) return <Zap size={20} />;
    const type = deviceType.toLowerCase();
    if (type.includes('light')) return <Lightbulb size={20} />;
    if (type.includes('air')) return <Wind size={20} />;
    if (type.includes('occupancy') || type.includes('radar')) return <UserCheck size={20} />;
    return <Zap size={20} />;
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 text-slate-100 flex flex-col shadow-xl z-20">
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
          <Zap className="text-blue-400 mr-3" size={24} />
          <h1 className="text-lg font-bold tracking-wide">Smart Class</h1>
        </div>
        <nav className="flex-1 py-6 px-3 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            <LayoutDashboard className="mr-3" size={20} />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('automation')}
            className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${activeTab === 'automation' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            <Clock className="mr-3" size={20} />
            <span className="font-medium">Automation</span>
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${activeTab === 'users' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            <Users className="mr-3" size={20} />
            <span className="font-medium">User Management</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10">
          <h2 className="text-xl font-semibold text-slate-800 capitalize">{activeTab}</h2>
          <div className="flex items-center space-x-3">
            <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium border ${isBackendOnline ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              <span className={`w-2 h-2 rounded-full mr-2 ${isBackendOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {isBackendOnline ? 'Platform Online' : 'Backend Disconnected'}
            </div>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <div className="flex-1 overflow-auto p-8">
          
          {activeTab === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-6">
              
              {/* 1. Real-time Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center">
                  <div className="p-4 bg-green-50 text-green-600 rounded-lg mr-4"><UserCheck size={28} /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Occupancy Status</p>
                    <p className="text-2xl font-bold text-slate-800">Detected</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center">
                  <div className="p-4 bg-yellow-50 text-yellow-600 rounded-lg mr-4"><Lightbulb size={28} /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Active Lights</p>
                    <p className="text-2xl font-bold text-slate-800">1 / 1</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center">
                  <div className="p-4 bg-sky-50 text-sky-600 rounded-lg mr-4"><Wind size={28} /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Air Control</p>
                    <p className="text-2xl font-bold text-slate-800">OFF</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center">
                  <div className="p-4 bg-red-50 text-red-600 rounded-lg mr-4"><Zap size={28} /></div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Power Usage</p>
                    <p className="text-2xl font-bold text-slate-800">120 W</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 2. Device Node Registry & Control */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Node Registry & Control</h3>
                    <span className="text-sm text-slate-500">Total Nodes: {devices.length}</span>
                  </div>
                  
                  {devices.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <p>No devices registered in database.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {devices.map((device) => {
                        const isOnline = true; 
                        const isPending = device.status === 'pending';
                        
                        return (
                          <div key={device.node_id} className={`flex items-center justify-between p-4 border rounded-lg ${isPending ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-100'}`}>
                            <div className="flex items-center space-x-4">
                              <div className={`p-2 rounded-md ${isPending ? 'bg-yellow-200 text-yellow-700' : 'bg-slate-700 text-white'}`}>
                                {getDeviceIcon(device.device_type)}
                              </div>
                              <div>
                                <p className="font-medium text-slate-800">{device.device_name || device.node_id}</p>
                                <div className="flex items-center mt-1">
                                  <span className={`w-2 h-2 rounded-full mr-1.5 ${isPending ? 'bg-yellow-500' : (isOnline ? 'bg-green-500' : 'bg-red-500')}`}></span>
                                  <span className="text-xs text-slate-500 uppercase tracking-wider">{isPending ? 'PENDING' : (device.device_type || 'Unknown')}</span>
                                </div>
                              </div>
                            </div>
                            
                            {isPending ? (
                              <button 
                                onClick={() => approveDevice(device.node_id)}
                                className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded shadow-sm transition-colors"
                              >
                                <CheckCircle size={14} className="mr-1" />
                                Approve
                              </button>
                            ) : (
                              (device.device_type === 'lighting' || device.device_type === 'air_control') ? (
                                <button 
                                  onClick={() => toggleDevice(device.node_id)}
                                  className="w-12 h-6 rounded-full bg-slate-300 relative flex items-center transition-colors hover:bg-slate-400"
                                >
                                  <div className="w-4 h-4 bg-white rounded-full shadow-md transform translate-x-1"></div>
                                </button>
                              ) : (
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-200 px-2 py-1 rounded">Sensor</span>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. Alerts & Notifications */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Alerts</h3>
                  <div className="space-y-4">
                    <div className="flex items-start p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                      <ServerCrash className="text-red-500 mt-0.5 mr-3" size={18} />
                      <div>
                        <p className="text-sm font-medium text-red-800">Energy Node Offline</p>
                        <p className="text-xs text-red-600 mt-1">Connection lost 10 mins ago.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Data Visualization (Recharts) */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-slate-800">Energy Consumption Trends</h3>
                  <select className="text-sm border-slate-300 rounded-md shadow-sm bg-slate-50 focus:border-slate-500 focus:ring focus:ring-slate-200">
                    <option>Today</option>
                    <option>Last 7 Days</option>
                  </select>
                </div>
                
                {/* Recharts Container */}
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mockEnergyData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="time" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                        dy={10} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="power" 
                        name="Power (W)"
                        stroke="#3b82f6" 
                        strokeWidth={3} 
                        dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                        activeDot={{ r: 6, fill: '#3b82f6' }} 
                        animationDuration={1500} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}

          {activeTab !== 'dashboard' && (
            <div className="flex items-center justify-center h-full text-slate-400">
              <p>Module under construction.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
