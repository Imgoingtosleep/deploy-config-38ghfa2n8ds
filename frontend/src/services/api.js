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

export const executeTroubleshootCommand = async (device, command) => {
  const response = await apiClient.post('/troubleshoot/execute-command', {
    device,
    command,
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

export default apiClient;
