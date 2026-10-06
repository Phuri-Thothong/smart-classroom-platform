import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ServerCrash, Lightbulb, Wind, CheckCircle, Activity, Filter, Plus, UserCheck, Trash2, AlertTriangle, Settings, Edit3, Thermometer, Power, Terminal, ChevronDown, X, RotateCcw, ShieldAlert } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ConfirmModal from './ConfirmModal';
import BlocklistModal from './BlocklistModal';
import { useToast } from '../contexts/ToastContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function DashboardTab({
  devices, roomsList, gatewayStatus,
  onToggleDevice, onDeleteDevice, onOpenAddRoom, onOpenManageRooms, onOpenDeviceSetup
}) {
  const [telemetryData, setTelemetryData] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [liveDevices, setLiveDevices] = useState(devices);
  const [logFilter, setLogFilter] = useState('ALL');
  const [selectedGraphNode, setSelectedGraphNode] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [timeRange, setTimeRange] = useState('20');
  const [selectedMetric, setSelectedMetric] = useState('power');
  const [isBlocklistOpen, setIsBlocklistOpen] = useState(false);
  const lockedNodesRef = useRef(new Set());

  // --- เพิ่ม State สำหรับควบคุม ConfirmModal ---
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'danger',
    confirmText: 'Confirm',
    onConfirm: () => {}
  });

  const { showToast } = useToast();
  
  const uniqueRooms = useMemo(() => ['All', ...new Set(roomsList.map(r => r.room_id))], [roomsList]);
  
  const filteredDevices = useMemo(() => {
    const result = liveDevices.filter(d => {
      const matchRoom = selectedRoom === 'All' || d.room_id === selectedRoom;  
      let matchType = true;
      if (selectedType !== 'All') {
        const targetType = selectedType.toLowerCase().replace(' ', '_');
        const deviceType = (d.device_type || '').toLowerCase();
        matchType = deviceType.includes(targetType);
      }
      return matchRoom && matchType;
    });
    return result.sort((a, b) => {
      const roomA = a.room_id || 'Z_Unassigned';
      const roomB = b.room_id || 'Z_Unassigned';
      if (roomA === roomB) {
        return (a.node_id || '').localeCompare(b.node_id || '');
      }
      return roomA.localeCompare(roomB);
    });
  }, [liveDevices, selectedRoom, selectedType]);

  const activeControllers = useMemo(() => {
    return filteredDevices.filter(d => d.status !== 'pending' && (d.device_type === 'lighting' || d.device_type === 'air_control'));
  }, [filteredDevices]);

  const controllersByRoom = useMemo(() => {
    const grouped = {};
    activeControllers.forEach(device => {
      const room = device.room_id || 'Unassigned';
      if (!grouped[room]) grouped[room] = [];
      grouped[room].push(device);
    });
    return grouped;
  }, [activeControllers]);

  const [expandedRooms, setExpandedRooms] = useState(() => {
    const firstRoom = Object.keys(controllersByRoom || {})[0];
    return firstRoom ? [firstRoom] : [];
  });

  const toggleRoomCollapse = (room) => {
    setExpandedRooms(prev => 
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    );
  };

  const graphNodes = useMemo(() => {
    return filteredDevices.filter(d => {
      if (d.status === 'pending') return false;
      if (selectedMetric === 'power') return d.device_type === 'energy_node';
      if (['temperature', 'humidity', 'light_lux'].includes(selectedMetric)) {
        return d.device_type === 'multi_sensor';
      }
      return false;
    });
  }, [filteredDevices, selectedMetric]);

  const activeGraphNode = useMemo(() => {
    if (graphNodes.length === 0) return '';
    const isValid = graphNodes.some(n => n.node_id === selectedGraphNode);
    return isValid ? selectedGraphNode : graphNodes[0].node_id;
  }, [graphNodes, selectedGraphNode]);

  const offlineNodes = useMemo(() => filteredDevices.filter(d => d.status === 'offline').map(d => d.node_id), [filteredDevices]);
  const offlineCount = offlineNodes.length; 

  const offlineGateways = useMemo(() => Object.entries(gatewayStatus).filter(([, status]) => status === 'offline').map(([id]) => id), [gatewayStatus]);
  const offlineGatewaysCount = offlineGateways.length;

  const fetchTelemetryAndLogs = useCallback(() => {
    if (activeGraphNode) {
      fetch(`${API_BASE_URL}/devices/${activeGraphNode}/telemetry?limit=${timeRange}`)
        .then(res => res.json())
        .then(data => {
          const formattedData = data.map(item => {
            const sensorData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
            const date = new Date(item.timestamp);
            let value = 0;
            if (selectedMetric === 'power') {
              value = sensorData.power_usage_watts || 0;
            } else if (selectedMetric === 'temperature') {
              value = sensorData.temperature || 0;
            } else if (selectedMetric === 'humidity') {
              value = sensorData.humidity || 0;
            } else if (selectedMetric === 'light_lux') {
              value = sensorData.light_lux || 0;
            }
            return {
              time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              value: value
            };
          }).reverse();
          setTelemetryData(formattedData);
        }).catch(() => {});
    }

    fetch(`${API_BASE_URL}/logs?limit=100`)
      .then(res => res.json())
      .then(data => {
        const formattedLogs = data.map(log => {
          const logDate = new Date(log.timestamp);
          const today = new Date();
          const isToday = logDate.toDateString() === today.toDateString();
          const dateStr = isToday ? 'Today' : logDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          const timeStr = logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return {
            id: log.id,
            time: `${dateStr}, ${timeStr}`,
            source: log.source,
            type: log.log_type,
            msg: log.message
          };
        });
        setSystemLogs(formattedLogs);
      }).catch(() => {});

    fetch(`${API_BASE_URL}/devices`)
      .then(res => res.json())
      .then(data => {
        setLiveDevices(prevDevices => {
          return data.map(apiDevice => {
            if (lockedNodesRef.current.has(apiDevice.node_id)) {
              const existing = prevDevices.find(d => d.node_id === apiDevice.node_id);
              return existing ? { ...apiDevice, device_state: existing.device_state } : apiDevice;
            }
            return apiDevice; 
          });
        });
      })
      .catch(() => {});
  }, [activeGraphNode, timeRange, selectedMetric]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'ALL') return systemLogs;
    return systemLogs.filter(log => log.source === logFilter);
  }, [systemLogs, logFilter]);

  useEffect(() => {
    fetchTelemetryAndLogs();
    const interval = setInterval(fetchTelemetryAndLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchTelemetryAndLogs]);

  const getDeviceIcon = (type) => {
    if (!type) return <Activity size={18} />;
    if (type.includes('light')) return <Lightbulb size={18} />;
    if (type.includes('air')) return <Wind size={18} />;
    if (type.includes('occupancy')) return <UserCheck size={18} />;
    if (type.includes('multi')) return <Thermometer size={18} />;
    if (type.includes('sensor')) return <Thermometer size={18} />;
    return <Activity size={18} />;
  };

  const getLogColor = (type, source) => {
    if (type === 'WARN' || type === 'ERROR') return 'text-amber-400';
    if (source === 'SCHEDULE') return 'text-purple-400';
    if (source === 'RULE') return 'text-emerald-400';
    if (source === 'MANUAL') return 'text-blue-400';
    if (source === 'SYSTEM') return 'text-slate-300 font-bold';
    return 'text-slate-400';
  };

  const handleToggle = (nodeId, currentIsOn) => {
    lockedNodesRef.current.add(nodeId);
    setLiveDevices(prev => prev.map(d => 
      d.node_id === nodeId ? { ...d, device_state: currentIsOn ? 'OFF' : 'ON' } : d
    ));
    onToggleDevice(nodeId, currentIsOn);
    setTimeout(() => {
      lockedNodesRef.current.delete(nodeId);
    }, 3000);
  };

  const handleReject = (deviceId) => {
    setModalState({
      isOpen: true,
      title: 'Reject Device',
      message: `Are you sure you want to REJECT ${deviceId}?\nThis will block the device from the system.`,
      type: 'danger',
      confirmText: 'Yes, Reject',
      onConfirm: () => {
        fetch(`${API_BASE_URL}/devices/${deviceId}/reject`, { method: 'POST' })
          .then(() => {
            fetchTelemetryAndLogs();
            showToast(`Device ${deviceId} has been rejected.`, 'success');
          })
          .catch(() => showToast('Failed to reject device', 'error'));
        setModalState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleFactoryReset = (deviceId) => {
    setModalState({
      isOpen: true,
      title: 'Factory Reset Hardware',
      message: `WARNING: This will wipe the hardware memory of ${deviceId} and remove it from the platform. Continue?`,
      type: 'warning',
      confirmText: 'Yes, Reset',
      onConfirm: () => {
        fetch(`${API_BASE_URL}/devices/${deviceId}/factory-reset`, { method: 'POST' })
          .then(() => {
            fetchTelemetryAndLogs();
            showToast(`Factory reset command sent to ${deviceId}`, 'success');
          })
          .catch(() => showToast('Failed to execute factory reset', 'error'));
        setModalState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* ---------------- 1. QUICK CONTROLS ---------------- */}
      {Object.keys(controllersByRoom).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600">
              <Power size={18} />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">Quick Controls</h3>
          </div>
          
          <div className="space-y-4">
            {Object.entries(controllersByRoom).map(([room, devicesInRoom]) => {
              const isExpanded = expandedRooms.includes(room);
              return (
                <div key={room} className="bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden">
                  <div 
                    onClick={() => toggleRoomCollapse(room)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 transition-colors"
                  >
                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isExpanded ? 'bg-blue-500' : 'bg-slate-400'}`}></div>
                      Room: {room} <span className="text-xs font-normal text-slate-500 ml-2">({devicesInRoom.length} devices)</span>
                    </h4>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                  
                  <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100 p-4 pt-0' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
                      {devicesInRoom.map(device => {
                        const isOn = device.device_state === 'ON';
                        const isOffline = device.status === 'offline';
                        
                        return (
                          <div key={`ctrl-${device.node_id}`} className={`border rounded-xl p-4 flex flex-col justify-between transition-colors bg-white ${isOn && !isOffline ? 'border-blue-300 shadow-sm ring-1 ring-blue-100' : 'border-slate-200'} ${isOffline ? 'opacity-60 grayscale' : ''}`}>
                            <div className="flex justify-between items-start mb-3">
                              <div className={`p-2 rounded-lg ${isOn && !isOffline ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                                {getDeviceIcon(device.device_type)}
                              </div>
                              <button 
                                onClick={() => handleToggle(device.node_id, isOn)} 
                                disabled={isOffline}
                                className={`w-11 h-6 rounded-full relative flex items-center transition-colors duration-300 focus:outline-none ${isOn && !isOffline ? 'bg-blue-600' : 'bg-slate-300'} ${isOffline ? 'cursor-not-allowed' : ''}`}
                              >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isOn && !isOffline ? 'translate-x-6' : 'translate-x-1'}`}></div>
                              </button>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 text-sm truncate">{device.device_name || device.node_id}</p>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-slate-400 font-mono">{device.node_id.substring(0,8)}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isOn && !isOffline ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {isOffline ? 'OFFLINE' : isOn ? 'ON' : 'OFF'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------- 2. MIDDLE LAYOUT ---------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-120">
        
        {/* LEFT: Device Management */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-120">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-slate-800">Device Management</h3>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">Total: {filteredDevices.length}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Filter size={16} className="text-slate-400" />
              <select 
                value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)}
                className="text-sm border-slate-200 rounded-md shadow-sm bg-slate-50 focus:ring focus:ring-blue-200 px-3 py-1.5 outline-none max-w-xs"
              >
                {uniqueRooms.map(room => (
                  <option key={room} value={room}>{room === 'All' ? 'All Rooms' : `Room ${room}`}</option>
                ))}
              </select>
              <div className="flex space-x-1 border-l pl-2 border-slate-200">
                <button onClick={() => setIsBlocklistOpen(true)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors" title="View Blocklist">
                  <ShieldAlert size={18} />
                </button>
                <button onClick={onOpenAddRoom} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Add Room"><Plus size={18} /></button>
                <button onClick={onOpenManageRooms} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md transition-colors" title="Manage Rooms"><Edit3 size={18} /></button>
              </div>
            </div>
          </div>

          <div className="px-5 pt-3 pb-0 border-b border-slate-100 flex space-x-4 overflow-x-auto shrink-0">
            {['All', 'Lighting', 'Air Control', 'Occupancy', 'Energy Node'].map(type => (
              <button 
                key={type} onClick={() => setSelectedType(type)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${selectedType === type ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                {type}
              </button>
            ))}
          </div>
          
          <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse relative">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur z-10 shadow-sm">
                <tr className="text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-3.5 font-medium">Device Info</th>
                  <th className="p-3.5 font-medium">Type</th>
                  <th className="p-3.5 font-medium">Status</th>
                  <th className="p-3.5 font-medium text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredDevices.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-8 text-slate-400">No devices match your filter</td></tr>
                ) : (
                  filteredDevices.map(device => {
                    const isPending = device.status === 'pending';
                    const isOffline = device.status === 'offline';
                    
                    const iconBgColor = isPending ? 'bg-amber-100 text-amber-600' : isOffline ? 'bg-slate-100 text-slate-400' : 'bg-blue-100 text-blue-600';
                    const badgeColor = isOffline ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    const dotColor = isOffline ? 'bg-slate-400' : 'bg-emerald-500';

                    return (
                      <tr key={device.node_id} className={`hover:bg-slate-50 transition-colors ${isOffline ? 'opacity-70' : ''}`}>
                        <td className="p-3.5">
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-lg shrink-0 ${iconBgColor}`}>{getDeviceIcon(device.device_type)}</div>
                            <div className="min-w-0">
                              <p className={`font-medium truncate ${isOffline ? 'text-slate-500' : 'text-slate-800'}`}>{device.device_name || device.node_id}</p>
                              <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-0.5 truncate">
                                <span className="truncate">{device.node_id}</span>
                                {device.room_id ? (
                                  <><span className="shrink-0">•</span><span className="font-medium text-slate-500 truncate">{device.room_id}</span></>
                                ) : (
                                  <><span className="shrink-0">•</span><span className="italic text-amber-600">Unassigned</span></>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded uppercase tracking-wider">{device.device_type}</span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          {isPending ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-amber-500"></span>Pending Setup
                            </span>
                          ) : (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${badgeColor}`}>
                              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${dotColor}`}></span>{isOffline ? 'Offline' : 'Online'}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right whitespace-nowrap">
                          {isPending ? (
                            <div className="flex justify-end items-center gap-1.5">
                              <button onClick={() => handleReject(device.node_id)} className="flex items-center px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded shadow-sm transition-colors border border-red-100" title="Reject Device">
                                <X size={14} className="mr-1" /> Reject
                              </button>
                              <button onClick={() => onOpenDeviceSetup(device)} className="flex items-center px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded shadow-sm transition-colors">
                                <CheckCircle size={14} className="mr-1.5" /> Approve
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end space-x-1">
                              <button onClick={() => onOpenDeviceSetup(device)} className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors" title="Settings"><Settings size={16} /></button>
                              
                              <button onClick={() => handleFactoryReset(device.node_id)} disabled={isOffline} className={`p-1.5 rounded-md transition-colors ${isOffline ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:bg-orange-50 hover:text-orange-600'}`} title="Factory Reset (Wipe Hardware)">
                                <RotateCcw size={16} />
                              </button>
                              
                              <button onClick={() => onDeleteDevice(device.node_id)} className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors" title="Soft Delete"><Trash2 size={16} /></button>
                            </div>
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

        {/* RIGHT: Alerts & Logs */}
        <div className="lg:col-span-1 flex flex-col gap-4 h-120">
          
          {/* SYSTEM ALERTS */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col shrink-0 min-h-36">
            <h3 className="text-base font-semibold text-slate-800 mb-2">System Alerts</h3>
            <div className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 
              ${offlineGatewaysCount > 0 ? 'border-red-500 bg-red-50' : offlineCount > 0 ? 'border-orange-300 bg-orange-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}
            >
              {offlineGatewaysCount > 0 ? (
                <div className="text-center w-full">
                  <ServerCrash className="mx-auto text-red-600 mb-1 animate-pulse" size={24} />
                  <p className="text-xs font-bold text-red-700">CRITICAL ERROR</p>
                  <p className="text-[11px] font-semibold text-red-600 mb-1">{offlineGatewaysCount} Gateway(s) Offline</p>
                  <div className="text-[10px] text-red-500 font-mono bg-white/60 rounded px-2 py-1 mt-1 inline-block">
                    {offlineGateways.join(', ')}
                  </div>
                </div>
              ) : offlineCount > 0 ? (
                <div className="text-center w-full">
                  <ServerCrash className="mx-auto text-orange-500 mb-1" size={24} />
                  <p className="text-xs font-bold text-orange-700">{offlineCount} Device(s) Offline</p>
                  <div className="text-[10px] text-orange-600 font-mono bg-white/60 rounded px-2 py-1 mt-1 inline-block text-left max-w-full truncate">
                    {offlineNodes.slice(0, 3).join(', ')}
                    {offlineNodes.length > 3 ? ` +${offlineNodes.length - 3} more` : ''}
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <CheckCircle className="mx-auto text-emerald-500 mb-1" size={24} />
                  <p className="text-xs font-bold text-emerald-700">System Healthy</p>
                  <p className="text-[10px] font-medium text-emerald-600 mt-0.5">All devices are online.</p>
                </div>
              )}
            </div>
          </div>

          {/* SYSTEM ACTIVITY LOG */}
          <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-100">System Activity Log</h3>
              </div>
              <select 
                value={logFilter} 
                onChange={(e) => setLogFilter(e.target.value)}
                className="bg-slate-800 text-slate-300 text-[10px] uppercase font-bold border border-slate-700 rounded px-2 py-1 outline-none cursor-pointer hover:border-slate-500 transition-colors"
              >
                <option value="ALL">All Logs</option>
                <option value="MANUAL">Manual Only</option>
                <option value="RULE">Rules Only</option>
                <option value="SCHEDULE">Schedules Only</option>
                <option value="SYSTEM">System Only</option>
              </select>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1 min-h-0">
              {filteredLogs.length === 0 ? (
                <div className="text-xs text-slate-500 text-center mt-4 font-mono">No {logFilter !== 'ALL' ? logFilter : ''} activities found...</div>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="text-[11px] font-mono border-l-2 border-slate-700 pl-2.5 py-0.5 hover:bg-slate-800/50 transition-colors rounded-r-md">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-slate-500">{log.time}</span>
                      <span className={`px-1.5 py-0.5 rounded bg-slate-800 font-bold text-[9px] ${getLogColor(log.type, log.source)}`}>
                        [{log.source}]
                      </span>
                    </div>
                    <div className="text-slate-300 wrap-break-words leading-relaxed">{log.msg}</div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ---------------- 3. FULL WIDTH BOTTOM (UNIVERSAL CHART) ---------------- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h3 className="text-lg font-semibold text-slate-800">Telemetry Data</h3>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* 1. Dropdown เลือกประเภทข้อมูล */}
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="text-sm border-slate-300 rounded-md shadow-sm bg-slate-50 focus:ring focus:ring-blue-200 px-3 py-1.5 outline-none font-semibold text-slate-700"
            >
              <option value="power">⚡ Power (Watts)</option>
              <option value="temperature">🌡️ Temperature (°C)</option>
              <option value="humidity">💧 Humidity (%)</option>
              <option value="light_lux">☀️ Light (Lux)</option>
            </select>

            {/* 2. Dropdown เลือกโหนด (จะเปลี่ยนรายการอัตโนมัติตาม Metric ที่เลือก) */}
            <select 
              value={activeGraphNode} 
              onChange={(e) => setSelectedGraphNode(e.target.value)} 
              disabled={graphNodes.length === 0}
              className="text-sm border-slate-300 rounded-md shadow-sm bg-slate-50 focus:ring focus:ring-slate-200 px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {graphNodes.length === 0 ? (
                <option value="">No Compatible Node Found</option>
              ) : (
                graphNodes.map(d => <option key={d.node_id} value={d.node_id}>{d.device_name || d.node_id}</option>)
              )}
            </select>

            {/* 3. Dropdown เลือกจำนวนจุด */}
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              disabled={graphNodes.length === 0}
              className="text-sm border-slate-300 rounded-md shadow-sm bg-slate-50 focus:ring focus:ring-slate-200 px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="10">Latest 10 points</option>
              <option value="20">Latest 20 points</option>
              <option value="50">Latest 50 points</option>
              <option value="100">Latest 100 points</option>
            </select>
          </div>
        </div>
        
        <div className={`h-64 w-full transition-opacity ${graphNodes.length === 0 ? 'opacity-40' : 'opacity-100'}`}>
          {graphNodes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
              <AlertTriangle className="text-amber-500 mb-2" size={28} />
              <p className="text-sm font-medium text-slate-600">No Target Node Found</p>
              <p className="text-xs text-slate-400 mt-1">Please onboard an equipment that supports this telemetry metric.</p>
            </div>
          ) : !activeGraphNode || telemetryData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
              Waiting for telemetry data stream...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={15}
                  label={{ value: 'Time (HH:MM:SS)', position: 'insideBottom', offset: -15, fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                />
                <YAxis 
                  axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }}
                  label={{ 
                    value: selectedMetric === 'power' ? 'Power (W)' : 
                           selectedMetric === 'temperature' ? 'Temp (°C)' : 
                           selectedMetric === 'humidity' ? 'Hum (%)' : 'Light (Lux)', 
                    angle: -90, position: 'insideLeft', offset: 15, fill: '#64748b', fontSize: 12, fontWeight: 500, style: { textAnchor: 'middle' } 
                  }}
                />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  name={
                    selectedMetric === 'power' ? 'Power (W)' : 
                    selectedMetric === 'temperature' ? 'Temp (°C)' : 
                    selectedMetric === 'humidity' ? 'Humidity (%)' : 'Light (Lux)'
                  } 
                  stroke={
                    selectedMetric === 'power' ? '#3b82f6' :
                    selectedMetric === 'temperature' ? '#ef4444' :
                    selectedMetric === 'humidity' ? '#0ea5e9' :
                    '#eab308'
                  } 
                  strokeWidth={2} 
                  dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} 
                  activeDot={{ r: 5 }} 
                  isAnimationActive={false} 
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <ConfirmModal 
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
        confirmText={modalState.confirmText}
        onConfirm={modalState.onConfirm}
        onCancel={() => setModalState(prev => ({ ...prev, isOpen: false }))}
      />
      <BlocklistModal 
        isOpen={isBlocklistOpen} 
        onClose={() => {
          setIsBlocklistOpen(false);
          fetchTelemetryAndLogs();
        }} 
      />
    </div>
  );
}
