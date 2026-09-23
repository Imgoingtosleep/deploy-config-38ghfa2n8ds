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

// Scheduled deploy: `schedule` = { runAt, deadline, title, repeat, interval, weekdays, occurrences, repeatUntil }
// runAt / deadline / repeatUntil are Date objects, repeat is 'once' | 'hourly' | 'daily' | 'weekly',
// weekdays is 0=Monday..6=Sunday and occurrences is the total number of runs (null = until cancelled)
export const scheduleDeployJob = async (
  devices,
  configCommands,
  saveConfig,
  preCheckCommands,
  postCheckCommands,
  backupBeforeDeploy,
  numWorkers,
  schedule
) => {
  const payload = {
    devices,
    config_commands: configCommands,
    save_config: saveConfig,
    pre_check_commands: preCheckCommands,
    post_check_commands: postCheckCommands,
    backup_before_deploy: backupBeforeDeploy,
    run_at: schedule.runAt.toISOString(),
    deadline: schedule.deadline ? schedule.deadline.toISOString() : null,
    client_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    client_offset_minutes: -schedule.runAt.getTimezoneOffset(),
    title: schedule.title || null,
    repeat: schedule.repeat || 'once',
    interval: schedule.interval || 1,
    weekdays: schedule.weekdays || [],
    occurrences: schedule.occurrences || null,
    repeat_until: schedule.repeatUntil ? schedule.repeatUntil.toISOString() : null,
  };
  if (numWorkers) payload.num_workers = numWorkers;
  const response = await apiClient.post('/deploy-schedules', payload);
  return response.data;
};

export const getDeploySchedules = async () => {
  const response = await apiClient.get('/deploy-schedules');
  return response.data;
};

export const cancelDeploySchedule = async (id) => {
  const response = await apiClient.post(`/deploy-schedules/${id}/cancel`);
  return response.data;
};

export const runDeployScheduleNow = async (id) => {
  const response = await apiClient.post(`/deploy-schedules/${id}/run-now`);
  return response.data;
};

export const deleteDeploySchedule = async (id) => {
  const response = await apiClient.delete(`/deploy-schedules/${id}`);
  return response.data;
};

