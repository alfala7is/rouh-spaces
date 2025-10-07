export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Cache for API responses
const apiCache = new Map<string, { data: any; timestamp: number; ttl: number }>();

// Request cancellation tracking
const activeRequests = new Map<string, AbortController>();

// Utility functions for enhanced API handling
const createCacheKey = (url: string, init: RequestInit): string => {
  return `${init.method || 'GET'}:${url}:${JSON.stringify(init.body || {})}`;
};

const isRetryableError = (error: any): boolean => {
  if (!error.status) return true; // Network errors are retryable
  return [408, 429, 500, 502, 503, 504].includes(error.status);
};

const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const getRetryDelay = (attempt: number): number => {
  return Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff with max 10s
};

export interface ApiOptions extends RequestInit {
  spaceId?: string;
  userId?: string;
  magicToken?: string;
  cache?: boolean;
  cacheTtl?: number; // Cache TTL in milliseconds
  retries?: number;
  timeout?: number;
  skipLogging?: boolean;
}

export async function apiFetch(path: string, options: ApiOptions = {}): Promise<any> {
  const {
    spaceId,
    userId = 'web-user',
    magicToken,
    cache = false,
    cacheTtl = 5 * 60 * 1000, // 5 minutes default
    retries = 3,
    timeout = 30000, // 30 second timeout
    skipLogging = false,
    ...init
  } = options;

  const headers = new Headers(init.headers || {});
  if (spaceId) headers.set('x-space-id', spaceId);
  if (magicToken) headers.set('x-magic-token', magicToken);
  headers.set('x-user-id', userId);

  const url = `${API_URL}${path}`;
  const cacheKey = createCacheKey(url, { ...init, headers });

  // Check cache for GET requests
  if (cache && init.method !== 'POST' && init.method !== 'PUT' && init.method !== 'DELETE') {
    const cached = apiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      if (!skipLogging) console.log('API Cache Hit:', cacheKey);
      return cached.data;
    }
  }

  // Create abort controller for request cancellation
  const requestId = `${Date.now()}-${Math.random()}`;
  const abortController = new AbortController();
  activeRequests.set(requestId, abortController);

  // Add timeout
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeout);

  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (!skipLogging) {
        console.log(`API Request (attempt ${attempt + 1}/${retries + 1}):`, url, init.method || 'GET');
      }

      const res = await fetch(url, {
        ...init,
        headers,
        signal: abortController.signal
      });

      clearTimeout(timeoutId);
      activeRequests.delete(requestId);

      if (!skipLogging) {
        console.log('API Response:', res.status, res.statusText);
      }

      if (!res.ok) {
        let errorText: string;
        try {
          errorText = await res.text();
        } catch {
          errorText = `HTTP ${res.status} ${res.statusText}`;
        }

        if (!skipLogging) {
          console.error('API Error:', res.status, errorText);
        }

        const error = new Error(`API ${res.status}: ${errorText}`);
        (error as any).status = res.status;
        (error as any).statusText = res.statusText;
        (error as any).code = res.status >= 500 ? 'SERVER_ERROR' :
                              res.status === 429 ? 'RATE_LIMIT' :
                              res.status === 408 ? 'TIMEOUT' :
                              res.status >= 400 ? 'CLIENT_ERROR' : 'UNKNOWN_ERROR';

        // Don't retry client errors (4xx except 408, 429)
        if (!isRetryableError(error)) {
          throw error;
        }

        lastError = error;

        if (attempt < retries) {
          const delay = getRetryDelay(attempt);
          if (!skipLogging) {
            console.log(`Retrying request in ${delay}ms...`);
          }
          await sleep(delay);
          continue;
        }

        throw error;
      }

      const data = await res.json();

      // Cache successful responses for cacheable requests
      if (cache && init.method !== 'POST' && init.method !== 'PUT' && init.method !== 'DELETE') {
        apiCache.set(cacheKey, { data, timestamp: Date.now(), ttl: cacheTtl });
      }

      if (!skipLogging) {
        console.log('API Data:', path, data);
      }

      return data;

    } catch (error: any) {
      clearTimeout(timeoutId);
      activeRequests.delete(requestId);

      if (error.name === 'AbortError') {
        const timeoutError = new Error('Request timeout');
        (timeoutError as any).code = 'TIMEOUT';
        throw timeoutError;
      }

      // Network errors
      if (!error.status) {
        (error as any).code = 'NETWORK_ERROR';
      }

      lastError = error;

      if (attempt < retries && isRetryableError(error)) {
        const delay = getRetryDelay(attempt);
        if (!skipLogging) {
          console.log(`Network error, retrying in ${delay}ms...`);
        }
        await sleep(delay);
        continue;
      }

      if (!skipLogging) {
        console.error('[API Client] Request failed after all retries:', error);
      }
      throw error;
    }
  }

  throw lastError;
}

