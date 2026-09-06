import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Clock, 
  Users, 
  Zap, 
  UserCheck,
  Power,
  AlertTriangle,
  ServerCrash,
  Lightbulb,
  Wind
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // State จำลองสำหรับอุปกรณ์ (ครอบคลุม 4 ประเภทโหนด)
  const [devices, setDevices] = useState([
    { id: 'light-001', name: 'Front Lighting', type: 'Lighting Node', status: 'online', isOn: true, controllable: true },
    { id: 'ac-001', name: 'Air Conditioner 1', type: 'Air Control Node', status: 'online', isOn: false, controllable: true },
    { id: 'occ-001', name: 'Ceiling Radar (HLK-LD2410)', type: 'Occupancy Node', status: 'online', isOn: true, controllable: false },
    { id: 'energy-001', name: 'Main Power Meter', type: 'Energy Node', status: 'offline', isOn: false, controllable: false },
  ]);

  const toggleDevice = (id) => {
    setDevices(devices.map(dev => 
      dev.id === id && dev.status === 'online' && dev.controllable ? { ...dev, isOn: !dev.isOn } : dev
    ));
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
            <div className="flex items-center px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm font-medium border border-green-200">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
              Platform Online
            </div>
          </div>
        </header>

        {/* Scrollable Workspace */}
        <div className="flex-1 overflow-auto p-8">
          
          {activeTab === 'dashboard' && (
            <div className="max-w-7xl mx-auto space-y-6">
              
              {/* 1. Real-time Overview (Grid for 4 Node Types) */}
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
                
                {/* 2. Device Node Registry & Control (Cards) */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Node Registry & Control</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {devices.map((device) => (
                      <div key={device.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg bg-slate-50">
                        <div className="flex items-center space-x-4">
                          <div className={`p-2 rounded-md ${device.status === 'online' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {device.type === 'Lighting Node' ? <Lightbulb size={20} /> :
                             device.type === 'Air Control Node' ? <Wind size={20} /> :
                             device.type === 'Occupancy Node' ? <UserCheck size={20} /> : <Zap size={20} />}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{device.name}</p>
                            <div className="flex items-center mt-1">
                              <span className={`w-2 h-2 rounded-full mr-1.5 ${device.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                              <span className="text-xs text-slate-500">{device.type}</span>
                            </div>
                          </div>
                        </div>
                        {/* Render Toggle Button only for Controllable Nodes */}
                        {device.controllable ? (
                          <button 
                            onClick={() => toggleDevice(device.id)}
                            disabled={device.status === 'offline'}
                            className={`w-12 h-6 rounded-full transition-colors relative flex items-center ${device.status === 'offline' ? 'bg-slate-200 cursor-not-allowed' : device.isOn ? 'bg-slate-700' : 'bg-slate-300'}`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${device.isOn ? 'translate-x-7' : 'translate-x-1'}`}></div>
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-200 px-2 py-1 rounded">Sensor</span>
                        )}
                      </div>
                    ))}
                  </div>
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
                    <div className="flex items-start p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg">
                      <AlertTriangle className="text-yellow-600 mt-0.5 mr-3" size={18} />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">Unusual Power Spike</p>
                        <p className="text-xs text-yellow-700 mt-1">Energy consumption exceeded 3000 W limit.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Data Visualization (Placeholder) */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-slate-800">Energy Consumption Trends</h3>
                  <select className="text-sm border-slate-300 rounded-md shadow-sm bg-slate-50 focus:border-slate-500 focus:ring focus:ring-slate-200">
                    <option>Today</option>
                    <option>Last 7 Days</option>
                  </select>
                </div>
                <div className="h-64 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400">
                  <p>[ Chart.js / Recharts Integration Area ]</p>
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
