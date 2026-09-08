import React, { useState, useEffect, useRef } from 'react';
import {
  Network,
  CheckCircle2,
  Loader2,
  Layers,
  Plus,
  Trash2,
  KeyRound,
  FileUp,
  Download,
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  FileText,
  X,
  AlertCircle,
  Check,
  Compass,
  UserCheck,
  Settings,
  Eye,
  EyeOff,
  Star,
  Edit2,
  ListOrdered,
  ShieldAlert,
  ShieldCheck,
  Search,
  ChevronUp,
  ChevronDown,
  Shield,
  Lock,
} from 'lucide-react';
import {
  getSupportedDeviceTypes,
  importDevicesFromFile,
  downloadInventoryTemplate,
  detectFleetTypes,
  getCredentialProfiles,
  createCredentialProfile,
  updateCredentialProfile,
  deleteCredentialProfile,
  setDefaultCredentialProfile,
} from '../services/api';
import NornirWorkersControl from './NornirWorkersControl';
import './DeviceForm.css';

export default function DeviceForm({
  fleet = [],
  setFleet,
  nornirWorkers = 10,
  onUpdateWorkers,
}) {
  const [commonType, setCommonType] = useState('autodetect');
  const [commonUser, setCommonUser] = useState('');
  const [commonPass, setCommonPass] = useState('');
  const [detectingFleet, setDetectingFleet] = useState(false);

  // Host IP Search & Edit State
  const [hostSearchQuery, setHostSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [editForm, setEditForm] = useState({
    host: '',
    port: 22,
    device_type: 'autodetect',
    username: '',
    password: '',
    secret: '',
    profile_id: '',
  });
  const [editSuccessToast, setEditSuccessToast] = useState('');
  const searchContainerRef = useRef(null);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    if (showSearchDropdown) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showSearchDropdown]);

  // Profiles State
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState('list'); // 'list' | 'edit'
  const [editingProfile, setEditingProfile] = useState(null);
  const [showProfilePassMap, setShowProfilePassMap] = useState({});
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showFormSecret, setShowFormSecret] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  // Fleet Pool Modal State
  const [showFleetPoolModal, setShowFleetPoolModal] = useState(false);
  const [fleetPrio1Id, setFleetPrio1Id] = useState('');
  const [fleetPrio2Id, setFleetPrio2Id] = useState('');
  const [fleetPrio3Id, setFleetPrio3Id] = useState('');

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState('replace'); // 'replace' | 'append'
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null);

  // Fallback credentials for import if missing in file
  const [fallbackType, setFallbackType] = useState('autodetect');
  const [fallbackUser, setFallbackUser] = useState('');
  const [fallbackPass, setFallbackPass] = useState('');
  const [fallbackPort, setFallbackPort] = useState(22);
  const [fallbackSecret, setFallbackSecret] = useState('');

  const fileInputRef = useRef(null);

  const [deviceTypes, setDeviceTypes] = useState([
    { label: 'Auto Detect (Recommended)', value: 'autodetect' },
    { label: 'Huawei VRP (SSH)', value: 'huawei' },
    { label: 'Huawei VRP (Telnet)', value: 'huawei_telnet' },
    { label: 'Cisco IOS / IOS-XE (SSH)', value: 'cisco_ios' },
    { label: 'Cisco IOS (Telnet)', value: 'cisco_ios_telnet' },
    { label: 'HP / H3C Comware', value: 'hp_comware' },
    { label: 'Aruba OS-CX', value: 'aruba_os' },
    { label: 'Juniper JunOS', value: 'juniper_junos' },
  ]);

  useEffect(() => {
    getSupportedDeviceTypes()
      .then((data) => {
        if (data && data.device_types) {
          setDeviceTypes(data.device_types);
        }
      })
      .catch(() => console.log('Using default device types list'));

    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const data = await getCredentialProfiles();
      if (Array.isArray(data) && data.length > 0) {
        setProfiles(data);
        const def = data.find((p) => p.is_default) || data[0];
        if (def) {
          setSelectedProfileId((prev) => prev || def.id);
          setCommonType(def.device_type || 'autodetect');
          const prio1 = (def.credentials && def.credentials[0]) || def;
          setCommonUser(prio1.username || '');
          setCommonPass(prio1.password || '');
          setFleetPrio1Id(def.id);

          // Automatically assign default profile to any fleet device without profile_id
          setFleet((prev) =>
            prev.map((d) =>
              d.profile_id
                ? d
                : {
                    ...d,
                    profile_id: def.id,
                    credential_pool: def.credentials && def.credentials.length > 0 ? def.credentials : null,
                    username: d.username || prio1.username || '',
                    password: d.password || prio1.password || '',
                    secret: d.secret !== undefined && d.secret !== '' ? d.secret : (prio1.secret || ''),
                    device_type:
                      d.device_type && d.device_type !== 'autodetect'
                        ? d.device_type
                        : (def.device_type || 'autodetect'),
                  }
            )
          );
        }

        // Set default 2nd and 3rd priority candidates if available
        if (data.length > 1) {
          setFleetPrio2Id(data[1].id);
        }
        if (data.length > 2) {
          setFleetPrio3Id(data[2].id);
        }
      }
    } catch (err) {
      console.error('Failed to load credential profiles:', err);
    }
  };

  const handleApplyProfileToFleet = (profileId) => {
    setSelectedProfileId(profileId);
    if (!profileId || profileId === 'custom') {
      setFleet((prev) =>
        prev.map((d) => ({
          ...d,
          profile_id: null,
          credential_pool: null,
        }))
      );
      return;
    }

    const prof = profiles.find((p) => p.id === profileId);
    if (!prof) return;

    const prio1 = (prof.credentials && prof.credentials[0]) || prof;
    setCommonType(prof.device_type || commonType);
    setCommonUser(prio1.username || '');
    setCommonPass(prio1.password || '');

    setFleet((prev) =>
      prev.map((d) => ({
        ...d,
        device_type: prof.device_type && prof.device_type !== 'autodetect' ? prof.device_type : d.device_type,
        username: prio1.username || '',
        password: prio1.password || '',
        secret: prio1.secret !== undefined && prio1.secret !== '' ? prio1.secret : (d.secret || ''),
        profile_id: prof.id,
        credential_pool: prof.credentials && prof.credentials.length > 0 ? prof.credentials : null,
      }))
    );
  };

  const activeSelectedProfile = profiles.find((p) => p.id === selectedProfileId);

  const updateFleetDeviceProfile = (deviceId, profileId) => {
    if (profileId === 'custom' || !profileId) {
      setFleet((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, profile_id: null, credential_pool: null, fallback_profile_ids: null } : d))
      );
      return;
    }
    const prof = profiles.find((p) => p.id === profileId);
    if (!prof) return;

    const prio1 = (prof.credentials && prof.credentials[0]) || prof;
    setFleet((prev) =>
      prev.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              device_type: prof.device_type && prof.device_type !== 'autodetect' ? prof.device_type : d.device_type,
              username: prio1.username || '',
              password: prio1.password || '',
              secret: prio1.secret || '',
              profile_id: prof.id,
              credential_pool: prof.credentials && prof.credentials.length > 0 ? prof.credentials : null,
            }
          : d
      )
    );
  };

  // Apply 3-Priority Fallback Pool to all fleet devices
  const handleApplyFleetPoolToAll = () => {
    const pList = [fleetPrio1Id, fleetPrio2Id, fleetPrio3Id].filter(Boolean);
    const p1 = profiles.find((p) => p.id === fleetPrio1Id);

    setFleet((prev) =>
      prev.map((d) => ({
        ...d,
        username: p1 ? p1.username : d.username,
        password: p1 ? p1.password : d.password,
        secret: p1 ? (p1.secret || '') : d.secret,
        device_type: p1 && p1.device_type !== 'autodetect' ? p1.device_type : d.device_type,
        profile_id: p1 ? p1.id : d.profile_id,
        fallback_profile_ids: pList,
      }))
    );

    if (p1) {
      setCommonUser(p1.username || '');
      setCommonPass(p1.password || '');
      setCommonType(p1.device_type || commonType);
    }

    setShowFleetPoolModal(false);
  };

  // Open modal to create brand new profile
  const handleOpenNewProfile = () => {
    setEditingProfile({
      id: null,
      name: '',
      description: '',
      device_type: 'huawei',
      port: 22,
      is_default: false,
      credentials: [
        { priority: 1, label: 'SSH ลำดับที่ 1', username: '', password: '', secret: '' },
        { priority: 2, label: 'SSH ลำดับที่ 2', username: '', password: '', secret: '' },
      ],
      username: '',
      password: '',
      secret: '',
    });
    setProfileError('');
    setProfileSuccess('');
    setProfileModalTab('edit');
  };

  // Open modal to edit existing profile
  const handleOpenEditProfile = (profile) => {
    const creds = (profile.credentials && profile.credentials.length > 0)
      ? profile.credentials
      : [
          {
            priority: 1,
            label: 'SSH ลำดับที่ 1',
            username: profile.username || '',
            password: profile.password || '',
            secret: profile.secret || '',
          },
        ];

    setEditingProfile({
      id: profile.id,
      name: profile.name || '',
      description: profile.description || '',
      device_type: profile.device_type || 'autodetect',
      port: profile.port || 22,
      is_default: !!profile.is_default,
      credentials: creds.map((c, i) => ({
        priority: c.priority || i + 1,
        label: c.label || `SSH ลำดับที่ ${i + 1}`,
        username: c.username || '',
        password: c.password || '',
        secret: c.secret || '',
      })),
      username: profile.username || '',
      password: profile.password || '',
      secret: profile.secret || '',
    });
    setProfileError('');
    setProfileSuccess('');
    setProfileModalTab('edit');
  };

  const handleAddProfileCredential = () => {
    if (!editingProfile) return;
    const creds = editingProfile.credentials || [];
    const nextPrio = creds.length + 1;
    setEditingProfile((prev) => ({
      ...prev,
      credentials: [
        ...creds,
        {
          priority: nextPrio,
          label: `SSH ลำดับที่ ${nextPrio}`,
          username: '',
          password: '',
          secret: '',
        },
      ],
    }));
  };

  const handleRemoveProfileCredential = (index) => {
    if (!editingProfile) return;
    const creds = [...(editingProfile.credentials || [])];
    if (creds.length <= 1) {
      alert('Profile must have at least 1 credential tier.');
      return;
    }
    creds.splice(index, 1);
    const reindexed = creds.map((c, i) => ({
      ...c,
      priority: i + 1,
    }));
    setEditingProfile((prev) => ({
      ...prev,
      credentials: reindexed,
    }));
  };

  const handleMoveProfileCredential = (index, direction) => {
    if (!editingProfile) return;
    const creds = [...(editingProfile.credentials || [])];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= creds.length) return;

    const temp = creds[index];
    creds[index] = creds[targetIdx];
    creds[targetIdx] = temp;

    const reindexed = creds.map((c, i) => ({
      ...c,
      priority: i + 1,
    }));

    setEditingProfile((prev) => ({
      ...prev,
      credentials: reindexed,
    }));
  };

  const handleUpdateProfileCredential = (index, field, value) => {
    if (!editingProfile) return;
    const creds = [...(editingProfile.credentials || [])];
    creds[index] = {
      ...creds[index],
      [field]: value,
    };
    setEditingProfile((prev) => ({
      ...prev,
      credentials: creds,
    }));
  };

  // Save or update profile via API
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editingProfile || !editingProfile.name.trim()) {
      setProfileError('Profile name is required.');
      return;
    }

    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const p1 = editingProfile.credentials?.[0] || {};
      const payload = {
        ...editingProfile,
        username: p1.username || '',
        password: p1.password || '',
        secret: p1.secret || '',
      };

      if (editingProfile.id) {
        const updated = await updateCredentialProfile(editingProfile.id, payload);
        setProfileSuccess(`Profile "${updated.name}" updated successfully.`);
      } else {
        const created = await createCredentialProfile(payload);
        setProfileSuccess(`Profile "${created.name}" created successfully.`);
      }

      await loadProfiles();
      setTimeout(() => {
        setProfileModalTab('list');
        setProfileSuccess('');
      }, 700);
    } catch (err) {
      setProfileError(err.response?.data?.detail || err.message || 'Failed to save profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  // Delete profile via API
  const handleDeleteProfile = async (profileId, profileName) => {
    if (!window.confirm(`Are you sure you want to delete profile "${profileName}"?`)) return;

    try {
      await deleteCredentialProfile(profileId);
      if (selectedProfileId === profileId) {
        setSelectedProfileId('custom');
      }
      await loadProfiles();
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Failed to delete profile.');
    }
  };

  // Set default profile via API
  const handleSetDefaultProfile = async (profileId) => {
    try {
      await setDefaultCredentialProfile(profileId);
      await loadProfiles();
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Failed to set default profile.');
    }
  };

  // Fleet Handlers
  const updateFleetDevice = (id, field, value) => {
    setFleet((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  // Matching devices for search dropdown (across fleet)
  const matchingDevices = (() => {
    const q = (hostSearchQuery || '').trim().toLowerCase();
    if (!q) return [];
    const results = [];

    fleet.forEach((dev, idx) => {
      if (dev && ((dev.host && dev.host.toLowerCase().includes(q)) || (dev.name && dev.name.toLowerCase().includes(q)))) {
        results.push({
          ...dev,
          originalHost: dev.host,
          fleetIndex: idx,
          uniqueKey: `fleet-${dev.id || idx}`,
        });
      }
    });

    return results;
  })();

  // Filtered fleet for table display
  const filteredFleet = hostSearchQuery.trim()
    ? fleet.filter((dev) => (dev.host && dev.host.toLowerCase().includes(hostSearchQuery.trim().toLowerCase())) || (dev.name && dev.name.toLowerCase().includes(hostSearchQuery.trim().toLowerCase())))
    : fleet;

  const handleOpenEditDevice = (dev) => {
    setEditingDevice(dev);
    setEditForm({
      name: dev.name || '',
      host: dev.host || '',
      port: dev.port || 22,
      device_type: dev.device_type || 'autodetect',
      username: dev.username || '',
      password: dev.password || '',
      secret: dev.secret || '',
      profile_id: dev.profile_id || '',
    });
    setShowSearchDropdown(false);
  };

  const handleSaveEditedDevice = (e) => {
    e.preventDefault();
    if (!editingDevice) return;
    const newHost = (editForm.host || '').trim();
    if (!newHost) {
      alert('Host / IP Address cannot be empty');
      return;
    }

    const oldHost = editingDevice.originalHost || editingDevice.host;

    setFleet((prev) =>
      prev.map((d) => (d.id === editingDevice.id ? { ...d, ...editForm, host: newHost } : d))
    );
    setEditSuccessToast(`Updated Fleet Host IP: ${oldHost} -> ${newHost}`);

    setEditingDevice(null);
    setTimeout(() => setEditSuccessToast(''), 3500);
  };

  const handleQuickAddSearchedHost = (ipToAdd) => {
    const newId = `dev-${Date.now()}`;
    const newDev = {
      id: newId,
      host: ipToAdd,
      port: fallbackPort || 22,
      device_type: commonType || 'autodetect',
      username: commonUser || '',
      password: commonPass || '',
      secret: fallbackSecret || '',
    };
    setFleet((prev) => [newDev, ...prev]);
    setHostSearchQuery(ipToAdd);
    setShowSearchDropdown(false);
    setEditSuccessToast(`Added ${ipToAdd} to fleet device list`);
    setTimeout(() => setEditSuccessToast(''), 3000);
  };

  const addFleetDevice = () => {
    const newId = `dev-${Date.now()}`;
    const defProf = profiles.find((p) => p.id === selectedProfileId) || profiles.find((p) => p.is_default);
    const pool = [fleetPrio1Id, fleetPrio2Id, fleetPrio3Id].filter(Boolean);
    const prio1 = (defProf?.credentials && defProf.credentials[0]) || defProf;
    setFleet((prev) => [
      ...prev,
      {
        id: newId,
        host: '',
        port: defProf?.port || 22,
        device_type: defProf?.device_type || commonType || 'autodetect',
        username: prio1?.username || commonUser,
        password: prio1?.password || commonPass,
        secret: prio1?.secret || '',
        profile_id: defProf?.id || null,
        credential_pool: defProf?.credentials && defProf.credentials.length > 0 ? defProf.credentials : null,
        fallback_profile_ids: pool.length > 0 ? pool : null,
      },
    ]);
  };

  const handleDetectFleet = async () => {
    const validDevices = fleet.filter((d) => d.host && d.host.trim());
    if (validDevices.length === 0) {
      alert('Please enter at least one IP address in the fleet list.');
      return;
    }
    setDetectingFleet(true);
    try {
      const res = await detectFleetTypes(validDevices);
      if (res && res.results) {
        const map = {};
        res.results.forEach((r) => {
          if (r.id) map[r.id] = r.device_type;
          else if (r.host) map[r.host] = r.device_type;
        });
        setFleet((prev) =>
          prev.map((d) => {
            const detected = map[d.id] || map[d.host];
            return detected ? { ...d, device_type: detected } : d;
          })
        );
      }
    } catch (err) {
      console.error('Fleet type detection failed:', err);
    } finally {
      setDetectingFleet(false);
    }
  };

  const removeFleetDevice = (id) => {
    setFleet((prev) => prev.filter((d) => d.id !== id));
  };

  const clearAllFleetDevices = () => {
    if (window.confirm('Are you sure you want to clear all devices from the fleet?')) {
      setFleet([]);
    }
  };

  const applyTypeToAll = () => {
    if (!commonType) return;
    setFleet((prev) =>
      prev.map((d) => ({
        ...d,
        device_type: commonType,
      }))
    );
  };

  // File Import Logic
  const handleOpenImportModal = () => {
    setImportFile(null);
    setParsedPreview(null);
    setImportError('');
    setImportSuccess('');
    setFallbackType(commonType || 'huawei');
    setFallbackUser(commonUser || '');
    setFallbackPass(commonPass || '');
    setFallbackPort(22);
    setFallbackSecret('');
    setShowImportModal(true);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = async (file) => {
    setImportFile(file);
    setImportError('');
    setImportSuccess('');
    setImportLoading(true);

    try {
      const data = await importDevicesFromFile(file, {
        default_device_type: fallbackType,
        default_username: fallbackUser,
        default_password: fallbackPass,
        default_port: fallbackPort,
        default_secret: fallbackSecret,
      });

      setParsedPreview(data);
    } catch (err) {
      setImportError(err.response?.data?.detail || err.message || 'Failed to parse file.');
      setParsedPreview(null);
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = () => {
    if (!parsedPreview || !parsedPreview.devices || parsedPreview.devices.length === 0) {
      setImportError('No valid devices to import.');
      return;
    }

    const newDevices = parsedPreview.devices;
    const prof = profiles.find((p) => p.id === selectedProfileId) || profiles.find((p) => p.is_default) || profiles[0];
    const prio1 = prof?.credentials?.[0] || prof;
    const pool = [fleetPrio1Id, fleetPrio2Id, fleetPrio3Id].filter(Boolean);
    const fallbackIds = pool.length > 0 ? pool : null;

    const formatDevice = (d, id) => ({
      id: id || d.id || `dev-${Date.now()}-${Math.random()}`,
      name: d.name || d.hostname || '',
      host: d.host || '',
      port: d.port || prof?.port || 22,
      device_type: d.device_type && d.device_type !== 'autodetect' ? d.device_type : (prof?.device_type || 'autodetect'),
      username: prio1?.username || '',
      password: prio1?.password || '',
      secret: prio1?.secret || '',
      profile_id: prof?.id || null,
      credential_pool: prof?.credentials && prof.credentials.length > 0 ? prof.credentials : null,
      fallback_profile_ids: fallbackIds,
    });

    if (importMode === 'replace') {
      setFleet(newDevices.map((d, i) => formatDevice(d, `dev-${Date.now()}-${i}`)));
    } else {
      const timestamp = Date.now();
      const mapped = newDevices.map((d, i) => formatDevice(d, `dev-${timestamp}-${i}`));
      setFleet((prev) => [...prev.filter((d) => d.host && d.host.trim()), ...mapped]);
    }

    setShowImportModal(false);
  };

  return (
    <div className="device-card">
      {/* Header with Title and Host IP Search Bar */}
      <div className="device-card-header">
        <div className="device-header-title">
          <Layers className="device-header-icon" />
          <h2 className="device-header-text">Fleet Device Inventory ({fleet.filter((d) => d.host).length} Devices)</h2>
        </div>

        {/* Global Host IP Search Bar */}
        <div className="device-search-wrapper" ref={searchContainerRef}>
          <div className="device-search-box">
            <Search className="search-icon h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={hostSearchQuery}
              onChange={(e) => {
                setHostSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => {
                if (hostSearchQuery.trim()) setShowSearchDropdown(true);
              }}
              placeholder="Search Host IP (e.g. 192.168.1.1)..."
              className="device-search-input font-mono"
            />
            {hostSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setHostSearchQuery('');
                  setShowSearchDropdown(false);
                }}
                className="btn-search-clear"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete / Search Results Dropdown */}
          {showSearchDropdown && hostSearchQuery.trim() && (
            <div className="device-search-dropdown">
              <div className="search-dropdown-header">
                <span className="font-semibold text-slate-300">
                  Matching Devices ({matchingDevices.length})
                </span>
                <span className="text-[11px] text-slate-400">Select an action to edit</span>
              </div>

              {matchingDevices.length === 0 ? (
                <div className="search-no-results">
                  <p className="text-xs text-slate-400 mb-2">
                    No devices found with Host IP matching "{hostSearchQuery}"
                  </p>
                  <button
                    type="button"
                    onClick={() => handleQuickAddSearchedHost(hostSearchQuery.trim())}
                    className="btn-quick-add-searched"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add "{hostSearchQuery.trim()}" to Fleet</span>
                  </button>
                </div>
              ) : (
                <div className="search-dropdown-list">
                  {matchingDevices.map((dev) => (
                    <div key={dev.uniqueKey} className="search-result-item">
                      <div className="search-result-info">
                        <div className="flex items-center gap-2">
                          <span className="search-result-ip font-mono">{dev.host}</span>
                          <span className="search-badge badge-fleet">
                            {`Fleet #${dev.fleetIndex + 1}`}
                          </span>
                        </div>
                        <div className="search-result-meta">
                          <span>Type: {dev.device_type}</span>
                          <span>Port: {dev.port || 22}</span>
                          {dev.username && <span>User: {dev.username}</span>}
                        </div>
                      </div>

                      <div className="search-result-actions">
                        <button
                          type="button"
                          onClick={() => handleOpenEditDevice(dev)}
                          className="btn-search-action-edit"
                          title="Edit this Host IP"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>Edit IP</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowSearchDropdown(false);
                            const rowEl = document.getElementById(`fleet-row-${dev.id}`);
                            if (rowEl) {
                              rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              rowEl.classList.add('highlight-pulse');
                              setTimeout(() => rowEl.classList.remove('highlight-pulse'), 2000);
                            }
                          }}
                          className="btn-search-action-jump"
                        >
                          <span>View Row</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Feedback Toast Banner */}
      {editSuccessToast && (
        <div className="edit-toast-banner">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span>{editSuccessToast}</span>
        </div>
      )}

      {/* MULTI-DEVICE FLEET TABLE */}
      <div className="fleet-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        {/* Active SSH Credential Profile Selector on Main Page */}
        <div className="profile-selector-bar">
          <div className="profile-bar-left">
            <Shield className="profile-bar-icon" />
            <span className="profile-bar-label">SSH Credential Profile:</span>
            <select
              value={selectedProfileId}
              onChange={(e) => handleApplyProfileToFleet(e.target.value)}
              className="profile-select font-mono"
              title="Select credential profile for SSH connection across all devices"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.is_default ? '[Default] ' : ''}{p.name} ({p.credentials?.length || 1} Priorities)
                </option>
              ))}
            </select>

            {/* Priority Sequence Pills Strip */}
            {activeSelectedProfile && activeSelectedProfile.credentials && activeSelectedProfile.credentials.length > 0 && (
              <div className="profile-priority-pills">
                {activeSelectedProfile.credentials.map((cred, idx) => (
                  <div key={idx} className="profile-priority-pill" title={`Priority ${cred.priority || idx + 1}: ${cred.username || '(no user)'}`}>
                    <span className={`prio-tag prio-tag-${Math.min(cred.priority || idx + 1, 3)}`}>
                      P{cred.priority || idx + 1}
                    </span>
                    <span className="prio-user font-mono">{cred.username || '(empty)'}</span>
                    {cred.label && <span className="prio-lbl">({cred.label})</span>}
                  </div>
                ))}
              </div>
            )}

            {activeSelectedProfile && (
              <span className="profile-auto-note" title="All SSH credentials are handled exclusively by this profile.">
                <Lock className="h-3 w-3 text-sky-400" />
                <span>SSH Managed via Profile</span>
              </span>
            )}
          </div>

          <div className="profile-bar-right">
            <button
              type="button"
              className="btn-profile-manage"
              onClick={() => {
                setProfileModalTab('list');
                setProfileError('');
                setProfileSuccess('');
                setShowProfileModal(true);
              }}
              title="Manage all user credential profiles"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Profiles ({profiles.length})</span>
            </button>
          </div>
        </div>

        <div className="fleet-header">
          <div className="fleet-header-left">
            <span className="fleet-title">Fleet Device List ({fleet.filter((d) => d.host).length} Devices)</span>
            <NornirWorkersControl
              workers={nornirWorkers}
              onChange={onUpdateWorkers}
            />
          </div>

          {/* Quick Actions Bar */}
          <div className="quick-creds-bar">
            <span className="quick-creds-label">Set All Vendors:</span>
            <select
              value={commonType}
              onChange={(e) => setCommonType(e.target.value)}
              className="quick-select"
              title="Select device driver to apply to all devices in list"
            >
              <option value="autodetect">Auto Detect (Recommended)</option>
              <option value="huawei">Huawei (VRP)</option>
              <option value="cisco_ios">Cisco (IOS/IOS-XE)</option>
              <option value="hp_comware">HP / H3C Comware</option>
              <option value="aruba_os">Aruba OS</option>
              <option value="juniper_junos">Juniper JunOS</option>
            </select>
            <button
              type="button"
              className="quick-apply-btn"
              onClick={applyTypeToAll}
              title="Apply selected vendor driver to all devices in list"
            >
              Apply Driver
            </button>

              <button
                type="button"
                disabled={detectingFleet || fleet.filter((d) => d.host).length === 0}
                className="btn-detect-fleet"
                onClick={handleDetectFleet}
                title="Auto-detect vendor for all devices in list"
              >
                {detectingFleet ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-300" />
                    <span>Detecting...</span>
                  </>
                ) : (
                  <>
                    <Compass className="h-3.5 w-3.5 text-amber-300" />
                    <span>Detect Types</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-add-device"
                onClick={addFleetDevice}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Row</span>
              </button>

              {/* Import Fleet Button */}
              <button
                type="button"
                className="btn-import-fleet"
                onClick={handleOpenImportModal}
                title="Import devices from CSV, Excel (XLSX), JSON, or YAML"
              >
                <FileUp className="h-3.5 w-3.5" />
                <span>Import Fleet</span>
              </button>

              {fleet.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-fleet"
                  onClick={clearAllFleetDevices}
                  title="Clear all devices from the list"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                </button>
              )}
            </div>
          </div>

          {hostSearchQuery.trim() && (
            <div className="fleet-filter-indicator">
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-xs text-slate-300">
                  Filtered by Host IP: <strong className="font-mono text-indigo-300">"{hostSearchQuery}"</strong>
                  {' '}(Showing {filteredFleet.length} of {fleet.length} devices)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHostSearchQuery('')}
                className="btn-clear-filter"
                title="Clear filter and show all devices"
              >
                <X className="h-3.5 w-3.5" />
                <span>Clear Filter</span>
              </button>
            </div>
          )}

          <div className="fleet-table-container">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th style={{ width: '180px' }}>Hostname</th>
                  <th>IP Address (Host)</th>
                  <th style={{ width: '240px' }}>Device Type / Driver</th>
                  <th style={{ width: '100px' }}>Port</th>
                  <th style={{ width: '85px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredFleet.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-slate-400 text-xs">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="h-6 w-6 text-slate-600" />
                        <p>No devices found matching Host IP or Hostname "{hostSearchQuery}"</p>
                        <button
                          type="button"
                          onClick={() => setHostSearchQuery('')}
                          className="text-indigo-400 hover:underline cursor-pointer text-xs"
                        >
                          Clear search filter
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFleet.map((dev, idx) => (
                    <tr key={dev.id} id={`fleet-row-${dev.id}`}>
                      <td style={{ textAlign: 'center' }} className="font-mono text-xs text-slate-500">
                        {idx + 1}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={dev.name || ''}
                          onChange={(e) => updateFleetDevice(dev.id, 'name', e.target.value)}
                          placeholder="e.g. SW-Core-01"
                          className="fleet-input font-mono text-sky-300"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={dev.host}
                          onChange={(e) => updateFleetDevice(dev.id, 'host', e.target.value)}
                          placeholder="e.g. 192.168.1.1"
                          className="fleet-input font-mono"
                        />
                      </td>
                      <td>
                        <select
                          value={dev.device_type}
                          onChange={(e) => updateFleetDevice(dev.id, 'device_type', e.target.value)}
                          className="fleet-select"
                        >
                          <option value="autodetect">Auto Detect</option>
                          <option value="huawei">Huawei (VRP)</option>
                          <option value="cisco_ios">Cisco (IOS/IOS-XE)</option>
                          <option value="hp_comware">HP / H3C Comware</option>
                          <option value="aruba_os">Aruba OS</option>
                          <option value="juniper_junos">Juniper JunOS</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={dev.port || 22}
                          onChange={(e) => updateFleetDevice(dev.id, 'port', parseInt(e.target.value, 10) || 22)}
                          placeholder="22"
                          className="fleet-input font-mono"
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditDevice(dev)}
                            className="btn-edit-row"
                            title="Edit this device settings"
                          >
                            <Edit2 className="h-3.5 w-3.5 text-indigo-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFleetDevice(dev.id)}
                            className="btn-remove-row"
                            title="Remove device from fleet"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>



      {/* ========================================================================= */}
      {/* MANAGE CREDENTIAL PROFILES MODAL                                          */}
      {/* ========================================================================= */}
      {showProfileModal && (
        <div className="modal-backdrop">
          <div className="save-playbook-box profile-modal">
            <div className="save-playbook-header">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-indigo-400" />
                <h3 className="save-playbook-title font-semibold">
                  User Credential Profiles (SSH / Telnet)
                </h3>
              </div>
              <button onClick={() => setShowProfileModal(false)} className="modal-close-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="save-playbook-body">
              {/* Tab Selector */}
              <div className="profile-tab-toggle">
                <button
                  type="button"
                  className={`btn-profile-tab ${profileModalTab === 'list' ? 'active' : ''}`}
                  onClick={() => {
                    setProfileModalTab('list');
                    setProfileError('');
                    setProfileSuccess('');
                  }}
                >
                  Saved Profiles ({profiles.length})
                </button>
                <button
                  type="button"
                  className={`btn-profile-tab ${profileModalTab === 'edit' ? 'active' : ''}`}
                  onClick={handleOpenNewProfile}
                >
                  <Plus className="h-3 w-3 inline mr-1" />
                  {editingProfile?.id ? 'Edit Profile' : 'Add New Profile'}
                </button>
              </div>

              {profileError && (
                <div className="alert-box mb-3">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              {profileSuccess && (
                <div className="alert-box mb-3 text-emerald-400 bg-emerald-950/40 border-emerald-800">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              {/* Tab 1: Profile List */}
              {profileModalTab === 'list' && (
                <div className="profile-list">
                  {profiles.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No profiles saved yet. Click "Add New Profile" to create one.
                    </div>
                  ) : (
                    profiles.map((p) => {
                      const isRevealed = !!showProfilePassMap[p.id];
                      return (
                        <div
                          key={p.id}
                          className={`profile-card-item ${p.is_default ? 'is-default' : ''}`}
                        >
                          <div className="profile-card-top">
                            <div className="profile-card-name-group">
                              <span className="profile-card-name">{p.name}</span>
                              {p.is_default && (
                                <span className="profile-default-badge">
                                  <Star className="h-2.5 w-2.5 fill-indigo-400 text-indigo-400" />
                                  Default
                                </span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono">
                                {(p.credentials?.length || 1)} Priorities
                              </span>
                            </div>

                            <div className="profile-card-actions">
                              <button
                                type="button"
                                className={`btn-profile-card-action ${selectedProfileId === p.id ? 'active-fleet-btn' : ''}`}
                                onClick={() => handleApplyProfileToFleet(p.id)}
                                title="Use this profile for Fleet SSH"
                              >
                                <Shield className="h-3 w-3" />
                                <span>{selectedProfileId === p.id ? 'Active Profile' : 'Select for Fleet'}</span>
                              </button>
                              {!p.is_default && (
                                <button
                                  type="button"
                                  className="btn-profile-card-action"
                                  onClick={() => handleSetDefaultProfile(p.id)}
                                  title="Set as default profile for new devices"
                                >
                                  <Star className="h-3 w-3" />
                                  <span>Set Default</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn-profile-card-action"
                                onClick={() => handleOpenEditProfile(p)}
                                title="Edit this profile"
                              >
                                <Edit2 className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                className="btn-profile-card-action btn-del"
                                onClick={() => handleDeleteProfile(p.id, p.name)}
                                title="Delete profile"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {p.description && (
                            <p className="text-xs text-slate-400">{p.description}</p>
                          )}

                          <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-1 font-mono">
                            <span>Driver: <strong className="text-slate-200">{p.device_type || 'autodetect'}</strong></span>
                            <span>Port: <strong className="text-slate-200">{p.port || 22}</strong></span>
                          </div>

                          {/* Prioritized Credentials Breakdown */}
                          <div className="profile-card-creds-list">
                            {(p.credentials && p.credentials.length > 0 ? p.credentials : [{ priority: 1, username: p.username, password: p.password, label: 'SSH ลำดับที่ 1' }]).map((c, cIdx) => {
                              const credKey = `${p.id}_prio_${cIdx}`;
                              const isCredRevealed = !!showProfilePassMap[credKey];
                              return (
                                <div key={cIdx} className="profile-card-cred-row">
                                  <span className={`card-cred-badge prio-badge-${Math.min(c.priority, 3)}`}>
                                    P{c.priority}
                                  </span>
                                  <span className="card-cred-user font-mono text-xs text-slate-200">
                                    {c.username || '(empty user)'}
                                  </span>
                                  {c.label && (
                                    <span className="card-cred-label text-[11px] text-slate-400">({c.label})</span>
                                  )}
                                  <span className="card-cred-pass font-mono text-xs text-slate-400 flex items-center gap-1 ml-auto">
                                    {isCredRevealed ? (c.password || '(empty)') : (c.password ? '••••••••' : '(no pass)')}
                                    {c.password && (
                                      <button
                                        type="button"
                                        className="btn-toggle-eye"
                                        onClick={() =>
                                          setShowProfilePassMap((prev) => ({
                                            ...prev,
                                            [credKey]: !isCredRevealed,
                                          }))
                                        }
                                        title={isCredRevealed ? 'Hide Password' : 'Show Password'}
                                      >
                                        {isCredRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                      </button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 2: Create / Edit Form */}
              {profileModalTab === 'edit' && editingProfile && (
                <form onSubmit={handleSaveProfile} className="profile-form-grid">
                  {/* Profile Name */}
                  <div className="form-group col-span-full">
                    <label className="form-label">Profile Name *</label>
                    <input
                      type="text"
                      value={editingProfile.name}
                      onChange={(e) =>
                        setEditingProfile((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="e.g. Huawei Core Switch Admin"
                      required
                      className="form-input"
                    />
                  </div>

                  {/* Description */}
                  <div className="form-group col-span-full">
                    <label className="form-label">Description (Optional)</label>
                    <input
                      type="text"
                      value={editingProfile.description}
                      onChange={(e) =>
                        setEditingProfile((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Remarks or location e.g. Data Center Core Switch"
                      className="form-input"
                    />
                  </div>

                  {/* Device Driver */}
                  <div className="form-group">
                    <label className="form-label">Default Device Driver</label>
                    <select
                      value={editingProfile.device_type}
                      onChange={(e) =>
                        setEditingProfile((prev) => ({
                          ...prev,
                          device_type: e.target.value,
                          port: e.target.value.includes('telnet') ? 23 : (prev.port || 22),
                        }))
                      }
                      className="form-select"
                    >
                      {deviceTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Port */}
                  <div className="form-group">
                    <label className="form-label">Default Port</label>
                    <input
                      type="number"
                      value={editingProfile.port}
                      onChange={(e) =>
                        setEditingProfile((prev) => ({
                          ...prev,
                          port: parseInt(e.target.value, 10) || 22,
                        }))
                      }
                      className="form-input font-mono"
                    />
                  </div>

                  {/* Prioritized Credentials Section (Priority 1, 2, 3...) */}
                  <div className="col-span-full profile-credentials-section">
                    <div className="profile-credentials-section-header">
                      <div className="flex items-center gap-2">
                        <ListOrdered className="h-4 w-4 text-sky-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Credentials by Priority (ชุดรหัสผ่านเรียงตามลำดับความสำคัญ)
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono">
                          {(editingProfile.credentials || []).length} Tiers
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-add-prio"
                        onClick={handleAddProfileCredential}
                        title="Add another sequential credential fallback"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Priority</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      ระบบจะลองเชื่อมต่อด้วย SSH ลำดับที่ 1 ก่อน หาก Authentication ล้มเหลวจะ Failover ไปลองลำดับถัดไปอัตโนมัติ
                    </p>

                    <div className="profile-credentials-list">
                      {(editingProfile.credentials || []).map((cred, cIdx) => {
                        const pKey = `form_prio_pass_${cIdx}`;
                        const sKey = `form_prio_sec_${cIdx}`;
                        return (
                          <div key={cIdx} className="profile-cred-card">
                            <div className="profile-cred-card-top">
                              <div className="flex items-center gap-1.5">
                                <span className={`cred-prio-badge prio-badge-${Math.min(cred.priority, 3)}`}>
                                  SSH ลำดับที่ {cred.priority}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    className="btn-move-prio"
                                    onClick={() => handleMoveProfileCredential(cIdx, -1)}
                                    disabled={cIdx === 0}
                                    title="Move priority up (higher precedence)"
                                  >
                                    <ChevronUp className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-move-prio"
                                    onClick={() => handleMoveProfileCredential(cIdx, 1)}
                                    disabled={cIdx === (editingProfile.credentials || []).length - 1}
                                    title="Move priority down (lower precedence)"
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={cred.label || ''}
                                  onChange={(e) => handleUpdateProfileCredential(cIdx, 'label', e.target.value)}
                                  placeholder="หมายเหตุ / Label (เช่น TACACS, Local Admin)"
                                  className="cred-label-input"
                                />
                                {(editingProfile.credentials || []).length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveProfileCredential(cIdx)}
                                    className="btn-del-prio"
                                    title="Remove this priority"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="profile-cred-grid">
                              <div className="form-group">
                                <label className="form-label text-[10px]">Username</label>
                                <input
                                  type="text"
                                  value={cred.username || ''}
                                  onChange={(e) => handleUpdateProfileCredential(cIdx, 'username', e.target.value)}
                                  placeholder="admin"
                                  className="form-input text-xs"
                                />
                              </div>

                              <div className="form-group">
                                <label className="form-label text-[10px]">Password</label>
                                <div className="password-input-wrapper">
                                  <input
                                    type={showProfilePassMap[pKey] ? 'text' : 'password'}
                                    value={cred.password || ''}
                                    onChange={(e) => handleUpdateProfileCredential(cIdx, 'password', e.target.value)}
                                    placeholder="Password"
                                    className="form-input text-xs"
                                  />
                                  <button
                                    type="button"
                                    className="password-eye-btn"
                                    onClick={() => setShowProfilePassMap((prev) => ({ ...prev, [pKey]: !prev[pKey] }))}
                                    title={showProfilePassMap[pKey] ? 'Hide' : 'Show'}
                                  >
                                    {showProfilePassMap[pKey] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              </div>

                              <div className="form-group">
                                <label className="form-label text-[10px]">Enable Secret (Optional)</label>
                                <div className="password-input-wrapper">
                                  <input
                                    type={showProfilePassMap[sKey] ? 'text' : 'password'}
                                    value={cred.secret || ''}
                                    onChange={(e) => handleUpdateProfileCredential(cIdx, 'secret', e.target.value)}
                                    placeholder="Enable secret"
                                    className="form-input text-xs"
                                  />
                                  <button
                                    type="button"
                                    className="password-eye-btn"
                                    onClick={() => setShowProfilePassMap((prev) => ({ ...prev, [sKey]: !prev[sKey] }))}
                                    title={showProfilePassMap[sKey] ? 'Hide' : 'Show'}
                                  >
                                    {showProfilePassMap[sKey] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Default Profile Checkbox */}
                  <div className="col-span-full">
                    <label className="form-checkbox-label">
                      <input
                        type="checkbox"
                        checked={editingProfile.is_default}
                        onChange={(e) =>
                          setEditingProfile((prev) => ({ ...prev, is_default: e.target.checked }))
                        }
                      />
                      <span>Set this as the default profile for new sessions</span>
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div className="col-span-full flex justify-end gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setProfileModalTab('list')}
                      className="btn-modal-cancel"
                    >
                      <X className="h-4 w-4" />
                      <span>Cancel</span>
                    </button>
                    <button
                      type="submit"
                      disabled={profileLoading}
                      className="btn-modal-save"
                    >
                      {profileLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          <span>{editingProfile.id ? 'Update Profile' : 'Save Profile'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IMPORT FLEET MODAL (CSV, XLSX, JSON, YAML)                                */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="save-playbook-box import-fleet-modal">
            <div className="save-playbook-header">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-emerald-400" />
                <h3 className="save-playbook-title font-semibold">
                  Import IP List (CSV, Excel, JSON, YAML, TXT)
                </h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="modal-close-btn">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="save-playbook-body">
              {/* File Dropzone */}
              <div
                className="import-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.xls,.json,.yaml,.yml,.txt"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <UploadCloud className="h-9 w-9 text-indigo-400 mb-2" />
                <p className="text-sm font-medium text-slate-200">
                  {importFile ? importFile.name : 'Click to browse or drag & drop inventory file here'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports <strong className="text-sky-300">Hostname</strong> & <strong className="text-indigo-300">IP address</strong> columns (e.g. hostname, ip). Formats: <strong className="text-indigo-300">CSV</strong>, <strong className="text-emerald-300">Excel (.xlsx)</strong>, <strong className="text-amber-300">JSON</strong>, <strong className="text-sky-300">YAML</strong>, <strong className="text-slate-300">TXT</strong>
                </p>
              </div>

              {/* Sample Templates Bar */}
              <div className="templates-download-bar">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Download className="h-3 w-3" /> Sample Templates:
                </span>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('csv')}
                  className="btn-template-dl"
                  title="Download CSV template with Hostname and IP"
                >
                  <FileText className="h-3 w-3 text-indigo-300" />
                  <span>CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('xlsx')}
                  className="btn-template-dl"
                  title="Download Excel XLSX template with Hostname and IP"
                >
                  <FileSpreadsheet className="h-3 w-3 text-emerald-300" />
                  <span>Excel (XLSX)</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('json')}
                  className="btn-template-dl"
                  title="Download JSON template with Hostname and IP"
                >
                  <FileCode className="h-3 w-3 text-amber-300" />
                  <span>JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadInventoryTemplate('yaml')}
                  className="btn-template-dl"
                  title="Download YAML template with Hostname and IP"
                >
                  <FileCode className="h-3 w-3 text-sky-300" />
                  <span>YAML</span>
                </button>
              </div>

              {/* Profile for Imported Devices */}
              <div className="import-batch-notice">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-300 font-semibold">
                    Profile for Imported Devices:
                  </span>
                  <span className="text-xs font-mono text-indigo-300 font-semibold">
                    {activeSelectedProfile ? activeSelectedProfile.name : 'Default Profile'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                  <span>Vendor: <strong className="text-indigo-300">{fallbackType || commonType || 'huawei'}</strong></span>
                  <span>Port: <strong className="text-slate-200">{fallbackPort || 22}</strong></span>
                  <span className="text-sky-300 font-mono">Credentials: <strong>Profile Managed</strong></span>
                </div>
              </div>

              {/* Import Mode: Replace vs Append */}
              <div className="import-mode-row">
                <label className="text-xs text-slate-300 font-semibold">Import Mode:</label>
                <div className="flex gap-4">
                  <label className="import-radio-label">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span>Replace Current Fleet</span>
                  </label>
                  <label className="import-radio-label">
                    <input
                      type="radio"
                      name="importMode"
                      value="append"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                    />
                    <span>Append to Existing Fleet</span>
                  </label>
                </div>
              </div>

              {/* Status and Error Messages */}
              {importLoading && (
                <div className="py-3 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Parsing file...</span>
                </div>
              )}

              {importError && (
                <div className="alert-box mt-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Preview Table */}
              {parsedPreview && parsedPreview.devices && (
                <div className="import-preview-section">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Successfully parsed {parsedPreview.count} device(s)
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Showing preview (first {Math.min(parsedPreview.devices.length, 5)} rows)
                    </span>
                  </div>

                  <div className="preview-table-container">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Hostname</th>
                          <th>Host / IP</th>
                          <th>Profile</th>
                          <th>Type</th>
                          <th>Port</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedPreview.devices.slice(0, 5).map((d, i) => {
                          const prof = profiles.find((p) => p.id === selectedProfileId) || profiles.find((p) => p.is_default) || profiles[0];
                          return (
                            <tr key={i}>
                              <td className="font-mono text-slate-500">{i + 1}</td>
                              <td className="font-mono text-sky-300">{d.name || '-'}</td>
                              <td className="font-mono font-semibold text-white">{d.host}</td>
                              <td className="text-sky-300 font-mono text-xs">{prof?.name || 'Default'}</td>
                              <td className="text-slate-300">{d.device_type || prof?.device_type || 'autodetect'}</td>
                              <td className="font-mono text-slate-400">{d.port || prof?.port || 22}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="save-playbook-footer">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="btn-modal-cancel"
              >
                <X className="h-4 w-4" />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                disabled={!parsedPreview || !parsedPreview.devices || parsedPreview.devices.length === 0}
                onClick={handleConfirmImport}
                className="btn-modal-save"
              >
                <Check className="h-4 w-4" />
                <span>
                  Confirm Import ({parsedPreview?.count || 0} Devices)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT HOST IP MODAL                                                        */}
      {/* ========================================================================= */}
      {editingDevice && (
        <div className="modal-backdrop" onClick={() => setEditingDevice(null)}>
          <div className="edit-ip-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="edit-ip-modal-header">
              <div className="flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-indigo-400" />
                <h3 className="font-semibold text-white text-sm">Edit Device Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="modal-close-btn"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedDevice} className="edit-ip-modal-body">
              <div className="edit-ip-target-pill">
                <span className="text-slate-400 text-xs">Target Device:</span>
                <span className="font-mono text-xs font-bold text-white">
                  {editingDevice.originalHost || editingDevice.host}
                </span>
                {editingDevice.name && (
                  <span className="text-xs text-sky-300 font-mono font-semibold">
                    ({editingDevice.name})
                  </span>
                )}
                <span className="text-[11px] text-indigo-400">
                  (Fleet Device)
                </span>
              </div>

              <div className="form-group mb-3">
                <label className="form-label font-semibold text-slate-300">
                  Hostname
                </label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. SW-Core-01"
                  className="form-input font-mono text-sky-300"
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label font-semibold text-slate-300">
                  Host / IP Address *
                </label>
                <input
                  type="text"
                  value={editForm.host}
                  onChange={(e) => setEditForm({ ...editForm, host: e.target.value })}
                  placeholder="e.g. 192.168.1.50"
                  className="form-input font-mono"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="form-group">
                  <label className="form-label">Port</label>
                  <input
                    type="number"
                    value={editForm.port || 22}
                    onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value, 10) || 22 })}
                    className="form-input font-mono"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Device Type / Driver</label>
                  <select
                    value={editForm.device_type}
                    onChange={(e) => setEditForm({ ...editForm, device_type: e.target.value })}
                    className="form-select"
                  >
                    {deviceTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="edit-ip-modal-actions">
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="btn-modal-cancel"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  className="btn-modal-save"
                >
                  <Check className="h-4 w-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
