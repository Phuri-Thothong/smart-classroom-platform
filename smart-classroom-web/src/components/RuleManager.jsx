import { useState, useEffect } from 'react';
import { Settings, Trash2, Power, Plus, Activity, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function RuleManager({ devices }) {
  const { showToast } = useToast();
  const [rules, setRules] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '', sensor_node_id: '', sensor_key: '', 
    condition_operator: '>', condition_value: '', 
    target_node_id: '', action: 'ON'
  });

  const fetchRules = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/rules`);
      if (res.ok) setRules(await res.json());
    } catch (error) { 
      console.error("Error fetching rules:", error.message); 
    }
  };

  useEffect(() => { 
    let isMounted = true;
    fetch(`${API_BASE_URL}/rules`)
      .then(res => res.json())
      .then(data => { if (isMounted) setRules(data); })
      .catch(err => console.error("Error:", err.message));
    
    return () => { isMounted = false; };
  }, []);

  const approvedDevices = devices.filter(d => d.status !== 'pending');
  const triggerNodes = approvedDevices.filter(d => d.device_type === 'occupancy' || d.device_type === 'energy_node');
  const controllers = approvedDevices.filter(d => d.device_type === 'lighting' || d.device_type === 'air_control');
  
  const isBooleanKey = formData.sensor_key === 'occupancy';
  const hasSelectedSensor = Boolean(formData.sensor_node_id);
  const selectedSensorObj = triggerNodes.find(s => s.node_id === formData.sensor_node_id);
  const selectedSensorType = selectedSensorObj?.device_type || '';
  const selectedSensorRoom = selectedSensorObj?.room_id || '';
  const availableTargets = controllers.filter(c => c.room_id === selectedSensorRoom);

  const toggleRule = async (ruleId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/rules/${ruleId}/toggle`, { method: 'PUT' });
      if (!res.ok) throw new Error("API returned an error");
      fetchRules();
    } catch (error) { 
      showToast(`Failed to toggle rule: ${error.message}`, "error");
    }
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm("Delete this automation rule?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/rules/${ruleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("API returned an error");
      fetchRules();
      showToast("Automation rule deleted", "success");
    } catch (error) { 
      showToast(`Failed to delete rule: ${error.message}`, "error");
    }
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    
    const payloadData = {
      name: formData.name,
      sensor_node_id: formData.sensor_node_id,
      sensor_key: formData.sensor_key || (formData.sensor_node_id.includes('occupancy') ? 'occupancy' : 'power_usage_watts'),
      condition_operator: formData.condition_operator,
      condition_value: String(formData.condition_value),
      target_node_id: formData.target_node_id,
      action: formData.action
    };

    try {
      const res = await fetch(`${API_BASE_URL}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadData)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Backend Validation Error:", errorData);
        throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : "Failed to save rule into database");
      }

      setIsAdding(false);
      setFormData({ name: '', sensor_node_id: '', sensor_key: '', condition_operator: '>', condition_value: '', target_node_id: '', action: 'ON' });
      fetchRules();
      showToast("Automation rule created successfully", "success")
    } catch (error) { 
      showToast(`Error saving rule: ${error.message}`, "error");
    }
  };

  const handleSensorChange = (e) => {
    const newNodeId = e.target.value;
    const newSensorObj = triggerNodes.find(s => s.node_id === newNodeId);
    
    let defaultKey = '';
    let defaultOp = '>';
    let defaultVal = '';

    if (newSensorObj) {
      if (newSensorObj.device_type === 'occupancy') {
        defaultKey = 'occupancy';
        defaultOp = '==';
        defaultVal = 'TRUE';
      } else if (newSensorObj.device_type === 'energy_node') {
        defaultKey = 'power_usage_watts';
        defaultOp = '>';
        defaultVal = '100';
      }
    }

    setFormData({
      ...formData,
      sensor_node_id: newNodeId,
      sensor_key: defaultKey,
      condition_operator: defaultOp,
      condition_value: defaultVal,
      target_node_id: ''
    });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <div className="bg-emerald-600 p-1.5 rounded-lg text-white shadow-sm">
            <Activity size={20} />
          </div>
          Event-Driven Rules
        </h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className={`px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors flex items-center gap-2 ${
            isAdding 
              ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' 
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />} 
          {isAdding ? 'Cancel' : 'Create Rule'}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSaveRule} className="bg-slate-50 p-5 rounded-lg border border-slate-200 mb-6 space-y-4">
          <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Settings size={16} className="text-slate-400" />
            New Automation Rule
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Rule Name</label>
              <input type="text" required placeholder="e.g. Turn on AC when person detected"
                className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-50">
              <label className="block text-xs font-medium text-slate-500 mb-1">IF (Trigger Device)</label>
              <select required className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 bg-white"
                value={formData.sensor_node_id} onChange={handleSensorChange}>
                <option value="">Select Trigger...</option>
                {triggerNodes.map(s => <option key={s.node_id} value={s.node_id}>{s.device_name || s.node_id} ({s.device_type})</option>)}
              </select>
            </div>

            <div className="w-40">
              <label className="block text-xs font-medium text-slate-500 mb-1">Key</label>
              <select disabled={!hasSelectedSensor} className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                value={formData.sensor_key} onChange={e => setFormData({...formData, sensor_key: e.target.value})}>
                {!selectedSensorType && <option value="">Select Device First</option>}
                {selectedSensorType === 'occupancy' && <option value="occupancy">Occupancy (Person)</option>}
                {selectedSensorType === 'energy_node' && <option value="power_usage_watts">Power (Watts)</option>}
              </select>
            </div>

            <div className="w-20">
              <label className="block text-xs font-medium text-slate-500 mb-1">OP</label>
              <select disabled={!hasSelectedSensor} className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 font-bold bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                value={formData.condition_operator} onChange={e => setFormData({...formData, condition_operator: e.target.value})}>
                {isBooleanKey ? (
                  <option value="==">==</option>
                ) : (
                  <>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value="==">==</option>
                  </>
                )}
              </select>
            </div>

            <div className="w-32">
              <label className="block text-xs font-medium text-slate-500 mb-1">Value</label>
              {isBooleanKey ? (
                <select disabled={!hasSelectedSensor} className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 font-medium bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  value={formData.condition_value} onChange={e => setFormData({...formData, condition_value: e.target.value})}>
                  <option value="TRUE">TRUE (Detected)</option>
                  <option value="FALSE">FALSE (Clear)</option>
                </select>
              ) : (
                <input type="number" step="0.1" required placeholder="e.g. 100" disabled={!hasSelectedSensor}
                  className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  value={formData.condition_value} onChange={e => setFormData({...formData, condition_value: e.target.value})} />
              )}
            </div>

            <div className="text-slate-400 font-medium text-sm pb-2">THEN</div>

            <div className="flex-1 min-w-50">
              <label className="block text-xs font-medium text-slate-500 mb-1">Target Device</label>
              <select required disabled={!hasSelectedSensor} className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                value={formData.target_node_id} onChange={e => setFormData({...formData, target_node_id: e.target.value})}>
                <option value="">Select Target...</option>
                {availableTargets.map(c => <option key={c.node_id} value={c.node_id}>{c.device_name || c.node_id}</option>)}
              </select>
            </div>

            <div className="w-24">
              <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
              <select disabled={!hasSelectedSensor} className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                value={formData.action} onChange={e => setFormData({...formData, action: e.target.value})}>
                <option value="ON">Turn ON</option>
                <option value="OFF">Turn OFF</option>
              </select>
            </div>

            <div>
              <button type="submit" disabled={!hasSelectedSensor} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-y border-slate-200">
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Rule Name</th>
              <th className="p-4 font-medium">Condition</th>
              <th className="p-4 font-medium">Action</th>
              <th className="p-4 font-medium text-right">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-8 text-slate-400">No rules configured yet</td></tr>
            ) : (
              rules.map(rule => (
                <tr key={rule.rule_id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <button 
                      onClick={() => toggleRule(rule.rule_id)}
                      className={`w-10 h-5 rounded-full relative flex items-center transition-colors duration-300 ${rule.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${rule.is_active ? 'translate-x-5' : 'translate-x-1'}`}></div>
                    </button>
                  </td>
                  <td className="p-4 font-medium text-slate-800">{rule.name}</td>
                  <td className="p-4 text-sm text-slate-600">
                    IF <span className="font-semibold text-blue-600">{rule.sensor_node_id}</span>'s {rule.sensor_key} <span className="font-bold">{rule.condition_operator} {rule.condition_value}</span>
                  </td>
                  <td className="p-4 text-sm text-slate-600 flex items-center gap-1.5 mt-3">
                    <span className={`font-semibold flex items-center gap-1 ${rule.action === 'ON' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      <Power size={14} />
                      {rule.action}
                    </span> 
                    <span className="font-semibold">{rule.target_node_id}</span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => deleteRule(rule.rule_id)} className="text-red-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
