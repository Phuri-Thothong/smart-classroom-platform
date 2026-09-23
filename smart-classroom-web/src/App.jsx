import { useState, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, Clock, Users, Zap, UserCheck,
  ServerCrash, Lightbulb, Wind, CheckCircle, Activity, Filter, Plus, X
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const API_BASE_URL = "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [devices, setDevices] = useState([]);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [telemetryData, setTelemetryData] = useState([]);
  const [selectedGraphNode, setSelectedGraphNode] = useState('');
  const [deviceStatus, setDeviceStatus] = useState({});

  const [selectedRoom, setSelectedRoom] = useState('All');
  const [selectedType, setSelectedType] = useState('All');

  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false);
  const [newRoom, setNewRoom] = useState({ id: '', name: '' });

  const uniqueRooms = ['All', ...new Set(devices.map(d => d.room_id).filter(Boolean))];
  
  const filteredDevices = devices.filter(d => {
    const matchRoom = selectedRoom === 'All' || d.room_id === selectedRoom;
    const matchType = selectedType === 'All' || (d.device_type && d.device_type.toLowerCase().includes(selectedType.toLowerCase().replace(' ', '_')));
    return matchRoom && matchType;
  });

  const fetchDevices = useCallback(() => {
    fetch(`${API_BASE_URL}/devices`)
      .then((res) => {
        if (!res.ok) throw new Error("Network error");
        return res.json();
      })
      .then((data) => {
        setDevices(data);
        setIsBackendOnline(true);
        if (!selectedGraphNode) {
          const activeNodes = data.filter(d => d.status !== 'pending');
          if (activeNodes.length > 0) setSelectedGraphNode(activeNodes[0].node_id);
        }
      })
      .catch((err) => {
        console.error("Fetch Error:", err);
        setIsBackendOnline(false);
      });
  }, [selectedGraphNode]);

  const fetchTelemetry = useCallback(() => {
    if (!selectedGraphNode) return;
    fetch(`${API_BASE_URL}/devices/${selectedGraphNode}/telemetry?limit=20`)
      .then(res => res.json())
      .then(data => {
        const formattedData = data.map(item => {
          const sensorData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
          const date = new Date(item.timestamp);
          return {
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            power: sensorData.power_usage_watts || 0
          };
        }).reverse();
        setTelemetryData(formattedData);
      })
      .catch(err => console.error("Telemetry Error:", err));
  }, [selectedGraphNode]);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.id || !newRoom.name) return alert("Please fill all fields");

    try {
      const res = await fetch(`${API_BASE_URL}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: newRoom.id, room_name: newRoom.name })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to create room");
      }
      
      alert(`Room ${newRoom.id} created successfully!`);
      setIsAddRoomOpen(false);
      setNewRoom({ id: '', name: '' });
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  const approveDevice = (deviceId) => {
    fetch(`${API_BASE_URL}/devices/${deviceId}/approve`, { method: 'POST' })
      .then(() => fetchDevices())
      .catch(err => {
        console.error("Approve Error:", err);
        alert("Failed to approve device.");
      });
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
    } catch (error) {
      console.error("Control Error:", error);
      setDeviceStatus(prev => ({ ...prev, [id]: currentStatus }));
      alert(`Failed to turn ${action} device ${id}`);
    }
  };

  const getDeviceIcon = (type) => {
    if (!type) return <Activity size={18} />;
    if (type.includes('light')) return <Lightbulb size={18} />;
    if (type.includes('air')) return <Wind size={18} />;
    if (type.includes('sensor') || type.includes('occupancy')) return <UserCheck size={18} />;
    return <Activity size={18} />;
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans relative">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800 text-slate-100 flex flex-col shadow-xl z-20">
        <div className="h-16 flex items-center px-6 border-b border-slate-700">
          <Zap className="text-blue-400 mr-3" size={24} />
          <h1 className="text-lg font-bold">Smart Class</h1>
        </div>
        <nav className="flex-1 py-6 px-3 space-y-2">
          {['dashboard', 'automation', 'users'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`w-full flex items-center px-4 py-3 rounded-lg capitalize transition-colors ${activeTab === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
              {tab === 'dashboard' ? <LayoutDashboard className="mr-3" size={20} /> : tab === 'automation' ? <Clock className="mr-3" size={20} /> : <Users className="mr-3" size={20} />}
              <span className="font-medium">{tab}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
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
            <div className="max-w-7xl mx-auto space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  
                  {/* Header & Filters */}
                  <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-semibold text-slate-800">Node Registry</h3>
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">Total: {filteredDevices.length}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Filter size={16} className="text-slate-400" />
                      <select 
                        value={selectedRoom} 
                        onChange={(e) => setSelectedRoom(e.target.value)}
                        className="text-sm border-slate-200 rounded-md shadow-sm bg-slate-50 focus:ring focus:ring-blue-200 px-3 py-1.5 outline-none"
                      >
                        {uniqueRooms.map(room => (
                          <option key={room} value={room}>{room === 'All' ? 'All Rooms' : `Room ${room}`}</option>
                        ))}
                      </select>
                      {/* Add Room Button */}
                      <button 
                        onClick={() => setIsAddRoomOpen(true)}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                        title="Add New Room"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Device Type Tabs */}
                  <div className="px-5 pt-3 pb-0 border-b border-slate-100 flex space-x-4 overflow-x-auto">
                    {['All', 'Lighting', 'Air Control', 'Sensor'].map(type => (
                      <button 
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${selectedType === type ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                          <th className="p-4 font-medium">Device</th>
                          <th className="p-4 font-medium">Type</th>
                          <th className="p-4 font-medium">Status</th>
                          <th className="p-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredDevices.length === 0 ? (
                          <tr><td colSpan="4" className="text-center py-8 text-slate-400">No devices match your filter</td></tr>
                        ) : (
                          filteredDevices.map(device => {
                            const isPending = device.status === 'pending';
                            const isOn = deviceStatus[device.node_id] || false;
                            const isController = device.device_type === 'lighting' || device.device_type === 'air_control';

                            return (
                              <tr key={device.node_id} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4">
                                  <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-lg ${isPending ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600'}`}>
                                      {getDeviceIcon(device.device_type)}
                                    </div>
                                    <div>
                                      <p className="font-medium text-slate-800">{device.device_name || device.node_id}</p>
                                      <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
                                        <span>{device.node_id}</span>
                                        {device.room_id && (
                                          <>
                                            <span>•</span>
                                            <span className="font-medium text-slate-500">{device.room_id}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded uppercase">{device.device_type}</span>
                                </td>
                                <td className="p-4">
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${isPending ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isPending ? 'bg-yellow-500' : 'bg-green-500'}`}></span>
                                    {isPending ? 'Pending' : 'Active'}
                                  </span>
                                </td>
                                <td className="p-4 text-right flex justify-end items-center h-full">
                                  {isPending ? (
                                    <button onClick={() => approveDevice(device.node_id)} className="flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded shadow-sm transition-colors">
                                      <CheckCircle size={14} className="mr-1" /> Approve
                                    </button>
                                  ) : isController ? (
                                    <button onClick={() => toggleDevice(device.node_id, isOn)} className={`w-11 h-6 rounded-full relative flex items-center transition-colors duration-300 focus:outline-none ${isOn ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                      <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isOn ? 'translate-x-6' : 'translate-x-1'}`}></div>
                                    </button>
                                  ) : (
                                    <span className="text-xs text-slate-400">View Only</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">System Alerts</h3>
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-lg p-6">
                    <div className="text-center">
                      <ServerCrash className="mx-auto text-slate-300 mb-2" size={32} />
                      <p className="text-sm font-medium text-slate-500">No critical issues</p>
                      <p className="text-xs text-slate-400 mt-1">All systems operational</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-semibold text-slate-800">Energy & Telemetry Trends</h3>
                  <select value={selectedGraphNode} onChange={(e) => setSelectedGraphNode(e.target.value)} className="text-sm border-slate-300 rounded-md shadow-sm bg-slate-50 focus:ring focus:ring-slate-200 px-3 py-1.5">
                    {devices.filter(d => d.status !== 'pending').map(d => (
                      <option key={d.node_id} value={d.node_id}>{d.device_name || d.node_id}</option>
                    ))}
                  </select>
                </div>
                
                <div className="h-64 w-full">
                  {telemetryData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400">Waiting for data...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={telemetryData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Line type="monotone" dataKey="power" name="Power (W) / Value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400">Module under construction</div>
          )}
        </div>
      </main>

      {/* Add Room Modal */}
      {isAddRoomOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-semibold text-lg">Add New Room</h3>
              <button onClick={() => setIsAddRoomOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddRoom} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Room ID</label>
                <input 
                  type="text" 
                  placeholder="e.g. R202" 
                  value={newRoom.id}
                  onChange={(e) => setNewRoom({...newRoom, id: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Room Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Lecture Room 2" 
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({...newRoom, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="pt-2 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddRoomOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Save Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