export const getDeployScheduleLog = async (id) => {
  const response = await apiClient.get(`/deploy-schedules/${id}/log`, { responseType: 'text' });
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

// --- LLDP Command Profiles (which CLI commands to run, not how to log in) ---
export const getCommandProfiles = async () => {
  const response = await apiClient.get('/command-profiles');
  return response.data;
};

export const createCommandProfile = async (profileData) => {
  const response = await apiClient.post('/command-profiles', profileData);
  return response.data;
};

export const updateCommandProfile = async (id, profileData) => {
  const response = await apiClient.put(`/command-profiles/${id}`, profileData);
  return response.data;
};

export const deleteCommandProfile = async (id) => {
  const response = await apiClient.delete(`/command-profiles/${id}`);
  return response.data;
};

export const reorderCommandProfiles = async (orderedIds) => {
  const response = await apiClient.post('/command-profiles/reorder', { ordered_ids: orderedIds });
  return response.data;
};

// --- LLDP Model Rules (custom regex that reads the model / device type) ---
export const getModelRules = async () => {
  const response = await apiClient.get('/model-rules');
  return response.data;
};

export const createModelRule = async (rule) => {
  const response = await apiClient.post('/model-rules', rule);
  return response.data;
};

export const updateModelRule = async (id, rule) => {
  const response = await apiClient.put(`/model-rules/${id}`, rule);
  return response.data;
};

export const deleteModelRule = async (id) => {
  const response = await apiClient.delete(`/model-rules/${id}`);
  return response.data;
};

// Runs the real backend regex: { model, model_source, role, role_source, keyword_found, draft_matches }
// `samples`: more texts to preview on, answered in the same order under `samples`
export const testModelRules = async (text, rule = null, ruleId = null, samples = []) => {
  const response = await apiClient.post('/model-rules/test', { text, rule, rule_id: ruleId, samples });
  return response.data;
};

export const reorderModelRules = async (orderedIds) => {
  const response = await apiClient.post('/model-rules/reorder', { ordered_ids: orderedIds });
  return response.data;
};

// Re-read models / device types of a result with the current rules, no SSH
export const reparseLldp = async (neighbors, hosts) => {
  const response = await apiClient.post('/lldp/reparse', { neighbors, hosts }, { timeout: 0 });
  return response.data;
};

// --- LLDP Discovery APIs ---
export const discoverLldp = async (
  devices,
  {
    recursive = false,
    maxDepth = 3,
    numWorkers = null,
    enableTcpScan = false,
    scanWorkers = 50,
    tcpTimeout = 1.5,
    commandProfileIds = null,
  } = {}
) => {
  const payload = {
    devices,
    recursive,
    max_depth: maxDepth,
    enable_tcp_scan: enableTcpScan,
    scan_workers: scanWorkers,
    tcp_timeout: tcpTimeout,
  };
  if (commandProfileIds?.length) payload.command_profile_ids = commandProfileIds;
  if (numWorkers) payload.num_workers = numWorkers;
  // SSH loop over every neighbor port can take much longer than the default 60s
  const response = await apiClient.post('/lldp/discover', payload, { timeout: 0 });
  return response.data;
};

export const previewScanTargets = async (targets, exclude = []) => {
  const response = await apiClient.post('/lldp/scan-subnet/preview', { targets, exclude });
  return response.data;
};

export const submitLldpSubnetScan = async (payload) => {
  const response = await apiClient.post('/lldp/scan-subnet', payload);
  return response.data;
};

export const getLldpSubnetScan = async (jobId, { includeReport = false, logLines = 100 } = {}) => {
  const response = await apiClient.get(`/lldp/scan-subnet/${jobId}`, {
    params: { include_report: includeReport, log_lines: logLines },
    timeout: 0,
  });
  return response.data;
};

export const cancelLldpSubnetScan = async (jobId) => {
  const response = await apiClient.post(`/lldp/scan-subnet/${jobId}/cancel`);
  return response.data;
};

export const exportLldpScanZip = async (jobId) => {
  const response = await apiClient.get(`/lldp/scan-subnet/${jobId}/export-zip`, {
    responseType: 'blob',
    timeout: 0,
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lldp_scan_${jobId.slice(0, 8)}_logs.zip`;
  a.click();
  URL.revokeObjectURL(url);
};

export const importLldpTopology = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/lldp/import-topology', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
  });
  return response.data;
};

// Empty LLDP table (.xlsx) that Import turns into a topology
export const downloadLldpTableTemplate = async () => {
  const response = await apiClient.get('/lldp/import-template', { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lldp_table_template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
};

export const exportLldpExcel = async (neighbors, hosts) => {
  const response = await apiClient.post(
    '/lldp/export-excel',
    { neighbors, hosts },
    { responseType: 'blob', timeout: 0 }
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lldp_detailed_report_${timestamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

export default apiClient;




// User-made Deploy Config templates (config text may hold {{VARIABLE}} placeholders)
export const getConfigTemplates = async () => {
  const response = await apiClient.get('/config-templates');
  return response.data;
};

export const createConfigTemplate = async (template) => {
  const response = await apiClient.post('/config-templates', template);
  return response.data;
};

export const updateConfigTemplate = async (id, template) => {
  const response = await apiClient.put(`/config-templates/${id}`, template);
  return response.data;
};

export const deleteConfigTemplate = async (id) => {
  const response = await apiClient.delete(`/config-templates/${id}`);
  return response.data;
};

// Built-in Deploy Config templates the user deleted (keys '<vendor>:<title>')
export const getHiddenBuiltinTemplates = async () => {
  const response = await apiClient.get('/config-templates/builtins/hidden');
  return response.data;
};

export const hideBuiltinTemplate = async (key) => {
  const response = await apiClient.post('/config-templates/builtins/hide', { key });
  return response.data;
};