// Function to cancel active requests
export function cancelRequest(requestId?: string): void {
  if (requestId && activeRequests.has(requestId)) {
    activeRequests.get(requestId)?.abort();
    activeRequests.delete(requestId);
  } else {
    // Cancel all active requests
    activeRequests.forEach(controller => controller.abort());
    activeRequests.clear();
  }
}

// Function to clear cache
export function clearApiCache(pattern?: string): void {
  if (pattern) {
    const regex = new RegExp(pattern);
    for (const [key] of apiCache) {
      if (regex.test(key)) {
        apiCache.delete(key);
      }
    }
  } else {
    apiCache.clear();
  }
}

// Template Compilation API Functions

export interface CompileTemplateRequest {
  description: string;
  preview?: boolean;
}

export interface CompileTemplateResponse {
  success: boolean;
  valid: boolean;
  template?: any;
  errors?: string[];
  confidence?: number;
  rawOutput?: string;
  preview?: boolean;
  saved?: boolean;
}

export interface SaveCompiledTemplateRequest {
  compiledTemplate: any;
}

export interface TemplatePreviewRequest {
  template: any;
}

export interface TemplatePreviewResponse {
  success: boolean;
  data: {
    template: {
      id: string;
      name: string;
      description: string;
      version: string;
      isPreview?: boolean;
    };
    coordinationPattern?: {
      express: any;
      explore: any;
      commit: any;
      evidence: any;
      confirm: any;
    };
    sampleFlow: {
      states: Array<{
        name: string;
        type: string;
        description?: string;
        sequence?: number;
        requiredData: Array<{
          name: string;
          type: string;
          required: boolean;
        }>;
      }>;
    };
    participants: Array<{
      role: string;
      description?: string;
      minRequired: number;
      maxAllowed?: number;
      permissions: string[];
    }>;
    dataCollection: Array<{
      field: string;
      type: string;
      required: boolean;
      validation: any;
      sampleValue: any;
    }>;
  };
}

/**
 * Enhanced template compilation with caching and retry logic
 */
export async function compileTemplate(
  spaceId: string,
  request: CompileTemplateRequest,
  options?: {
    timeout?: number;
    retries?: number;
    onProgress?: (stage: string) => void;
  }
): Promise<CompileTemplateResponse> {
  try {
    console.log(`[API Client] Compiling template for space ${spaceId}:`, request.description.substring(0, 100) + '...');

    // Optional progress callback
    options?.onProgress?.('Sending request to AI service...');

    const response = await apiFetch(`/spaces/${spaceId}/templates/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      spaceId,
      timeout: options?.timeout || 60000, // Longer timeout for AI processing
      retries: options?.retries || 2, // Fewer retries for expensive AI calls
    });

    options?.onProgress?.('Processing AI response...');

    console.log(`[API Client] Template compilation response:`, {
      success: response.success,
      valid: response.valid,
      confidence: response.confidence,
    });

    // Clear template-related cache on successful compilation
    clearApiCache(`spaces/${spaceId}/templates`);

    return response;
  } catch (error: any) {
    console.error('[API Client] Template compilation failed:', error);

    // Enhanced error handling with better user messages
    const errorCode = error.code || 'UNKNOWN_ERROR';
    const status = error.status;

    // Provide contextual error messages based on error type
    switch (errorCode) {
      case 'NETWORK_ERROR':
        throw new Error('Unable to connect to the template compilation service. Please check your internet connection and try again.');

      case 'TIMEOUT':
        throw new Error('Template compilation is taking longer than expected. This might be due to high demand. Please try again or simplify your description.');

      case 'RATE_LIMIT':
        throw new Error('Too many compilation requests. Please wait a moment before trying again.');

      case 'SERVER_ERROR':
        if (status === 503) {
          throw new Error('Template compilation service is temporarily unavailable. Please try again in a few minutes.');
        }
        if (status === 502 || status === 504) {
          throw new Error('Gateway timeout occurred. The AI service might be busy. Please try again.');
        }
        throw new Error('Internal server error during template compilation. Our team has been notified.');

      case 'CLIENT_ERROR':
        if (status === 400) {
          throw new Error('Invalid template description. Please provide more details about participants, process steps, and desired outcomes.');
        }
        if (status === 401) {
          throw new Error('Authentication required. Please refresh the page and try again.');
        }
        if (status === 402) {
          throw new Error('AI service quota exceeded. Please contact support to increase your limits.');
        }
        if (status === 403) {
          throw new Error('You don\'t have permission to create templates in this space.');
        }
        break;
    }

    // Fallback for unknown errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Template compilation failed: ${errorMessage}`);
  }
}

/**
 * Enhanced template saving with validation and cache management
 */
