import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Check,
  Terminal as TerminalIcon,
  X,
  RefreshCw,
  Sliders,
  HardDrive,
  Send,
  Square,
} from 'lucide-react';
import {
  getJobStatus,
  getJobResults,
  cancelJob,
  createJobEventSource,
} from '../services/api';
import TerminalOutput, { maskSensitiveCli } from './TerminalOutput';
import './AsyncJobModal.css';

export default function AsyncJobModal({
  jobId,
  title = 'Fleet Automation Job (10,000+ Scale)',
  onClose,
}) {
  // Job Status State
  const [jobStatus, setJobStatus] = useState(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Paginated Results State
  const [resultsData, setResultsData] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingResults, setLoadingResults] = useState(false);

  // Inspected Single Device Result
  const [inspectedDevice, setInspectedDevice] = useState(null);

  const eventSourceRef = useRef(null);

  // 1. Listen to Real-Time SSE Stream
  useEffect(() => {
    if (!jobId) return;

    // Fallback polling helper
    const pollStatus = async () => {
      try {
        const data = await getJobStatus(jobId);
        setJobStatus(data);
        if (data.is_completed) {
          fetchResults(1, pageSize, search, statusFilter);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    try {
      const evtSource = createJobEventSource(jobId);
      eventSourceRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setJobStatus(data);
          if (data.is_completed) {
            evtSource.close();
            fetchResults(1, pageSize, search, statusFilter);
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      evtSource.onerror = (err) => {
        console.warn('SSE stream disconnected, switching to polling fallback');
        evtSource.close();
        const interval = setInterval(() => {
          pollStatus();
        }, 1500);
        return () => clearInterval(interval);
      };
    } catch (e) {
      pollStatus();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [jobId]);

  // 2. Fetch Paginated Results
  const fetchResults = async (newPage = page, newPageSize = pageSize, newSearch = search, newFilter = statusFilter) => {
    if (!jobId) return;
    setLoadingResults(true);
    try {
      const res = await getJobResults(jobId, newPage, newPageSize, newSearch, newFilter);
      setResultsData(res);
      setPage(newPage);
    } catch (err) {
      console.error('Failed to fetch job results:', err);
    } finally {
      setLoadingResults(false);
    }
  };

  // Re-fetch when page/search/filter changes and job is finished or running
  useEffect(() => {
    if (jobStatus) {
      fetchResults(page, pageSize, search, statusFilter);
    }
  }, [page, pageSize, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchResults(1, pageSize, search, statusFilter);
  };

  const handleCancel = async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      await cancelJob(jobId);
      setIsCancelled(true);
    } catch (err) {
      console.error('Failed to cancel job:', err);
    } finally {
      setCancelling(false);
    }
  };

  const progress = jobStatus?.progress_percent || 0;
  const isRunning = jobStatus?.status === 'running' || jobStatus?.status === 'pending';
  const speed = jobStatus?.elapsed_seconds > 0
    ? (jobStatus.completed_devices / jobStatus.elapsed_seconds).toFixed(1)
    : '0.0';

  return (
    <div className="modal-backdrop">
      <div className="async-job-modal-box">
        {/* Modal Header */}
        <div className="async-job-header">
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            ) : jobStatus?.status === 'completed' ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-amber-400" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="async-job-title">{title}</h3>
                <span className="job-id-pill font-mono">ID: {jobId?.substring(0, 8)}...</span>
                <span className={`job-status-pill ${jobStatus?.status || 'pending'}`}>
                  {jobStatus?.status?.toUpperCase() || 'INITIALIZING'}
                </span>
              </div>
              <p className="async-job-subtitle">
                High-Concurrency Nornir Engine Pipeline &bull; Enterprise 10,000+ Devices Concurrency
              </p>
            </div>
          </div>

          <button onClick={onClose} className="modal-close-btn">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Real-time Progress Bar & Stats */}
        <div className="async-job-body">
          <div className="progress-card">
            <div className="progress-header flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">Execution Progress</span>
                <span className="text-xs font-mono text-indigo-400 font-bold">{progress}%</span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {jobStatus?.completed_devices?.toLocaleString() || 0} / {jobStatus?.total_devices?.toLocaleString() || 0} Devices
              </div>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Live Metrics Grid */}
            <div className="job-metrics-grid mt-4">
              <div className="metric-pill">
                <span className="metric-lbl">Total Fleet</span>
                <span className="metric-val font-mono">{jobStatus?.total_devices?.toLocaleString() || 0}</span>
              </div>
              <div className="metric-pill">
                <span className="metric-lbl">Completed</span>
                <span className="metric-val font-mono text-indigo-300">{jobStatus?.completed_devices?.toLocaleString() || 0}</span>
              </div>
              <div className="metric-pill">
                <span className="metric-lbl">Success</span>
                <span className="metric-val font-mono text-emerald-400">{jobStatus?.success_count?.toLocaleString() || 0}</span>
              </div>
              <div className="metric-pill">
                <span className="metric-lbl">Failed</span>
                <span className="metric-val font-mono text-rose-400">{jobStatus?.failed_count?.toLocaleString() || 0}</span>
              </div>
              <div className="metric-pill">
                <span className="metric-lbl">Elapsed Time</span>
                <span className="metric-val font-mono text-amber-300">{jobStatus?.elapsed_seconds || 0}s</span>
              </div>
              <div className="metric-pill">
                <span className="metric-lbl">Throughput</span>
                <span className="metric-val font-mono text-sky-400">{speed} dev/s</span>
              </div>
            </div>

            {/* Cancel Action if running */}
            {isRunning && (
              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="btn-cancel-job"
                >
                  <Square className="h-3.5 w-3.5" />
                  <span>{cancelling ? 'Cancelling...' : 'Cancel Execution'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Search, Filter & Paginated Results List */}
          <div className="job-results-section mt-4">
            <div className="results-control-bar">
              {/* Search Form */}
              <form onSubmit={handleSearchSubmit} className="job-search-form">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search host IP, terminal logs, or errors..."
                  className="job-search-input"
                />
                <button type="submit" className="btn-search-apply">Search</button>
              </form>

              {/* Status Filter Buttons */}
              <div className="filter-group">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                >
                  All ({resultsData?.total_items || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('success')}
                  className={`filter-btn success ${statusFilter === 'success' ? 'active' : ''}`}
                >
                  Success ({jobStatus?.success_count || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('failed')}
                  className={`filter-btn failed ${statusFilter === 'failed' ? 'active' : ''}`}
                >
                  Failed ({jobStatus?.failed_count || 0})
                </button>
              </div>
            </div>

            {/* Results Table */}
            <div className="job-table-wrapper">
              {loadingResults ? (
                <div className="flex items-center justify-center p-8 text-slate-400 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                  <span>Loading batch results...</span>
                </div>
              ) : !resultsData?.results || resultsData.results.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No device records found matching your query.
                </div>
              ) : (
                <table className="job-results-table">
                  <thead>
                    <tr>
                      <th className="w-12">#</th>
                      <th>Device Host IP</th>
                      <th>Status & Reason</th>
                      <th>Command / Task</th>
                      <th>Time</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultsData.results.map((item, idx) => {
                      const itemIdx = (page - 1) * pageSize + idx + 1;
                      const isSuccess = item.success;
                      const errorMsg = item.error || (item.output && item.output.includes('Error:') ? item.output : '');
                      return (
                        <tr key={idx} className={!isSuccess ? 'bg-rose-950/20' : ''}>
                          <td className="font-mono text-xs text-slate-500 whitespace-nowrap">{itemIdx}</td>
                          <td className="font-mono text-xs font-semibold text-white whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{item.host}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`status-tag ${isSuccess ? 'success' : 'failed'}`}>
                                {isSuccess ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                <span>{isSuccess ? 'Success' : 'Failed'}</span>
                              </span>
                              {!isSuccess && errorMsg && (
                                <span className="text-[11px] font-mono text-rose-300 max-w-md truncate block" title={errorMsg}>
                                  Reason: {errorMsg}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="font-mono text-xs text-slate-300 whitespace-nowrap">
                            {item.command || 'Batch Execution'}
                          </td>
                          <td className="font-mono text-xs text-slate-400 whitespace-nowrap">
                            {item.execution_time_seconds || 0}s
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setInspectedDevice(item)}
                              className="btn-inspect-device"
                            >
                              <TerminalIcon className="h-3.5 w-3.5 text-indigo-400" />
                              <span>{isSuccess ? 'View Log' : 'View Error'}</span>
                            </button>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Controls */}
            {resultsData && resultsData.total_pages > 1 && (
              <div className="pagination-footer">
                <div className="text-xs text-slate-400">
                  Showing page <strong className="text-white">{page}</strong> of <strong className="text-white">{resultsData.total_pages}</strong> ({resultsData.total_items.toLocaleString()} total devices)
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                    className="btn-page-nav"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Prev</span>
                  </button>

                  <span className="font-mono text-xs text-slate-300 px-2">
                    {page} / {resultsData.total_pages}
                  </span>

                  <button
                    type="button"
                    disabled={page >= resultsData.total_pages}
                    onClick={() => setPage((prev) => Math.min(prev + 1, resultsData.total_pages))}
                    className="btn-page-nav"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="async-job-footer">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
          >
            Close Window
          </button>
        </div>
      </div>

      {/* Nested Single Device Inspection Modal */}
      {inspectedDevice && (
        <div className="modal-backdrop z-60">
          <div className="confirm-modal-box max-w-4xl">
            <div className="confirm-modal-header">
              <div className="flex items-center gap-2">
                <TerminalIcon className="h-4 w-4 text-indigo-400" />
                <h3 className="confirm-modal-title font-mono">
                  Device Terminal Output &bull; {inspectedDevice.host}
                </h3>
              </div>
              <button onClick={() => setInspectedDevice(null)} className="modal-close-btn">
                ×
              </button>
            </div>
            <div className="p-4" style={{ height: '480px' }}>
              <TerminalOutput
                title={`CLI Output - ${inspectedDevice.host}`}
                command={inspectedDevice.command || 'Task Output'}
                output={maskSensitiveCli(inspectedDevice.output || inspectedDevice.error || 'No content')}
                executionTime={inspectedDevice.execution_time_seconds}
                isError={!inspectedDevice.success}
              />
            </div>
            <div className="confirm-modal-footer">
              <button
                type="button"
                onClick={() => setInspectedDevice(null)}
                className="btn-secondary"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
