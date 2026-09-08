import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4050';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60s timeout for network SSH commands
});

export const getSupportedDeviceTypes = async () => {
  const response = await apiClient.get('/devices/types');
  return response.data;
};

export const getAvailableSerialPorts = async () => {
  const response = await apiClient.get('/devices/serial-ports');
  return response.data;
};

export const testDeviceConnection = async (device) => {
  const response = await apiClient.post('/devices/test-connection', device);
  return response.data;
};

export const detectSingleDeviceType = async (device) => {
  const response = await apiClient.post('/devices/detect-type', device);
  return response.data;
};

export const detectFleetTypes = async (devices) => {
  const response = await apiClient.post('/devices/detect-fleet', devices);
  return response.data;
};


export const getHealthCheckPresets = async () => {
  const response = await apiClient.get('/healthcheck/presets');
  return response.data;
};

export const runHealthCheck = async (device, checkType = 'standard', commands = [], vendorCommands = {}) => {
  const response = await apiClient.post('/healthcheck/run', {
    device,
    check_type: checkType,
    commands,
    vendor_commands: vendorCommands,
  });
  return response.data;
};

export const runBatchHealthCheck = async (devices, checkType = 'standard', commands = [], vendorCommands = {}, numWorkers = null) => {
  const payload = {
    devices,
    check_type: checkType,
    commands,
    vendor_commands: vendorCommands,
  };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/healthcheck/run-batch', payload);
  return response.data;
};


export const executeTroubleshootCommand = async (device, command, vendorCommands = null) => {
  const response = await apiClient.post('/troubleshoot/execute-command', {
    device,
    command,
    vendor_commands: vendorCommands,
  });
  return response.data;
};

export const executeBatchTroubleshootCommand = async (devices, command = '', vendorCommands = {}, numWorkers = null) => {
  const payload = {
    devices,
    command,
    vendor_commands: vendorCommands,
  };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/troubleshoot/execute-batch', payload);
  return response.data;
};

export const deployConfiguration = async (device, configCommands, saveConfig = true) => {
  const response = await apiClient.post('/deploy/push', {
    device,
    config_commands: configCommands,
    save_config: saveConfig,
  });
  return response.data;
};

export const deployConfigurationAdvanced = async (
  device,
  configCommands,
  saveConfig = true,
  preCheckCommands = [],
  postCheckCommands = [],
  backupBeforeDeploy = false
) => {
  const response = await apiClient.post('/deploy/push-advanced', {
    device,
    config_commands: configCommands,
    save_config: saveConfig,
    pre_check_commands: preCheckCommands,
    post_check_commands: postCheckCommands,
    backup_before_deploy: backupBeforeDeploy,
  });
  return response.data;
};

export const deployConfigurationBatch = async (
  devices,
  configCommands,
  saveConfig = true,
  preCheckCommands = [],
  postCheckCommands = [],
  backupBeforeDeploy = false,
  numWorkers = null
) => {
  const payload = {
    devices,
    config_commands: configCommands,
    save_config: saveConfig,
    pre_check_commands: preCheckCommands,
    post_check_commands: postCheckCommands,
    backup_before_deploy: backupBeforeDeploy,
  };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/deploy/push-batch', payload);
  return response.data;
};

export const backupRunningConfig = async (device) => {
  const response = await apiClient.post('/deploy/backup', {
    device,
  });
  return response.data;
};

export const backupBatchRunningConfig = async (devices, numWorkers = null) => {
  const payload = { devices };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/deploy/backup-batch', payload);
  return response.data;
};


// Template APIs (Level 1 & Level 2)
export const getTemplates = async (vendor = null) => {
  const params = vendor ? { vendor } : {};
  const response = await apiClient.get('/templates', { params });
  return response.data;
};

export const getTemplate = async (templateId) => {
  const response = await apiClient.get(`/templates/${templateId}`);
  return response.data;
};

export const createTemplate = async (templateData) => {
  const response = await apiClient.post('/templates', templateData);
  return response.data;
};

export const updateTemplate = async (templateId, templateData) => {
  const response = await apiClient.put(`/templates/${templateId}`, templateData);
  return response.data;
};

export const deleteTemplate = async (templateId) => {
  const response = await apiClient.delete(`/templates/${templateId}`);
  return response.data;
};

export const executeTemplate = async (device, templateId, commands = null) => {
  const response = await apiClient.post('/templates/execute', {
    device,
    template_id: templateId,
    commands,
  });
  return response.data;
};

// Async Fleet Job APIs (10,000+ Devices Scale)
export const submitTroubleshootJob = async (
  devices,
  command = '',
  vendorCommands = null,
  huaweiCommand = null,
  ciscoCommand = null,
  numWorkers = null,
  commands = [],
  commandRegexes = {}
) => {
  const payload = {
    devices,
    command,
    commands: commands || [],
    command_regexes: commandRegexes || {},
    vendor_commands: vendorCommands,
    huawei_command: huaweiCommand,
    cisco_command: ciscoCommand,
  };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/jobs/submit-troubleshoot', payload);
  return response.data;
};