export async function saveCompiledTemplate(
  spaceId: string,
  request: SaveCompiledTemplateRequest
): Promise<any> {
  try {
    console.log(`[API Client] Saving compiled template for space ${spaceId}`);

    // Validate request before sending
    if (!request.compiledTemplate) {
      throw new Error('No template data provided for saving');
    }

    const response = await apiFetch(`/spaces/${spaceId}/templates/compile/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      spaceId,
      timeout: 15000, // 15 second timeout for save operations
    });

    console.log(`[API Client] Template saved successfully:`, response.data?.name);

    // Clear relevant cache entries after successful save
    clearApiCache(`spaces/${spaceId}/templates`);

    return response;
  } catch (error: any) {
    console.error('[API Client] Failed to save compiled template:', error);

    // Enhanced error handling for save operations
    if (error.code === 'NETWORK_ERROR') {
      throw new Error('Unable to save template due to network issues. Please check your connection and try again.');
    }
    if (error.status === 409) {
      throw new Error('A template with this name already exists. Please choose a different name.');
    }
    if (error.status === 413) {
      throw new Error('Template data is too large. Please simplify your template structure.');
    }

    throw error;
  }
}

export interface BlueprintChatRequest {
  message: string;
  runId?: string;
  templateId?: string;
  systemPrompt?: string;
}

export interface BlueprintMatchSummary {
  templateId: string;
  name: string;
  description: string;
  category?: string | null;
  score: number;
  matchedKeywords: string[];
}

export interface BlueprintChatResponse {
  message: string;
  suggestedResponse: {
    text: string;
    actions: string[];
    blueprintMatches: BlueprintMatchSummary[];
  };
  runContext?: {
    runId: string;
    status: string;
    currentState?: {
      id: string;
      name: string;
      type: string;
      description?: string | null;
    } | null;
    nextStates: Array<{ id: string; name: string; description?: string | null }>;
    participants: Array<{ id: string; role: string; userId?: string | null }>;
  };
}

export async function requestBlueprintChat(
  spaceId: string,
  payload: BlueprintChatRequest
): Promise<BlueprintChatResponse> {
  if (!payload?.message?.trim()) {
    throw new Error('Chat message is required');
  }

  const response = await apiFetch(`/spaces/${spaceId}/blueprints/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    spaceId,
    timeout: 20000,
  });

  return response as BlueprintChatResponse;
}

export interface DesignerGraphNode {
  id: string;
  label: string;
  type: 'identity' | 'state' | 'slot' | 'policy' | 'signal' | 'automation';
  description?: string;
  meta?: Record<string, any>;
}

export interface DesignerGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  meta?: Record<string, any>;
}

export interface DesignerTurnResponse {
  reply: string;
  summary?: string;
  notes: Record<string, any>;
  graph: {
    nodes: DesignerGraphNode[];
    edges: DesignerGraphEdge[];
  };
  ready: boolean;
  followUps: string[];
}

export interface DesignerTurnPayload {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  notes?: Record<string, any>;
  graph?: Record<string, any>;
  sessionId?: string;
}

export interface DesignerSessionSummary {
  id: string;
  spaceId: string;
  templateId?: string | null;
  title?: string | null;
  status: string;
  summary?: string | null;
  ready: boolean;
  lastReply?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesignerSessionDetail extends DesignerSessionSummary {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  notes: Record<string, any>;
  graph: {
    nodes?: DesignerGraphNode[];
    edges?: DesignerGraphEdge[];
    [key: string]: any;
  };
  followUps: string[];
  metadata?: Record<string, any> | null;
}

export async function requestDesignerTurn(
  spaceId: string,
  payload: DesignerTurnPayload
): Promise<DesignerTurnResponse> {
  const response = await apiFetch(`/spaces/${spaceId}/templates/designer/turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    spaceId,
    timeout: 60000,
    retries: 1,
  });

  return response?.data as DesignerTurnResponse;
}

export async function listDesignerSessions(
  spaceId: string,
  options?: { templateId?: string }
): Promise<DesignerSessionSummary[]> {
  const query = options?.templateId ? `?templateId=${encodeURIComponent(options.templateId)}` : '';
  const response = await apiFetch(`/spaces/${spaceId}/templates/designer/sessions${query}`, {
    method: 'GET',
    spaceId,
    cache: false,
  });
  return (response?.data || []) as DesignerSessionSummary[];
}

export async function createDesignerSession(
  spaceId: string,
  payload: Partial<Omit<DesignerSessionDetail, 'id' | 'spaceId' | 'createdAt' | 'updatedAt'>>
): Promise<DesignerSessionDetail> {
  const response = await apiFetch(`/spaces/${spaceId}/templates/designer/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    spaceId,
  });
  return response?.data as DesignerSessionDetail;
}

