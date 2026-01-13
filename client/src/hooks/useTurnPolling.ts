/**
 * Custom hook for waiting for turn completion using long polling
 * 
 * This hook uses long polling to wait for turn completion instead of frequent polling.
 * The server will keep the connection open until the turn is completed.
 */

import { useState, useEffect, useRef } from 'react';

export interface TurnStatus {
  turnId: string;
  turnNumber: number;
  characterInput: string;
  keeperNarrative: string | null;
  status: 'processing' | 'completed' | 'error';
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  sceneId: string | null;
  sceneName: string | null;
  location: string | null;
  isSimulated?: boolean;
  actionResults?: Array<{
    diceRolls?: string[];
    [key: string]: any;
  }>;
}

export interface UseTurnPollingResult {
  turn: TurnStatus | null;
  isPolling: boolean;
  error: string | null;
  startPolling: (turnId: string) => void;
  stopPolling: () => void;
}

export function useTurnPolling(
  apiBaseUrl: string = 'http://localhost:3000/api'
): UseTurnPollingResult {
  const [turn, setTurn] = useState<TurnStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopPolling = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPolling(false);
  };

  const startPolling = async (turnId: string) => {
    // Clear any existing polling
    stopPolling();
    setError(null);
    setTurn(null);

    setIsPolling(true);

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const poll = async () => {
      try {
        // Use long polling: server will wait until turn is completed
        const response = await fetch(`${apiBaseUrl}/turns/${turnId}?wait=true`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch turn status');
        }

        // Log turn data for debugging
        console.log(`[useTurnPolling] Received turn data:`, {
          turnId: data.turn?.turnId,
          turnNumber: data.turn?.turnNumber,
          status: data.turn?.status,
          hasKeeperNarrative: !!data.turn?.keeperNarrative,
          keeperNarrativeLength: data.turn?.keeperNarrative?.length || 0,
        });

        setTurn(data.turn);

        if (data.turn.status === 'error') {
          setError(data.turn.errorMessage || 'Turn processing failed');
          setIsPolling(false);
          abortControllerRef.current = null;
        } else if (data.turn.status === 'processing') {
          // Still processing, continue polling
          console.log(`[useTurnPolling] Turn still processing, continuing to poll...`);
          poll(); // Continue polling recursively
        } else {
          // Completed
          setIsPolling(false);
          abortControllerRef.current = null;
        }
      } catch (err) {
        // Ignore abort errors (user cancelled)
        if (err instanceof Error && err.name === 'AbortError') {
          setIsPolling(false);
          abortControllerRef.current = null;
          return;
        }

        console.error('Error waiting for turn:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsPolling(false);
        abortControllerRef.current = null;
      }
    };

    poll();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  return {
    turn,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
}


