'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  commitPaidOrder,
  emitSync,
  getOrSeedSharedState,
  subscribeManagerState,
} from './posSync';

/**
 * POS ↔ 점장 대시보드 연동을 React 생명주기에 묶는 얇은 레이어.
 * 통신 방식(localStorage/BroadcastChannel/postMessage)은 sync/posSync.js에만 있고,
 * 이 훅과 그 소비자(usePosState)는 그 구현을 몰라도 된다 — 나중에 실제 API로
 * 바뀌어도 posSync.js만 교체하면 되도록 격리한다.
 */
export function usePosSync() {
  const [managerState, setManagerState] = useState(null);
  const screenRef = useRef('READY');

  useEffect(() => {
    setManagerState(getOrSeedSharedState());
    const unsubscribe = subscribeManagerState(setManagerState);
    emitSync({ type: 'POS_HELLO' });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      emitSync({ type: 'POS_HEARTBEAT', screen: screenRef.current });
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const setScreen = useCallback((screen) => {
    screenRef.current = screen;
  }, []);

  const commitOrder = useCallback((orderInput) => {
    const { order, state } = commitPaidOrder(orderInput);
    setManagerState(state); // 같은 탭에서는 storage 이벤트가 발생하지 않으므로 낙관적으로 반영한다.
    return order;
  }, []);

  return { managerState, setScreen, commitOrder };
}
