export const useEEWMonitor = () => {
	// 상태 변수
	const eewData = ref<any>(null);
	const currentDisplayTime = ref<string>("");
	const connectionStatus = ref<"init" | "syncing" | "live" | "error">("init");
	const lastErrorMessage = ref<string | null>(null);

	// [추가] 포인트 데이터 상태
	const stationPointsData = ref<any>(null);

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
				// ====================================================
				// [수정] 병렬로 EEW 데이터와 포인트 데이터 요청
				// ====================================================
				const eewPromise = fetch(`/api/eew?time=${timeParam}`).then(
					(r) => r.json()
				);

				// 관측소 데이터 요청 (type=jma, source=s 등 필요에 따라 변경 가능)
				const stationsPromise = fetch(
					`/api/realtime_points?time=${timeParam}&type=acmap&source=s`
				).then((r) => {
					if (!r.ok && r.status !== 404)
						throw new Error("Station Fetch Failed");
					return r.json();
				});

				// Promise.allSettled를 사용하여 하나가 실패해도 나머지는 동작하도록 함
				const [eewRes, stationRes] = await Promise.allSettled([
					eewPromise,
					stationsPromise,
				]);

				// 1. EEW 응답 처리
				if (eewRes.status === "fulfilled") {
					eewData.value = eewRes.value;
					connectionStatus.value = "live";
					lastErrorMessage.value = null;
				} else {
					// EEW가 실패하면 에러 처리
					throw eewRes.reason;
				}

				// 2. 관측소 응답 처리
				if (stationRes.status === "fulfilled") {
					stationPointsData.value = stationRes.value;
				}
			} catch (err: any) {
				console.error("Fetch Loop Error", err);
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
		stationPointsData,
		currentDisplayTime,
		connectionStatus,
		lastErrorMessage,
		handleManualSync,
		initEEW,
		stopEEW,
	};
};
