/// <reference lib="webworker" />

// self를 명확하게 Worker 스코프로 선언
declare const self: DedicatedWorkerGlobalScope;

let timerId: ReturnType<typeof setInterval> | null = null;

self.onmessage = (e: MessageEvent) => {
    if (e.data === "start") {
        if (timerId) clearInterval(timerId);
        timerId = setInterval(() => {
            self.postMessage("tick");
        }, 1000);
    } else if (e.data === "stop") {
        if (timerId) clearInterval(timerId);
        timerId = null;
    }
};

export {};