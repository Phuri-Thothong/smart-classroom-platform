import { useState, useEffect, useCallback } from 'react';
import { Settings, Trash2, Power, Plus, Activity } from 'lucide-react';

export default function RuleManager({ devices }) {
  const [rules, setRules] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '', sensor_node_id: '', sensor_key: 'temperature', 
    condition_operator: '>', condition_value: '', 
    target_node_id: '', action: 'ON'
  });

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:8000/rules");
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (error) { 
      console.error("Error fetching rules:", error.message); 
    }
  }, []);

  useEffect(() => { 
    const loadInitialRules = async () => {
      try {
        const res = await fetch("http://localhost:8000/rules");
        if (res.ok) {
          const data = await res.json();
          setRules(data);
        }
      } catch (error) {
        console.error("Error fetching rules:", error.message);
      }
    };
    loadInitialRules(); 
  }, []);

  const sensors = devices.filter(d => d.device_type === 'sensor' || d.device_type === 'occupancy');
  const controllers = devices.filter(d => d.device_type === 'lighting' || d.device_type === 'air_control');

  const toggleRule = async (ruleId) => {
    try {
      const res = await fetch(`http://localhost:8000/rules/${ruleId}/toggle`, { method: 'PUT' });
      if (!res.ok) throw new Error("API returned an error");
      fetchRules();
    } catch (error) { 
      alert(`Failed to toggle rule: ${error.message}`); 
    }
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm("Delete this automation rule?")) return;
    try {
      const res = await fetch(`http://localhost:8000/rules/${ruleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("API returned an error");
      fetchRules();
    } catch (error) { 
      alert(`Failed to delete rule: ${error.message}`); 
    }
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:8000/rules", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          condition_value: parseFloat(formData.condition_value)
        })
      });
      if (!res.ok) throw new Error("Failed to save rule into database");
      setIsAdding(false);
      setFormData({ name: '', sensor_node_id: '', sensor_key: 'temperature', condition_operator: '>', condition_value: '', target_node_id: '', action: 'ON' });
      fetchRules();
    } catch (error) { 
      alert(`Error saving rule: ${error.message}`); 
    }
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
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> {isAdding ? 'Cancel' : 'Create Rule'}
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
              <input type="text" required placeholder="e.g. Turn on AC when hot"
                className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-37.5">
              <label className="block text-xs font-medium text-slate-500 mb-1">IF (Sensor)</label>
              <select required className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.sensor_node_id} onChange={e => setFormData({...formData, sensor_node_id: e.target.value})}>
                <option value="">Select Sensor...</option>
                {sensors.map(s => <option key={s.node_id} value={s.node_id}>{s.device_name || s.node_id}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-500 mb-1">Key</label>
              <select className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.sensor_key} onChange={e => setFormData({...formData, sensor_key: e.target.value})}>
                <option value="temperature">Temp</option>
                <option value="humidity">Humid</option>
                <option value="occupancy">Person</option>
              </select>
            </div>
            <div className="w-16">
              <label className="block text-xs font-medium text-slate-500 mb-1">OP</label>
              <select className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200 font-bold"
                value={formData.condition_operator} onChange={e => setFormData({...formData, condition_operator: e.target.value})}>
                <option value=">">&gt;</option>
                <option value="<">&lt;</option>
                <option value="==">==</option>
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-500 mb-1">Value</label>
              <input type="number" step="0.1" required placeholder="28.0"
                className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.condition_value} onChange={e => setFormData({...formData, condition_value: e.target.value})} />
            </div>
            <div className="text-slate-400 font-medium text-sm pb-2">THEN</div>
            <div className="flex-1 min-w-37.5">
              <label className="block text-xs font-medium text-slate-500 mb-1">Target Device</label>
              <select required className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.target_node_id} onChange={e => setFormData({...formData, target_node_id: e.target.value})}>
                <option value="">Select Target...</option>
                {controllers.map(c => <option key={c.node_id} value={c.node_id}>{c.device_name || c.node_id}</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
              <select className="w-full border-slate-300 rounded-md text-sm p-2 outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.action} onChange={e => setFormData({...formData, action: e.target.value})}>
                <option value="ON">Turn ON</option>
                <option value="OFF">Turn OFF</option>
              </select>
            </div>
            <div>
              <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
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
