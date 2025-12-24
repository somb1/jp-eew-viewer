export const useEEWMonitor = () => {
	// 상태 변수
	const eewData = ref<any>(null);
	const currentDisplayTime = ref<string>("");
	const connectionStatus = ref<"init" | "syncing" | "live" | "error">("init");
	const lastErrorMessage = ref<string | null>(null);

	// 내부 변수
	let timerId: any = null;
	let simulatedTime: Date | null = null;

	// [로직 1] 서버 시간 동기화
	const syncFromServer = async (): Promise<boolean> => {
		try {
			const latestRes = await fetch("/api/latest").then((r) => r.json());
			const newTime = new Date(latestRes.latest_time);

			simulatedTime = newTime;
			currentDisplayTime.value = formatDateToDisplay(newTime);
			lastErrorMessage.value = null;

			console.log("Synced time to:", newTime);
			return true;
		} catch (error: any) {
			console.error("Failed to sync latest time:", error);
			connectionStatus.value = "error";
			lastErrorMessage.value = "Sync Failed";
			return false;
		}
	};

	// [로직 2] 루프 실행
	const startLoop = () => {
		if (timerId) clearInterval(timerId);

		timerId = setInterval(async () => {
			if (!simulatedTime) return;

			// 1초 증가
			simulatedTime.setSeconds(simulatedTime.getSeconds() + 1);

			// UI 업데이트
			const timeParam = formatDateToParam(simulatedTime);
			currentDisplayTime.value = formatDateToDisplay(simulatedTime);

			try {
				const res = await fetch(`/api/eew?time=${timeParam}`).then(
					(r) => {
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
						return r.json();
					}
				);

				eewData.value = res;
				connectionStatus.value = "live";
				lastErrorMessage.value = null;
			} catch (err: any) {
				console.error("EEW Fetch Error", err);
				connectionStatus.value = "error";
				lastErrorMessage.value = "Connection Lost";
			}
		}, 1000);
	};

	// [로직 3] 수동/초기화 핸들러
	const handleManualSync = async () => {
		if (connectionStatus.value === "syncing") return;

		if (timerId) clearInterval(timerId);
		connectionStatus.value = "syncing";

		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	const initEEW = async () => {
		connectionStatus.value = "syncing";
		const success = await syncFromServer();
		if (success) {
			startLoop();
		}
	};

	const stopEEW = () => {
		if (timerId) clearInterval(timerId);
	};

	return {
		eewData,
		currentDisplayTime,
		connectionStatus,
		lastErrorMessage,
		handleManualSync,
		initEEW,
		stopEEW,
	};
};
