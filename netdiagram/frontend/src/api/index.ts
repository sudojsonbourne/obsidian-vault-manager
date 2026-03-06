import axios from 'axios';
import { GraphData, FilterCriteria, JobStatus, ColumnMapping } from '../types';

const api = axios.create({
  baseURL: '', // uses Vite proxy → backend at :3000
  timeout: 60000,
});

/** Upload device config + traffic log files */
export async function uploadFiles(
  files: File[],
  columnMapping?: ColumnMapping,
  fileTypes?: Record<string, 'config' | 'log'>,
): Promise<{ jobId: string }> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  if (columnMapping) {
    form.append('columnMapping', JSON.stringify(columnMapping));
  }
  if (fileTypes) {
    form.append('fileTypes', JSON.stringify(fileTypes));
  }
  const res = await api.post<{ jobId: string }>('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

/** Poll job status */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await api.get<JobStatus>(`/status/${jobId}`);
  return res.data;
}

/** Fetch the full (unfiltered) graph */
export async function getFullGraph(): Promise<GraphData> {
  const res = await api.get<GraphData>('/graph');
  return res.data;
}

/** Fetch a filtered subgraph */
export async function getFilteredGraph(
  criteria: FilterCriteria,
): Promise<GraphData> {
  const res = await api.post<GraphData>('/graph/filter', criteria);
  return res.data;
}
