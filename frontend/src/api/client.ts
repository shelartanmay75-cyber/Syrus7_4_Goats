import {
  Universe,
  RunRequest,
  ScreenInfo,
  JobStatus,
  Study,
  StudySummary,
  Scenario,
  StressResult,
  ScenariosResponse,
  StressEvaluateRequest,
  StressCompareRequest,
  PortfolioComparisonItem
} from './types';

import {
  mockGetUniverse,
  mockPostScreen,
  mockStartRun,
  mockGetRun,
  mockCancelRun,
  mockListStudies,
  mockGetStudy,
  mockGetStressScenarios,
  mockEvaluateStress,
  mockCompareStress
} from './mock';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === '1';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

// One place for every call: a plain-language message for network failures, FastAPI errors and non-JSON replies.
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const fullUrl = `${API_BASE_URL}${url}`;
  try {
    res = await fetch(fullUrl, init);
  } catch {
    const target = API_BASE_URL || 'http://localhost:8000';
    throw new Error(`Cannot reach the server. Check that the backend is running on ${target}.`);
  }
  if (!res.ok) {
    let msg = `The server returned an error (${res.status}).`;
    try {
      const data = await res.json();
      const d = data?.detail;
      if (typeof d === 'string') msg = d;
      else if (Array.isArray(d)) msg = d.map((e: any) => e?.msg ?? String(e)).join('; ');
    } catch {
      // body was not JSON: keep the generic message
    }
    throw new Error(msg);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('The server sent a reply that could not be read.');
  }
}

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export async function getHealth(): Promise<{ ok: boolean; version: string }> {
  if (USE_MOCKS) return { ok: true, version: '0.1.0' };
  return request<{ ok: boolean; version: string }>('/api/health');
}

export async function getUniverse(): Promise<Universe> {
  if (USE_MOCKS) return mockGetUniverse();
  return request<Universe>('/api/universe');
}

export async function postScreen(req: RunRequest): Promise<ScreenInfo> {
  if (USE_MOCKS) return mockPostScreen(req);
  return request<ScreenInfo>('/api/screen', postJson(req));
}

export async function startRun(req: RunRequest): Promise<{ job_id: string }> {
  if (USE_MOCKS) return mockStartRun(req);
  return request<{ job_id: string }>('/api/runs', postJson(req));
}

export async function getRun(jobId: string): Promise<JobStatus> {
  if (USE_MOCKS) return mockGetRun(jobId);
  return request<JobStatus>(`/api/runs/${encodeURIComponent(jobId)}`);
}

export async function cancelRun(jobId: string): Promise<JobStatus> {
  if (USE_MOCKS) return mockCancelRun(jobId);
  return request<JobStatus>(`/api/runs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
}

export async function listStudies(): Promise<StudySummary[]> {
  if (USE_MOCKS) return mockListStudies();
  return request<StudySummary[]>('/api/studies');
}

export async function getStudy(id: string): Promise<Study> {
  if (USE_MOCKS) return mockGetStudy(id);
  return request<Study>(`/api/studies/${encodeURIComponent(id)}`);
}

// ============================================================================
// Stress Testing Client Methods (Market Crash Stress Testing USP)
// ============================================================================
export async function getStressScenarios(): Promise<ScenariosResponse> {
  if (USE_MOCKS) return mockGetStressScenarios();
  return request<ScenariosResponse>('/api/stress/scenarios');
}

export async function evaluateStress(req: StressEvaluateRequest): Promise<StressResult> {
  if (USE_MOCKS) return mockEvaluateStress(req);
  return request<StressResult>('/api/stress/evaluate', postJson(req));
}

export async function compareStress(req: StressCompareRequest): Promise<PortfolioComparisonItem[]> {
  if (USE_MOCKS) return mockCompareStress(req);
  return request<PortfolioComparisonItem[]>('/api/stress/compare', postJson(req));
}

