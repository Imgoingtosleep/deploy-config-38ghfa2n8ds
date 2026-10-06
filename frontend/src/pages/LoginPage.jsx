import React, { useState } from 'react';
import { loginSSO } from '../services/api';
import { User, Lock, Server, Activity, AlertCircle } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await loginSSO(username, password);
      if (result.success && result.token) {
        localStorage.setItem('sso_token', result.token);
        localStorage.setItem('sso_user', JSON.stringify(result.user));
        onLoginSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 font-sans">
      
      <div className="w-full max-w-md p-8 sm:p-12 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
        
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
              <Server className="w-8 h-8 text-gray-800" strokeWidth={1.5} />
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Deploy Config
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Please sign in to continue
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 flex items-center p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <User className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 sm:text-sm"
                placeholder="Enter your username"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 ml-1">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <Lock className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 sm:text-sm"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-8 flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-medium text-white bg-gray-900 hover:bg-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Activity className="animate-spin -ml-1 mr-2 h-5 w-5" />
                Authenticating...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        
        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-gray-400">
            Protected by SSO Authentication
          </p>
        </div>
      </div>
    </div>
  );
}