export const submitDeployJob = async (
  devices,
  configCommands,
  saveConfig = true,
  preCheckCommands = [],
  postCheckCommands = [],
  backupBeforeDeploy = false,
  numWorkers = null
) => {
  const payload = {
    devices,
    config_commands: configCommands,
    save_config: saveConfig,
    pre_check_commands: preCheckCommands,
    post_check_commands: postCheckCommands,
    backup_before_deploy: backupBeforeDeploy,
  };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/jobs/submit-deploy', payload);
  return response.data;
};

export const submitBackupJob = async (devices, numWorkers = null) => {
  const payload = { devices };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/jobs/submit-backup', payload);
  return response.data;
};

export const submitHealthCheckJob = async (
  devices,
  checkType = 'standard',
  commands = [],
  vendorCommands = {},
  suiteName = null,
  numWorkers = null,
  commandRegexes = {}
) => {
  const payload = {
    devices,
    check_type: checkType,
    commands,
    command_regexes: commandRegexes || {},
    vendor_commands: vendorCommands,
    suite_name: suiteName,
  };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/jobs/submit-healthcheck', payload);
  return response.data;
};

// System / Nornir Concurrency Setting APIs
export const getNornirWorkers = async () => {
  const response = await apiClient.get('/system/nornir-workers');
  return response.data;
};

export const setNornirWorkers = async (numWorkers) => {
  const response = await apiClient.post('/system/nornir-workers', { num_workers: numWorkers });
  return response.data;
};



export const getJobStatus = async (jobId) => {
  const response = await apiClient.get(`/jobs/${jobId}/status`);
  return response.data;
};

export const getJobResults = async (jobId, page = 1, pageSize = 50, search = '', statusFilter = 'all') => {
  const response = await apiClient.get(`/jobs/${jobId}/results`, {
    params: {
      page,
      page_size: pageSize,
      search,
      status_filter: statusFilter,
    },
  });
  return response.data;
};

export const getAllJobResults = async (jobId) => {
  const response = await apiClient.get(`/jobs/${jobId}/results/all`);
  return response.data;
};

export const cancelJob = async (jobId) => {
  const response = await apiClient.post(`/jobs/${jobId}/cancel`);
  return response.data;
};

export const downloadJobZip = async (jobId) => {
  const response = await apiClient.get(`/jobs/${jobId}/export-zip`, {
    responseType: 'blob',
  });
  return response.data;
};

export const exportJobZipFile = async (jobId, title = 'fleet_job') => {
  const blob = await downloadJobZip(jobId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fleet_${jobId.slice(0, 8)}_${timestamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
};

export const createJobEventSource = (jobId) => {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4050').replace(/\/$/, '');
  return new EventSource(`${baseUrl}/api/v1/jobs/${jobId}/stream`);
};

export const getPlaybooks = async () => {
  const response = await apiClient.get('/playbooks');
  return response.data;
};

export const createPlaybook = async (payload) => {
  const response = await apiClient.post('/playbooks', payload);
  return response.data;
};

export const updatePlaybook = async (id, payload) => {
  const response = await apiClient.put(`/playbooks/${id}`, payload);
  return response.data;
};

export const autoTranslateCommands = async (payload) => {
  const response = await apiClient.post('/playbooks/auto-translate', payload);
  return response.data;
};

export const deletePlaybook = async (id) => {
  const response = await apiClient.delete(`/playbooks/${id}`);
  return response.data;
};

export const importDevicesFromFile = async (file, defaultOptions = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  if (defaultOptions.default_device_type) {
    formData.append('default_device_type', defaultOptions.default_device_type);
  }
  if (defaultOptions.default_username) {
    formData.append('default_username', defaultOptions.default_username);
  }
  if (defaultOptions.default_password) {
    formData.append('default_password', defaultOptions.default_password);
  }
  if (defaultOptions.default_port) {
    formData.append('default_port', defaultOptions.default_port);
  }
  if (defaultOptions.default_secret) {
    formData.append('default_secret', defaultOptions.default_secret);
  }

  const response = await apiClient.post('/devices/import', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const downloadInventoryTemplate = (formatName) => {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4050').replace(/\/$/, '');
  window.open(`${baseUrl}/api/v1/devices/templates/${formatName}`, '_blank');
};


// --- Credential Profiles APIs ---
export const getCredentialProfiles = async () => {
  const response = await apiClient.get('/profiles');
  return response.data;
};

export const createCredentialProfile = async (profileData) => {
  const response = await apiClient.post('/profiles', profileData);
  return response.data;
};

export const updateCredentialProfile = async (id, profileData) => {
  const response = await apiClient.put(`/profiles/${id}`, profileData);
  return response.data;
};

export const deleteCredentialProfile = async (id) => {
  const response = await apiClient.delete(`/profiles/${id}`);
  return response.data;
};

export const setDefaultCredentialProfile = async (id) => {
  const response = await apiClient.post(`/profiles/${id}/default`);
  return response.data;
};

export default apiClient;



