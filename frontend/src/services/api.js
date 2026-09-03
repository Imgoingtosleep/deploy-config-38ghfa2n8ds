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

export const getHealthCheckPresets = async () => {
  const response = await apiClient.get('/healthcheck/presets');
  return response.data;
};

export const runHealthCheck = async (device, checkType = 'standard') => {
  const response = await apiClient.post('/healthcheck/run', {
    device,
    check_type: checkType,
  });
  return response.data;
};

export const runBatchHealthCheck = async (devices, checkType = 'standard') => {
  const response = await apiClient.post('/healthcheck/run-batch', {
    devices,
    check_type: checkType,
  });
  return response.data;
};

export const executeTroubleshootCommand = async (device, command) => {
  const response = await apiClient.post('/troubleshoot/execute-command', {
    device,
    command,
  });
  return response.data;
};

export const executeBatchTroubleshootCommand = async (devices, command = '', vendorCommands = {}) => {
  const response = await apiClient.post('/troubleshoot/execute-batch', {
    devices,
    command,
    vendor_commands: vendorCommands,
  });
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
  backupBeforeDeploy = false
) => {
  const response = await apiClient.post('/deploy/push-batch', {
    devices,
    config_commands: configCommands,
    save_config: saveConfig,
    pre_check_commands: preCheckCommands,
    post_check_commands: postCheckCommands,
    backup_before_deploy: backupBeforeDeploy,
  });
  return response.data;
};

export const backupRunningConfig = async (device) => {
  const response = await apiClient.post('/deploy/backup', {
    device,
  });
  return response.data;
};

export const backupBatchRunningConfig = async (devices) => {
  const response = await apiClient.post('/deploy/backup-batch', {
    devices,
  });
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
  command,
  vendorCommands = null,
  huaweiCommand = null,
  ciscoCommand = null
) => {
  const response = await apiClient.post('/jobs/submit-troubleshoot', {
    devices,
    command,
    vendor_commands: vendorCommands,
    huawei_command: huaweiCommand,
    cisco_command: ciscoCommand,
  });
  return response.data;
};

export const submitDeployJob = async (
  devices,
  configCommands,
  saveConfig = true,
  preCheckCommands = [],
  postCheckCommands = [],
  backupBeforeDeploy = false
) => {
  const response = await apiClient.post('/jobs/submit-deploy', {
    devices,
    config_commands: configCommands,
    save_config: saveConfig,
    pre_check_commands: preCheckCommands,
    post_check_commands: postCheckCommands,
    backup_before_deploy: backupBeforeDeploy,
  });
  return response.data;
};

export const submitBackupJob = async (devices) => {
  const response = await apiClient.post('/jobs/submit-backup', {
    devices,
  });
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

export const cancelJob = async (jobId) => {
  const response = await apiClient.post(`/jobs/${jobId}/cancel`);
  return response.data;
};

export const createJobEventSource = (jobId) => {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:4050/api/v1';
  return new EventSource(`${baseUrl}/jobs/${jobId}/stream`);
};

export default apiClient;