export async function getDesignerSession(
  spaceId: string,
  sessionId: string
): Promise<DesignerSessionDetail> {
  const response = await apiFetch(`/spaces/${spaceId}/templates/designer/sessions/${sessionId}`, {
    method: 'GET',
    spaceId,
    cache: false,
  });
  return response?.data as DesignerSessionDetail;
}

export async function updateDesignerSession(
  spaceId: string,
  sessionId: string,
  payload: Partial<Omit<DesignerSessionDetail, 'id' | 'spaceId' | 'createdAt' | 'updatedAt'>>
): Promise<DesignerSessionDetail> {
  const response = await apiFetch(`/spaces/${spaceId}/templates/designer/sessions/${sessionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    spaceId,
  });
  return response?.data as DesignerSessionDetail;
}

export async function deleteDesignerSession(
  spaceId: string,
  sessionId: string
): Promise<void> {
  await apiFetch(`/spaces/${spaceId}/templates/designer/sessions/${sessionId}`, {
    method: 'DELETE',
    spaceId,
  });
}

/**
 * Enhanced template preview generation with caching
 */
export async function previewTemplate(
  spaceId: string,
  request: TemplatePreviewRequest
): Promise<TemplatePreviewResponse> {
  try {
    console.log(`[API Client] Generating template preview for space ${spaceId}`);

    const response = await apiFetch(`/spaces/${spaceId}/templates/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      spaceId,
      timeout: 20000, // 20 second timeout
    });

    console.log(`[API Client] Template preview generated:`, response.data?.template?.name);
    return response;
  } catch (error: any) {
    console.error('[API Client] Failed to generate template preview:', error);

    // Enhanced error handling for preview generation
    if (error.code === 'TIMEOUT') {
      throw new Error('Preview generation is taking too long. Please try again or simplify your template.');
    }
    if (error.status === 422) {
      throw new Error('Invalid template structure. The template data contains validation errors.');
    }

    throw error;
  }
}

/**
 * Get existing template preview by ID
 */
export async function getTemplatePreview(
  spaceId: string,
  templateId: string
): Promise<TemplatePreviewResponse> {
  try {
    console.log(`[API Client] Getting template preview for ${templateId} in space ${spaceId}`);

    const response = await apiFetch(`/spaces/${spaceId}/templates/${templateId}/preview`, {
      method: 'GET',
      spaceId,
    });

    console.log(`[API Client] Template preview retrieved:`, response.data?.template?.name);
    return response;
  } catch (error) {
    console.error(`[API Client] Failed to get template preview for ${templateId}:`, error);
    throw error;
  }
}

/**
 * Enhanced template retrieval with caching and better error handling
 */
export async function getTemplates(
  spaceId: string,
  options?: {
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<any> {
  try {
    const params = new URLSearchParams();
    if (options?.isActive !== undefined) params.set('isActive', String(options.isActive));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const queryString = params.toString();
    const path = `/spaces/${spaceId}/templates${queryString ? `?${queryString}` : ''}`;

    const response = await apiFetch(path, {
      method: 'GET',
      spaceId,
      cache: true, // Enable caching for template lists
      cacheTtl: 5 * 60 * 1000, // 5 minute cache
    });

    console.log(`[API Client] Retrieved ${response.data?.length || 0} templates for space ${spaceId}`);
    return response;
  } catch (error: any) {
    console.error(`[API Client] Failed to get templates for space ${spaceId}:`, error);

    if (error.code === 'NETWORK_ERROR') {
      throw new Error('Unable to fetch templates. Please check your connection and try again.');
    }
    if (error.status === 403) {
      throw new Error('You don\'t have permission to view templates in this space.');
    }
    if (error.status === 404) {
      throw new Error('Space not found or no templates available.');
    }

    throw error;
  }
}

/**
 * Create a new template
 */
export async function createTemplate(
  spaceId: string,
  templateData: any
): Promise<any> {
  try {
    console.log(`[API Client] Creating template for space ${spaceId}:`, templateData.name);

    const response = await apiFetch(`/spaces/${spaceId}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(templateData),
      spaceId,
    });

    console.log(`[API Client] Template created successfully:`, response.data?.name);
    return response;
  } catch (error) {
    console.error('[API Client] Failed to create template:', error);
    throw error;
  }
}

/**
 * Get a specific template by ID
 */
export async function getTemplate(
  spaceId: string,
  templateId: string
): Promise<any> {
  try {
    const response = await apiFetch(`/spaces/${spaceId}/templates/${templateId}`, {
      method: 'GET',
      spaceId,
    });

    console.log(`[API Client] Retrieved template:`, response.data?.name);
    return response;
  } catch (error) {
    console.error(`[API Client] Failed to get template ${templateId}:`, error);
    throw error;
  }
}
